import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  isTranscript,
  issueDescription,
  parseWebVtt,
  selectedLinearDestination,
  selectShiproomDestination,
  shiproomTitle,
  toTranscript,
  type Cue,
} from "@/lib/call-result";
import { extractionResultSchema, transcriptSchema, validateExtractionAgainstTranscript, type ExtractionResult, type LiveCapture, type Transcript } from "@/lib/contracts";
import { getPublicEnv } from "@/lib/env";
import { DEMO_EXTRACTION, DEMO_NOTE, demoTranscript } from "@/lib/demo";
import { extractAgreedTasks } from "@/lib/server/claude";
import { createRoomToken, ensurePrivateRoom, getExistingRoom, fetchStoredTranscript } from "@/lib/server/daily";
import { serverConfig } from "./config";
import { createLinearIssue, fetchLinearIssues, findCursorDelegate, updateLinearIssue } from "./linear";
import { getLinearAuthorization, getLinearOptions } from "@/lib/server/connections";
import { fetchPublicRepositoryContext } from "@/lib/server/github";
import { createAdminClient } from "@/lib/supabase/server";
import { transcriptionOptions } from "@/lib/transcription";
import type { Language } from "@/lib/contracts";

const UNSAVED = "The call result was not saved on the meeting. Provider rows need the server database key, which did not accept this write.";

export type CallOpen =
  | { error: string }
  | { url: string; token: string; roomName: string; transcription: "daily" | "unavailable"; transcriptionOptions: ReturnType<typeof transcriptionOptions>; persistenceWarning: string | null };

export type CallTask = { title: string; url: string | null; identifier: string | null; error: string | null; operation: "created" | "updated" };

