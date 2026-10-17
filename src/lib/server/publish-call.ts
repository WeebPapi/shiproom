import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  isTranscript,
  issueDescription,
  parseWebVtt,
  selectShiproomDestination,
  shiproomTitle,
  taskMarker,
  toTranscript,
  type Cue,
} from "@/lib/call-result";
import { validateExtractionAgainstTranscript, type LiveCapture, type Transcript } from "@/lib/contracts";
import { getPublicEnv } from "@/lib/env";
import { extractAgreedTasks } from "@/lib/server/claude";
import { createRoomToken, ensurePrivateRoom, fetchStoredTranscript } from "@/lib/server/daily";
import { createLinearIssue, findIssueByMarker, listLinearDestinations } from "@/lib/server/linear-personal";
import { createAdminClient } from "@/lib/supabase/server";

const UNSAVED = "The call result was not saved on the meeting. Provider rows need the server database key, which did not accept this write.";

export type CallOpen =
  | { error: string }
  | { url: string; token: string; roomName: string; transcription: "daily" | "unavailable"; persistenceWarning: string | null };

export type CallTask = { title: string; url: string | null; identifier: string | null; error: string | null };

export type CallFinish = {
  error: string | null;
  transcriptSource: "daily-stored" | "daily-live" | "browser" | null;
  transcriptNote: string | null;
  summary: string | null;
  decisions: string[];
  openQuestions: string[];
  tasks: CallTask[];
  linearNames: string[] | null;
  persistenceWarning: string | null;
};

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

function emptyFinish(error: string, extra: Partial<CallFinish> = {}): CallFinish {
  return {
    error,
    transcriptSource: null,
    transcriptNote: null,
    summary: null,
    decisions: [],
    openQuestions: [],
    tasks: [],
    linearNames: null,
    persistenceWarning: null,
    ...extra,
  };
}

async function patchMeeting(admin: Admin | null, meetingId: string, patch: Record<string, unknown>): Promise<string | null> {
  if (!admin) return UNSAVED;
  const { error } = await admin.from("meetings").update(patch).eq("id", meetingId);
  if (error) {
    console.error("meeting update failed", error.message);
    return UNSAVED;
  }
  return null;
}

export async function openMeetingCall(input: {
  teamId: string;
  meetingId: string;
  userId: string;
  displayName: string;
  isOrganizer: boolean;
}): Promise<CallOpen> {
  const room = await ensurePrivateRoom(input.meetingId);
  if ("error" in room) return { error: room.error };
  const token = await createRoomToken({
    roomName: room.name,
    userId: input.userId,
    displayName: input.displayName,
    isOwner: input.isOrganizer,
    transcribe: room.transcription === "daily",
  });
  if ("error" in token) return { error: token.error };

  const admin = createAdminClient();
  let persistenceWarning: string | null = null;
  if (!admin) persistenceWarning = UNSAVED;
  else {
    const saved = await patchMeeting(admin, input.meetingId, {
      daily_room_name: room.name,
      capture_status: "live",
      started_at: new Date().toISOString(),
    });
    persistenceWarning = saved;
    // shortcut: attendance is the member who was issued a token, upgrade when Daily join webhooks are verified.
    const { error } = await admin.from("meeting_participants").upsert(
      {
        team_id: input.teamId,
        meeting_id: input.meetingId,
        user_id: input.userId,
        provenance: "organizer",
        consented_at: new Date().toISOString(),
        first_joined_at: new Date().toISOString(),
      },
      { onConflict: "meeting_id,user_id", ignoreDuplicates: true },
    );
    if (error) console.error("participant insert failed", error.message);
  }

  return { url: room.url, token: token.token, roomName: room.name, transcription: room.transcription, persistenceWarning };
}

function sourceNote(kind: CallFinish["transcriptSource"]): string {
  if (kind === "daily-stored") return "Transcript source: Daily stored transcript.";
  if (kind === "daily-live") return "Transcript source: Daily live captions from this browser. Daily did not return a stored transcript file.";
  return "Transcript source: browser speech recognition of this device's microphone. Daily transcription did not produce a transcript. Other people are included only if this microphone heard them.";
}

