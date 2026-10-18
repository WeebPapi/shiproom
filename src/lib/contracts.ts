import { z } from "zod";

// Shared boundary schemas. Infer TypeScript types from these; do not hand-write duplicates.
// Source of truth for semantics: docs/architecture.md.

export const MAX_TASKS_PER_MEETING = 10;

export const languageSchema = z.enum(["en", "ka"]);
export type Language = z.infer<typeof languageSchema>;
/** English-first build: Georgian stays selectable, English is the default. */
export const DEFAULT_LANGUAGE: Language = "en";

export const meetingKindSchema = z.enum(["scheduled", "huddle", "upload"]);
export const captureStatusSchema = z.enum(["pending", "live", "finalizing", "uploading", "transcribing", "ready", "failed"]);
export const processingStatusSchema = z.enum([
  "not_started",
  "waiting_transcript",
  "resolving_context",
  "needs_context",
  "enriching",
  "extracting",
  "publishing",
  "complete",
  "partial_failure",
  "failed",
]);
export type CaptureStatus = z.infer<typeof captureStatusSchema>;
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;

export const contextModeSchema = z.enum(["selected", "infer", "mixed"]);
export const contextProvenanceSchema = z.enum(["user", "inferred"]);

const id = z.string().trim().min(1).max(128);
const uuid = z.uuid();

// ---------------------------------------------------------------------------
// Identity and team
// ---------------------------------------------------------------------------

export const teamNameSchema = z.string().trim().min(1, "Enter a team name.").max(80, "Use at most 80 characters.");

export const invitationInputSchema = z.object({
  teamId: uuid,
  email: z.email("Enter a valid email address.").trim().toLowerCase().max(254),
});

export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);

export const githubRepositoryNameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, ""))
  .pipe(
    z
      .string()
      .regex(
        /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/(?!\.\.?$)[A-Za-z0-9_.-]{1,100}$/,
        "Use the owner/name form, for example WeebPapi/shiproom.",
      ),
  );

// ---------------------------------------------------------------------------
// Meeting creation and context
// ---------------------------------------------------------------------------

/** A null field means "Let Shiproom figure it out" for that destination. */
export const contextSelectionSchema = z
  .object({
    githubRepositoryId: id.nullable(),
    linearTeamId: id.nullable(),
    linearProjectId: id.nullable(),
  })
  .refine((c) => c.linearProjectId === null || c.linearTeamId !== null, {
    message: "Choose a Linear team before choosing its project.",
    path: ["linearProjectId"],
  });
export type ContextSelection = z.infer<typeof contextSelectionSchema>;

export function contextModeFor(selection: ContextSelection): z.infer<typeof contextModeSchema> {
  const values = [selection.githubRepositoryId, selection.linearTeamId, selection.linearProjectId];
  if (values.every((v) => v !== null)) return "selected";
  if (values.every((v) => v === null)) return "infer";
  return "mixed";
}

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time.");

export const meetingInputSchema = z
  .object({
    teamId: uuid,
    kind: z.enum(["scheduled", "huddle"]),
    title: z.string().trim().min(1, "Enter a title.").max(200),
    agenda: z.string().trim().max(4000).default(""),
    language: languageSchema.default(DEFAULT_LANGUAGE),
    attendeeIds: z.array(uuid).max(50).default([]),
    context: contextSelectionSchema,
    schedule: z
      .object({
        startLocal: localDateTime,
        endLocal: localDateTime,
        timezone: z.string().trim().min(1).max(64),
      })
      .nullable(),
  })
  .refine((m) => (m.kind === "scheduled") === (m.schedule !== null), {
    message: "Scheduled calls need a start, end and timezone.",
    path: ["schedule"],
  });
export type MeetingInput = z.infer<typeof meetingInputSchema>;

// ---------------------------------------------------------------------------
// Transcript (live and upload converge here)
// ---------------------------------------------------------------------------

export const transcriptSegmentSchema = z
  .object({
    id: z.string().min(1).max(64),
    startMs: z.number().int().nonnegative().finite(),
    endMs: z.number().int().nonnegative().finite(),
    speakerUserId: uuid.nullable(),
    speakerLabel: z.string().max(80).nullable(),
    text: z.string().trim().min(1).max(10_000),
  })
  .refine((s) => s.endMs >= s.startMs, { message: "endMs must be >= startMs", path: ["endMs"] });

export const transcriptSchema = z
  .object({
    meetingId: uuid,
    revision: z.number().int().min(1),
    // `browser` is this slice's local-microphone fallback when Daily transcription produces nothing.
    source: z.enum(["daily", "upload", "browser", "demo"]),
    complete: z.boolean(),
    language: languageSchema,
    segments: z.array(transcriptSegmentSchema).max(20_000),
  })
  .refine((t) => new Set(t.segments.map((s) => s.id)).size === t.segments.length, {
    message: "Segment IDs must be unique within a revision.",
    path: ["segments"],
  });
export type Transcript = z.infer<typeof transcriptSchema>;

// ---------------------------------------------------------------------------
// Extraction result (validated before any issue write)
// ---------------------------------------------------------------------------

export const extractedTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((t) => !t.toLowerCase().startsWith("[shiproom]"), "Title must not include the [shiproom] prefix."),
  description: z.string().trim().min(1).max(10_000),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(1_000)).max(20),
  evidenceSegmentIds: z.array(z.string().min(1).max(64)).min(1),
  assigneeUserId: uuid.nullable().optional(),
  existingLinearIssueId: id.nullable().optional(),
  sourceReferences: z.array(z.object({ kind: z.enum(["github", "linear"]), url: z.url() })).max(20).default([]),
});

export const extractionResultSchema = z.object({
  summary: z.string().trim().max(5_000),
  decisions: z.array(z.string().trim().min(1).max(1_000)).max(50),
  openQuestions: z.array(z.string().trim().min(1).max(1_000)).max(50),
  tasks: z.array(extractedTaskSchema),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/**
 * Semantic checks a JSON schema cannot express: evidence must exist in the transcript
 * and the batch must fit the per-meeting limit. Returns human-readable problems.
 */
export function validateExtractionAgainstTranscript(result: ExtractionResult, transcript: Transcript): string[] {
  const problems: string[] = [];
  if (result.tasks.length > MAX_TASKS_PER_MEETING) {
    problems.push(`Extraction produced ${result.tasks.length} tasks; the limit is ${MAX_TASKS_PER_MEETING}.`);
  }
  const segmentIds = new Set(transcript.segments.map((s) => s.id));
  result.tasks.forEach((task, index) => {
    for (const evidenceId of task.evidenceSegmentIds) {
      if (!segmentIds.has(evidenceId)) problems.push(`Task ${index + 1} cites unknown segment ${evidenceId}.`);
    }
  });
  return problems;
}

export const SHIPROOM_TITLE_PREFIX = "[shiproom] ";

const cueSchema = z
  .object({
    speakerLabel: z.string().trim().max(80).nullable(),
    text: z.string().trim().min(1).max(2_000),
    startMs: z.number().int().nonnegative().max(86_400_000),
    endMs: z.number().int().nonnegative().max(86_400_000),
  })
  .refine((cue) => cue.endMs >= cue.startMs, { message: "endMs must be >= startMs", path: ["endMs"] });

/** Browser-captured lines sent when Daily storage does not return a transcript. */
export const liveCaptureSchema = z.object({
  teamId: uuid,
  meetingId: uuid,
  origin: z.enum(["daily-live", "browser"]),
  consented: z.literal(true),
  segments: z.array(cueSchema).max(500),
});
export type LiveCapture = z.infer<typeof liveCaptureSchema>;
