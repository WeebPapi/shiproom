import { SHIPROOM_TITLE_PREFIX, transcriptSchema, type Transcript } from "./contracts";

export type Cue = { speakerLabel: string | null; text: string; startMs: number; endMs: number };

export type LinearTeamList = { id: string; name: string; projects: { id: string; name: string }[] };

export type DestinationChoice =
  | { ok: true; teamId: string; teamName: string; projectId: string | null; projectName: string | null }
  | { ok: false; names: string[] };

const CLOCK = /^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/;

function clockMs(stamp: string): number | null {
  const match = CLOCK.exec(stamp.trim());
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  return ((hours * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
}

/** Turns a Daily WebVTT file into cues. Skips headers and cues without speech. */
export function parseWebVtt(vtt: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of vtt.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line !== "WEBVTT" && !line.startsWith("NOTE") && !line.startsWith("STYLE") && !line.startsWith("Kind:") && !line.startsWith("Language:"));
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0) continue;
    const [rawStart, rawEnd] = lines[timing].split("-->");
    const startMs = clockMs(rawStart ?? "");
    const endMs = clockMs((rawEnd ?? "").trim().split(/\s+/)[0] ?? "");
    if (startMs === null || endMs === null || endMs < startMs) continue;
    let speakerLabel: string | null = null;
    const text = lines
      .slice(timing + 1)
      .map((line) => {
        const voice = /^<v(?:\s+([^>]*))?>/.exec(line);
        if (voice) speakerLabel = voice[1]?.trim() || speakerLabel;
        return line.replace(/<[^>]+>/g, "").trim();
      })
      .filter(Boolean)
      .join(" ");
    if (text) cues.push({ speakerLabel, text, startMs, endMs });
  }
  return cues;
}

export function visibleLinearNames(teams: LinearTeamList[]): string[] {
  return teams.flatMap((team) =>
    team.projects.length > 0 ? team.projects.map((project) => `${team.name} / ${project.name}`) : [team.name],
  );
}

/** Explicit selections win; inference is handled separately and never guesses a destination. */
export function selectedLinearDestination(teams: LinearTeamList[], teamId: string | null, projectId: string | null): DestinationChoice {
  const team = teams.find((team) => team.id === teamId);
  const project = team?.projects.find((project) => project.id === projectId);
  if (!team || (projectId && !project)) return { ok: false, names: visibleLinearNames(teams) };
  return { ok: true, teamId: team.id, teamName: team.name, projectId: project?.id ?? null, projectName: project?.name ?? null };
}

export function shiproomTitle(title: string): string {
  const bare = title.replace(/^\[shiproom\]\s*/i, "").trim();
  return `${SHIPROOM_TITLE_PREFIX}${bare}`.slice(0, 240);
}

export function taskMarker(meetingId: string, ordinal: number): string {
  return `shiproom-task:${meetingId}:${ordinal}`;
}

export function toTranscript(input: {
  meetingId: string;
  source: Transcript["source"];
  language: Transcript["language"];
  complete: boolean;
  cues: Cue[];
}): Transcript | { error: string } {
  const parsed = transcriptSchema.safeParse({
    meetingId: input.meetingId,
    revision: 1,
    source: input.source,
    complete: input.complete,
    language: input.language,
    segments: input.cues.map((cue, index) => ({
      id: `seg-${String(index + 1).padStart(4, "0")}`,
      startMs: cue.startMs,
      endMs: cue.endMs,
      speakerUserId: null,
      speakerLabel: cue.speakerLabel,
      text: cue.text,
    })),
  });
  if (!parsed.success) return { error: "The transcript could not be validated." };
  if (parsed.data.segments.length === 0) return { error: "No speech was captured." };
  return parsed.data;
}

export function isTranscript(value: Transcript | { error: string }): value is Transcript {
  return !("error" in value);
}

export function issueDescription(input: {
  meetingId: string;
  meetingUrl: string;
  ordinal: number;
  sourceNote: string;
  task: { description: string; acceptanceCriteria: string[]; evidenceSegmentIds: string[]; sourceReferences?: { url: string }[] };
  transcript: Transcript;
}): string {
  const evidence = input.task.evidenceSegmentIds.map((id) => {
    const segment = input.transcript.segments.find((item) => item.id === id);
    if (!segment) return id;
    return `${id} (${(segment.startMs / 1000).toFixed(1)}s–${(segment.endMs / 1000).toFixed(1)}s, ${segment.speakerLabel ?? "Unknown speaker"}): ${segment.text}`;
  });
  const criteria = input.task.acceptanceCriteria.length
    ? `Acceptance criteria:\n${input.task.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`
    : null;
  return [
    input.task.description,
    criteria,
    `Evidence:\n${evidence.map((line) => `- ${line}`).join("\n")}`,
    ...(input.task.sourceReferences ?? []).map((source) => `Source: ${source.url}`),
    `Meeting: ${input.meetingUrl}`,
    input.sourceNote,
    taskMarker(input.meetingId, input.ordinal),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n")
    .slice(0, 20_000);
}