async function captureTranscript(meetingId: string, roomName: string, capture: LiveCapture): Promise<
  | { transcript: Transcript; kind: NonNullable<CallFinish["transcriptSource"]>; providerId: string | null }
  | { error: string }
> {
  const stored = await fetchStoredTranscript(roomName);
  if ("vtt" in stored) {
    const transcript = toTranscript({ meetingId, source: "daily", complete: true, cues: parseWebVtt(stored.vtt) });
    if (isTranscript(transcript)) return { transcript, kind: "daily-stored", providerId: stored.id };
  }
  const clientCues: Cue[] = capture.segments;
  if (clientCues.length > 0 && capture.origin === "daily-live") {
    const transcript = toTranscript({ meetingId, source: "daily", complete: false, cues: clientCues });
    if (isTranscript(transcript)) return { transcript, kind: "daily-live", providerId: null };
  }
  if (clientCues.length > 0 && capture.origin === "browser") {
    const transcript = toTranscript({ meetingId, source: "browser", complete: false, cues: clientCues });
    if (isTranscript(transcript)) return { transcript, kind: "browser", providerId: null };
  }
  if ("error" in stored) return { error: stored.error };
  return { error: "No speech was captured. Daily did not return a stored transcript, and this browser did not capture one either." };
}

async function rememberTranscript(admin: Admin | null, input: { teamId: string; meetingId: string; transcript: Transcript; providerId: string | null }): Promise<string | null> {
  if (!admin) return UNSAVED;
  const row = {
    team_id: input.teamId,
    meeting_id: input.meetingId,
    revision: 1,
    source: input.transcript.source,
    language: "en",
    provider_transcript_id: input.providerId,
    segments: input.transcript.segments,
    complete: input.transcript.complete,
    content_hash: createHash("sha256").update(JSON.stringify(input.transcript.segments)).digest("hex"),
  };
  const { error } = await admin.from("transcripts").upsert(row, { onConflict: "team_id,meeting_id,revision" });
  if (error) {
    console.error("transcript save failed", error.message);
    return UNSAVED;
  }
  return null;
}

async function publishTasks(input: {
  admin: Admin | null;
  teamId: string;
  meetingId: string;
  meetingUrl: string;
  organizerId: string;
  transcript: Transcript;
  tasks: { title: string; description: string; acceptanceCriteria: string[]; evidenceSegmentIds: string[] }[];
  destination: { teamId: string; projectId: string | null };
  note: string;
}): Promise<{ tasks: CallTask[]; persistenceWarning: string | null }> {
  const results: CallTask[] = [];
  let persistenceWarning: string | null = null;
  for (const [index, task] of input.tasks.entries()) {
    const ordinal = index + 1;
    const marker = taskMarker(input.meetingId, ordinal);
    const title = shiproomTitle(task.title);
    const description = issueDescription({
      meetingId: input.meetingId,
      meetingUrl: input.meetingUrl,
      ordinal,
      sourceNote: input.note,
      task,
      transcript: input.transcript,
    });
    let linearId: string = randomUUID();
    if (input.admin) {
      const { data: existing } = await input.admin
        .from("tasks")
        .select("linear_issue_uuid, linear_issue_url, linear_issue_identifier, publication_status")
        .eq("meeting_id", input.meetingId)
        .eq("ordinal", ordinal)
        .maybeSingle();
      if (existing?.publication_status === "published" && existing.linear_issue_url) {
        results.push({ title: task.title, url: existing.linear_issue_url, identifier: existing.linear_issue_identifier, error: null });
        continue;
      }
      if (existing?.linear_issue_uuid) linearId = String(existing.linear_issue_uuid);
      else {
        const { error } = await input.admin.from("tasks").insert({
          team_id: input.teamId,
          meeting_id: input.meetingId,
          transcript_revision: 1,
          ordinal,
          payload: task,
          linear_issue_uuid: linearId,
          publication_status: "pending",
        });
        if (error) {
          console.error("task insert failed", error.message);
          persistenceWarning = UNSAVED;
        }
      }
    } else persistenceWarning = UNSAVED;

    const prior = await findIssueByMarker(input.destination.teamId, marker);
    const created = prior
      ? { ok: true as const, identifier: prior.identifier, url: prior.url }
      : await createLinearIssue({ id: linearId, teamId: input.destination.teamId, projectId: input.destination.projectId, title, description });
    if (!created.ok) {
      if (input.admin) await input.admin.from("tasks").update({ publication_status: "failed", publication_error: created.error }).eq("meeting_id", input.meetingId).eq("ordinal", ordinal);
      results.push({ title: task.title, url: null, identifier: null, error: created.error });
      continue;
    }
    results.push({ title: task.title, url: created.url, identifier: created.identifier, error: null });
    if (!input.admin) continue;
    const { data: taskRow } = await input.admin
      .from("tasks")
      .update({ publication_status: "published", linear_issue_url: created.url, linear_issue_identifier: created.identifier, publication_error: null })
      .eq("meeting_id", input.meetingId)
      .eq("ordinal", ordinal)
      .select("id")
      .maybeSingle();
    if (!taskRow?.id) continue;
    const { data: people } = await input.admin.from("meeting_participants").select("user_id").eq("meeting_id", input.meetingId);
    const recipients = new Set([input.organizerId, ...(people ?? []).map((person) => person.user_id as string)]);
    const { error: notifyError } = await input.admin.from("notifications").insert(
      [...recipients].map((recipientId) => ({
        team_id: input.teamId,
        recipient_id: recipientId,
        meeting_id: input.meetingId,
        kind: "task_ready",
        task_id: taskRow.id,
        linear_issue_url: created.url,
        title: title.slice(0, 300),
      })),
    );
    if (notifyError && !/duplicate|unique/i.test(notifyError.message)) console.error("notification insert failed", notifyError.message);
  }
  return { tasks: results, persistenceWarning };
}