export type CallFinish = {
  error: string | null;
  transcriptSource: "daily-stored" | "daily-live" | "browser" | "demo" | null;
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
  language: Language;
  contextNames: string[];
  isDemo: boolean;
  roomName: string | null;
  startedAt: string | null;
}): Promise<CallOpen> {
  if (!input.isOrganizer && !input.roomName) return { error: "The organizer has not started this call yet." };
  try {
    const room = input.roomName
      ? await getExistingRoom(input.roomName, input.isDemo)
      : await ensurePrivateRoom(input.meetingId, input.language, input.contextNames, input.isDemo);
    if ("error" in room) return { error: room.error };
    const token = await createRoomToken({
      roomName: room.name,
      userId: input.userId,
      displayName: input.displayName,
      isOwner: input.isOrganizer,
    });
    if ("error" in token) return { error: token.error };

    const admin = createAdminClient();
    let persistenceWarning: string | null = null;
    if (!admin) persistenceWarning = UNSAVED;
    else {
      const saved = input.isOrganizer ? await patchMeeting(admin, input.meetingId, {
        daily_room_name: room.name,
        capture_status: "live",
        started_at: input.startedAt ?? new Date().toISOString(),
      }) : null;
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

    return { url: room.url, token: token.token, roomName: room.name, transcription: room.transcription, transcriptionOptions: transcriptionOptions(input.language, input.contextNames), persistenceWarning };
  } catch (error) {
    console.error("Call join failed", { meetingId: input.meetingId, error: error instanceof Error ? error.name : "UnknownError" });
    return { error: "The call service could not be reached. Please try joining again." };
  }
}

function sourceNote(kind: CallFinish["transcriptSource"]): string {
  if (kind === "demo") return DEMO_NOTE;
  if (kind === "daily-stored") return "Transcript source: Daily stored transcript.";
  if (kind === "daily-live") return "Transcript source: Daily live captions from this browser. Daily did not return a stored transcript file.";
  return "Transcript source: browser speech recognition of this device's microphone. Daily transcription did not produce a transcript. Other people are included only if this microphone heard them.";
}

async function captureTranscript(meetingId: string, roomName: string, capture: LiveCapture, language: Language): Promise<
  | { transcript: Transcript; kind: NonNullable<CallFinish["transcriptSource"]>; providerId: string | null }
  | { error: string }
> {
  const stored = await fetchStoredTranscript(roomName);
  if ("vtt" in stored) {
    const transcript = toTranscript({ meetingId, language, source: "daily", complete: true, cues: parseWebVtt(stored.vtt) });
    if (isTranscript(transcript)) return { transcript, kind: "daily-stored", providerId: stored.id };
  }
  const clientCues: Cue[] = capture.segments;
  if (clientCues.length > 0 && capture.origin === "daily-live") {
    const transcript = toTranscript({ meetingId, language, source: "daily", complete: false, cues: clientCues });
    if (isTranscript(transcript)) return { transcript, kind: "daily-live", providerId: null };
  }
  if (clientCues.length > 0 && capture.origin === "browser") {
    const transcript = toTranscript({ meetingId, language, source: "browser", complete: false, cues: clientCues });
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
    language: input.transcript.language,
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
  admin: Admin;
  authorization: string;
  teamId: string;
  meetingId: string;
  meetingUrl: string;
  organizerId: string;
  transcript: Transcript;
  tasks: ExtractionResult["tasks"];
  destination: { teamId: string; projectId: string | null };
  note: string;
  cursorRepo: string | null;
}): Promise<{ tasks: CallTask[]; persistenceWarning: string | null }> {
  const results: CallTask[] = [];
  let persistenceWarning: string | null = null;
  const delegateId = await findCursorDelegate(input.authorization);
  for (const [index, task] of input.tasks.entries()) {
    const ordinal = index + 1;
    const operation = task.existingLinearIssueId ? "updated" as const : "created" as const;
    const title = shiproomTitle(task.title);
    const description = issueDescription({
      meetingId: input.meetingId,
      meetingUrl: input.meetingUrl,
      ordinal,
      sourceNote: input.note,
      cursorRepo: operation === "created" ? input.cursorRepo : null,
      task,
      transcript: input.transcript,
    });
    const { data: existing } = await input.admin
      .from("tasks")
      .select("linear_issue_uuid, linear_issue_url, linear_issue_identifier, publication_status")
      .eq("meeting_id", input.meetingId)
      .eq("ordinal", ordinal)
      .maybeSingle();
    if (existing?.publication_status === "published" && existing.linear_issue_url) {
      results.push({ title: task.title, url: existing.linear_issue_url, identifier: existing.linear_issue_identifier, error: null, operation });
      continue;
    }
    if (!existing?.linear_issue_uuid) {
      persistenceWarning = UNSAVED;
      results.push({ title: task.title, url: null, identifier: null, error: "The saved action could not be loaded. No issue was changed.", operation });
      continue;
    }


    let created: Awaited<ReturnType<typeof createLinearIssue>>;
    try {
      if (task.existingLinearIssueId) {
        created = await updateLinearIssue(input.authorization, { id: task.existingLinearIssueId, ...input.destination, updatedAt: task.existingLinearIssueUpdatedAt ?? "", amendment: `### Shiproom meeting update\n\n${description}` });
      } else {
        created = await createLinearIssue(input.authorization, { id: String(existing.linear_issue_uuid), teamId: input.destination.teamId, projectId: input.destination.projectId, title, description, delegateId });
      }
    } catch {
      created = { ok: false, error: "Linear could not be reached. No new issue was confirmed." };
    }
    if (!created.ok) {
      await input.admin.from("tasks").update({ publication_status: "failed", publication_error: created.error }).eq("meeting_id", input.meetingId).eq("ordinal", ordinal);
      results.push({ title: task.title, url: null, identifier: null, error: created.error, operation });
      continue;
    }
    const { data: taskRow } = await input.admin
      .from("tasks")
      .update({ publication_status: "published", linear_issue_url: created.url, linear_issue_identifier: created.identifier, publication_error: null })
      .eq("meeting_id", input.meetingId)
      .eq("ordinal", ordinal)
      .select("id")
      .maybeSingle();
    if (!taskRow?.id) {
      persistenceWarning = UNSAVED;
      results.push({ title: task.title, url: created.url, identifier: created.identifier, error: "The issue changed, but its receipt could not be saved. Retry processing.", operation });
      continue;
    }
    results.push({ title: task.title, url: created.url, identifier: created.identifier, error: null, operation });
    const { data: people } = await input.admin.from("meeting_participants").select("user_id").eq("meeting_id", input.meetingId);
    const recipients = new Set([input.organizerId, ...(people ?? []).map((person) => person.user_id as string)]);
    const { error: notifyError } = await input.admin.from("notifications").upsert(
      [...recipients].map((recipientId) => ({
        team_id: input.teamId,
        recipient_id: recipientId,
        meeting_id: input.meetingId,
        kind: "task_ready",
        task_id: taskRow.id,
        linear_issue_url: created.url,
        title: (operation === "updated" ? `Updated ${created.identifier}: ${task.title}` : title).slice(0, 300),
      })), { onConflict: "recipient_id,task_id", ignoreDuplicates: true },
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
  isDemo: boolean;
}): Promise<CallFinish> {
  const admin = createAdminClient();
  if (!admin) return emptyFinish("The meeting cannot be saved yet, so no issues will be created. Ask the team owner to finish setup.");
  const { data: meeting } = await admin.from("meetings")
    .select("language, github_repository_id, linear_team_id, linear_project_id, processing_status, summary, decisions, open_questions")
    .eq("id", input.meetingId).eq("team_id", input.teamId).single();
  if (!meeting) return emptyFinish("This meeting could not be loaded. No issues were created.");
  const { data: existing, error: tasksError } = await admin
    .from("tasks")
    .select("payload, publication_status, linear_issue_url, linear_issue_identifier")
    .eq("meeting_id", input.meetingId)
    .order("ordinal");
  if (tasksError) return emptyFinish("Saved actions could not be loaded. No issues were changed.");
  const rows = existing ?? [];
  if ((rows.length > 0 && rows.every((row) => row.publication_status === "published")) || (rows.length === 0 && meeting.processing_status === "complete")) {
    revalidatePath(`/teams/${input.teamId}/meetings/${input.meetingId}`);
    return {
      error: null,
      transcriptSource: null,
      transcriptNote: "This meeting's saved actions have already completed.",
      summary: meeting.summary,
      decisions: meeting.decisions ?? [],
      openQuestions: meeting.open_questions ?? [],
      tasks: rows.map((row) => ({
        title: row.payload && typeof row.payload === "object" && "title" in row.payload && typeof row.payload.title === "string" ? row.payload.title : "Task",
        url: row.linear_issue_url as string | null,
        identifier: (row.linear_issue_identifier as string | null) ?? null,
        error: null,
        operation: row.payload?.existingLinearIssueId ? "updated" : "created",
      })),
      linearNames: null,
      persistenceWarning: null,
    };
  }
  let persistenceWarning = await patchMeeting(admin, input.meetingId, { capture_status: "finalizing", processing_status: "extracting", ended_at: new Date().toISOString() });
  const { data: savedTranscript, error: transcriptError } = await admin.from("transcripts").select("source, language, segments, complete, revision")
    .eq("meeting_id", input.meetingId).eq("revision", 1).maybeSingle();
  if (transcriptError) return emptyFinish("The saved transcript could not be loaded. No issues were changed.");
  const parsedTranscript = savedTranscript?.complete ? transcriptSchema.safeParse({ ...savedTranscript, meetingId: input.meetingId }) : null;
  if (parsedTranscript && !parsedTranscript.success) return emptyFinish("The saved transcript is invalid. No issues were changed.");
  const captured = parsedTranscript?.success
    ? { transcript: parsedTranscript.data, kind: input.isDemo ? "demo" as const : "daily-stored" as const, providerId: null }
    : input.isDemo
      ? { transcript: demoTranscript(input.meetingId), kind: "demo" as const, providerId: null }
      : await captureTranscript(input.meetingId, input.roomName, input.capture, meeting.language);
  if ("error" in captured) {
    await patchMeeting(admin, input.meetingId, { capture_status: "failed", processing_status: "failed", error_stage: "transcript", error_message: captured.error });
    revalidatePath(`/teams/${input.teamId}/meetings/${input.meetingId}`);
    return emptyFinish(captured.error, { persistenceWarning });
  }

  const note = sourceNote(captured.kind);
  const saveError = savedTranscript?.complete ? null : await rememberTranscript(admin, { teamId: input.teamId, meetingId: input.meetingId, transcript: captured.transcript, providerId: captured.providerId });
  persistenceWarning = persistenceWarning ?? saveError;
  await patchMeeting(admin, input.meetingId, { capture_status: "ready" });

  if (saveError) return emptyFinish("The transcript could not be saved, so no issues were created.", { persistenceWarning: saveError });
  if (!captured.transcript.complete) {
    const error = "Only a partial transcript is available. No issues were created. Retry when the full stored transcript is ready.";
    await patchMeeting(admin, input.meetingId, { processing_status: "failed", error_stage: "transcript", error_message: error });
    revalidatePath(`/teams/${input.teamId}/meetings/${input.meetingId}`);
    return emptyFinish(error, { transcriptSource: captured.kind, transcriptNote: note });
  }

  const linear = await getLinearOptions(input.teamId);
  const destination = linear.status !== "ready" ? null
    : input.isDemo ? selectShiproomDestination(linear.teams)
    : selectedLinearDestination(linear.teams, meeting.linear_team_id ?? null, meeting.linear_project_id ?? null);
  if (input.isDemo && !destination?.ok) {
    const error = "The scripted demo needs this team's Linear connection to see exactly one Shiproom team or project. No issues were created.";
    await patchMeeting(admin, input.meetingId, { processing_status: "failed", error_stage: "linear", error_message: error });
    revalidatePath(`/teams/${input.teamId}/meetings/${input.meetingId}`);
    return emptyFinish(error, { transcriptSource: captured.kind, transcriptNote: note, linearNames: destination?.names ?? null });
  }
  if (!destination?.ok || (!input.isDemo && !meeting.github_repository_id)) {
    const error = "Choose an approved repository and connected Linear team before creating issues. Automatic context inference is not available yet.";
    await patchMeeting(admin, input.meetingId, { processing_status: "needs_context", error_stage: "context", error_message: error });
    revalidatePath(`/teams/${input.teamId}/meetings/${input.meetingId}`);
    return emptyFinish(error, { transcriptSource: captured.kind, transcriptNote: note });
  }
  const { data: repository } = input.isDemo ? { data: null } : await admin.from("team_repositories").select("full_name, access")
    .eq("team_id", input.teamId).eq("github_repository_id", meeting.github_repository_id).single();
  if (!input.isDemo && (!repository || repository.access !== "public")) return emptyFinish("The selected repository is not approved for public source context.");
  let authorization: string | null;
  let extracted: Awaited<ReturnType<typeof extractAgreedTasks>>;
  try {
    authorization = await getLinearAuthorization(input.teamId);
    if (!authorization) throw new Error("The team's Linear connection is unavailable.");
    if (rows.length > 0) {
      const saved = extractionResultSchema.safeParse({ summary: meeting.summary ?? "", decisions: meeting.decisions ?? [], openQuestions: meeting.open_questions ?? [], tasks: rows.map(row => row.payload) });
      extracted = saved.success ? { ok: true, result: saved.data } : { ok: false, error: "The saved actions could not be validated. No issues were changed." };
    } else if (input.isDemo) {
      extracted = { ok: true, result: DEMO_EXTRACTION };
    } else {
      if (!repository) throw new Error("The selected repository is unavailable.");
      const [context, linearIssues] = await Promise.all([
        fetchPublicRepositoryContext(meeting.github_repository_id, repository.full_name),
        fetchLinearIssues(authorization, destination.teamId, destination.projectId),
      ]);
      extracted = await extractAgreedTasks(captured.transcript, { repository: context, linearTeam: destination.teamName, linearProject: destination.projectName, linearIssues });
    }
  } catch {
    const error = "Meeting context could not be loaded. Check the team's connections and try again.";
    await patchMeeting(admin, input.meetingId, { processing_status: "failed", error_stage: "context", error_message: error });
    return emptyFinish(error);
  }

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

  const notesError = await patchMeeting(admin, input.meetingId, {
    summary: extracted.result.summary,
    decisions: extracted.result.decisions,
    open_questions: extracted.result.openQuestions,
    error_message: null,
    error_stage: null,
  });
  if (notesError) return emptyFinish("Meeting notes could not be saved. No issues were changed.", { persistenceWarning: notesError });
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

  if (rows.length === 0) {
    const { error } = await admin.from("tasks").insert(extracted.result.tasks.map((task, index) => ({
      team_id: input.teamId, meeting_id: input.meetingId, transcript_revision: 1, ordinal: index + 1,
      payload: task, linear_issue_uuid: randomUUID(), publication_status: "pending",
    })));
    if (error) return emptyFinish("The action batch could not be saved. No issues were changed. Retry processing.");
  }
  await patchMeeting(admin, input.meetingId, { processing_status: "publishing" });
  const appUrl = getPublicEnv()?.appUrl ?? "";
  const published = await publishTasks({
    admin,
    authorization,
    teamId: input.teamId,
    meetingId: input.meetingId,
    meetingUrl: `${appUrl}/teams/${input.teamId}/meetings/${input.meetingId}`,
    organizerId: input.organizerId,
    transcript: captured.transcript,
    tasks: extracted.result.tasks,
    destination: { teamId: destination.teamId, projectId: destination.projectId },
    note,
    cursorRepo: repository?.full_name ?? serverConfig.cursorPrRepo(),
  });
  const failed = published.tasks.some((task) => task.error);
  const created = published.tasks.some((task) => task.url);
  await patchMeeting(admin, input.meetingId, {
    processing_status: failed && created ? "partial_failure" : failed ? "failed" : "complete",
    error_stage: failed ? "linear" : null,
    error_message: failed ? "Some Linear actions could not be completed." : null,
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