export async function finishMeetingCall(input: {
  teamId: string;
  meetingId: string;
  organizerId: string;
  roomName: string;
  capture: LiveCapture;
}): Promise<CallFinish> {
  const admin = createAdminClient();
  if (admin) {
    const { data: existing } = await admin
      .from("tasks")
      .select("payload, publication_status, linear_issue_url, linear_issue_identifier")
      .eq("meeting_id", input.meetingId)
      .order("ordinal");
    const rows = existing ?? [];
    if (rows.some((row) => row.publication_status === "published")) {
      revalidatePath(`/teams/${input.teamId}/meetings/${input.meetingId}`);
      return {
        error: null,
        transcriptSource: null,
        transcriptNote: "Issues were already created for this meeting.",
        summary: null,
        decisions: [],
        openQuestions: [],
        tasks: rows.map((row) => ({
          title: row.payload && typeof row.payload === "object" && "title" in row.payload && typeof row.payload.title === "string" ? row.payload.title : "Task",
          url: row.publication_status === "published" ? (row.linear_issue_url as string | null) : null,
          identifier: (row.linear_issue_identifier as string | null) ?? null,
          error: row.publication_status === "published" ? null : "Not created.",
        })),
        linearNames: null,
        persistenceWarning: null,
      };
    }
  }
  let persistenceWarning = await patchMeeting(admin, input.meetingId, { capture_status: "finalizing", processing_status: "extracting", ended_at: new Date().toISOString() });
  const captured = await captureTranscript(input.meetingId, input.roomName, input.capture);
  if ("error" in captured) {
    await patchMeeting(admin, input.meetingId, { capture_status: "failed", processing_status: "failed", error_stage: "transcript", error_message: captured.error });
    revalidatePath(`/teams/${input.teamId}/meetings/${input.meetingId}`);
    return emptyFinish(captured.error, { persistenceWarning });
  }

  const note = sourceNote(captured.kind);
  const saveError = await rememberTranscript(admin, { teamId: input.teamId, meetingId: input.meetingId, transcript: captured.transcript, providerId: captured.providerId });
  persistenceWarning = persistenceWarning ?? saveError;
  await patchMeeting(admin, input.meetingId, { capture_status: "ready" });

  const extracted = await extractAgreedTasks(captured.transcript);
  if (!extracted.ok) {
    await patchMeeting(admin, input.meetingId, { processing_status: "failed", error_stage: "extraction", error_message: extracted.error });
    revalidatePath(`/teams/${input.teamId}/meetings/${input.meetingId}`);
    return emptyFinish(extracted.error, { transcriptSource: captured.kind, transcriptNote: note, persistenceWarning });
  }
  const problems = validateExtractionAgainstTranscript(extracted.result, captured.transcript);
  if (problems.length > 0) {
    const error = `${problems.join(" ")} No issues were created.`;
    await patchMeeting(admin, input.meetingId, { processing_status: "failed", error_stage: "extraction", error_message: error });
    return emptyFinish(error, { transcriptSource: captured.kind, transcriptNote: note, persistenceWarning });
  }

  await patchMeeting(admin, input.meetingId, {
    summary: extracted.result.summary,
    decisions: extracted.result.decisions,
    open_questions: extracted.result.openQuestions,
    error_message: null,
    error_stage: null,
  });
  if (extracted.result.tasks.length === 0) {
    await patchMeeting(admin, input.meetingId, { processing_status: "complete" });
    revalidatePath(`/teams/${input.teamId}/meetings/${input.meetingId}`);
    return {
      error: null,
      transcriptSource: captured.kind,
      transcriptNote: note,
      summary: extracted.result.summary,
      decisions: extracted.result.decisions,
      openQuestions: extracted.result.openQuestions,
      tasks: [],
      linearNames: null,
      persistenceWarning,
    };
  }

  const listed = await listLinearDestinations();
  if (!listed.ok) {
    await patchMeeting(admin, input.meetingId, { processing_status: "failed", error_stage: "linear", error_message: listed.error });
    return emptyFinish(listed.error, {
      transcriptSource: captured.kind,
      transcriptNote: note,
      summary: extracted.result.summary,
      decisions: extracted.result.decisions,
      openQuestions: extracted.result.openQuestions,
      persistenceWarning,
    });
  }
  const destination = selectShiproomDestination(listed.teams);
  if (!destination.ok) {
    const error = `No Linear team or project name contains "Shiproom", so no issues were created. Visible: ${destination.names.join("; ") || "none"}.`;
    await patchMeeting(admin, input.meetingId, { processing_status: "failed", error_stage: "linear", error_message: error });
    revalidatePath(`/teams/${input.teamId}/meetings/${input.meetingId}`);
    return {
      error,
      transcriptSource: captured.kind,
      transcriptNote: note,
      summary: extracted.result.summary,
      decisions: extracted.result.decisions,
      openQuestions: extracted.result.openQuestions,
      tasks: extracted.result.tasks.map((task) => ({ title: task.title, url: null, identifier: null, error: "Not created." })),
      linearNames: destination.names,
      persistenceWarning,
    };
  }

  await patchMeeting(admin, input.meetingId, { processing_status: "publishing" });
  const appUrl = getPublicEnv()?.appUrl ?? "";
  const published = await publishTasks({
    admin,
    teamId: input.teamId,
    meetingId: input.meetingId,
    meetingUrl: `${appUrl}/teams/${input.teamId}/meetings/${input.meetingId}`,
    organizerId: input.organizerId,
    transcript: captured.transcript,
    tasks: extracted.result.tasks,
    destination: { teamId: destination.teamId, projectId: destination.projectId },
    note,
  });
  const failed = published.tasks.some((task) => task.error);
  const created = published.tasks.some((task) => task.url);
  await patchMeeting(admin, input.meetingId, {
    processing_status: failed && created ? "partial_failure" : failed ? "failed" : "complete",
    error_stage: failed ? "linear" : null,
    error_message: failed ? "Some Linear issues could not be created." : null,
  });
  revalidatePath(`/teams/${input.teamId}/meetings/${input.meetingId}`);
  return {
    error: null,
    transcriptSource: captured.kind,
    transcriptNote: note,
    summary: extracted.result.summary,
    decisions: extracted.result.decisions,
    openQuestions: extracted.result.openQuestions,
    tasks: published.tasks,
    linearNames: null,
    persistenceWarning: persistenceWarning ?? published.persistenceWarning,
  };
}
