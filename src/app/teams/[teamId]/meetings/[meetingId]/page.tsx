import { notFound } from "next/navigation";
import { z } from "zod";
import { cardClass } from "@/components/styles";
import { requireMembership } from "@/lib/server/auth";
import { serverConfig } from "@/lib/server/config";
import { getLinearOptions, listTeamRepositories } from "@/lib/server/connections";
import { STATUS_LABEL } from "@/lib/server/meetings";
import { createClient } from "@/lib/supabase/server";
import { formatInZone } from "@/lib/time";
import type { CaptureStatus, ProcessingStatus } from "@/lib/contracts";
import { CallPanel } from "./call-panel";

type MeetingRow = {
  id: string;
  kind: "scheduled" | "huddle" | "upload";
  title: string;
  agenda: string;
  language: "en" | "ka";
  scheduled_start: string | null;
  scheduled_end: string | null;
  timezone: string | null;
  context_mode: "selected" | "infer" | "mixed";
  github_repository_id: string | null;
  linear_team_id: string | null;
  linear_project_id: string | null;
  capture_status: CaptureStatus;
  processing_status: ProcessingStatus;
  summary: string | null;
  decisions: string[];
  open_questions: string[];
  error_message: string | null;
  organizer_id: string;
};

type TaskRow = { id: string; ordinal: number; payload: { title?: string }; publication_status: string; linear_issue_url: string | null; linear_issue_identifier: string | null };

export default async function MeetingPage({ params }: { params: Promise<{ teamId: string; meetingId: string }> }) {
  const { teamId, meetingId } = await params;
  const { user } = await requireMembership(teamId);
  if (!z.uuid().safeParse(meetingId).success) notFound();

  const supabase = await createClient();
  const { data: meeting } = await supabase
    .from("meetings")
    .select(
      "id, kind, title, agenda, language, scheduled_start, scheduled_end, timezone, context_mode, github_repository_id, linear_team_id, linear_project_id, capture_status, processing_status, summary, decisions, open_questions, error_message, organizer_id",
    )
    .eq("id", meetingId)
    .eq("team_id", teamId)
    .maybeSingle<MeetingRow>();
  if (!meeting) notFound();

  const [invitees, tasks, repositories, linear] = await Promise.all([
    supabase.from("meeting_invitees").select("user_id, profile:profiles(display_name, github_login)").eq("meeting_id", meetingId),
    supabase
      .from("tasks")
      .select("id, ordinal, payload, publication_status, linear_issue_url, linear_issue_identifier")
      .eq("meeting_id", meetingId)
      .order("ordinal")
      .returns<TaskRow[]>(),
    listTeamRepositories(teamId),
    meeting.linear_team_id ? getLinearOptions(teamId) : Promise.resolve(null),
  ]);

  const repo = repositories.find((r) => r.id === meeting.github_repository_id);
  const linearTeam = linear?.status === "ready" ? linear.teams.find((t) => t.id === meeting.linear_team_id) : undefined;
  const linearProject = linearTeam?.projects.find((p) => p.id === meeting.linear_project_id);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted">{meeting.kind === "scheduled" ? "Scheduled call" : meeting.kind === "huddle" ? "Huddle" : "Uploaded audio"}</p>
        <h1 className="text-lg font-semibold">{meeting.title}</h1>
        {meeting.scheduled_start && meeting.scheduled_end && meeting.timezone && (
          <p className="text-muted">
            {formatInZone(meeting.scheduled_start, meeting.timezone)} – {formatInZone(meeting.scheduled_end, meeting.timezone, { dateStyle: undefined, timeStyle: "short" })} ({meeting.timezone})
          </p>
        )}
      </header>

      <section aria-label="Context" className="flex flex-wrap gap-2">
        <Chip label="Repository">
          {repo ? (
            <a href={repo.htmlUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {repo.fullName}
            </a>
          ) : meeting.github_repository_id ? (
            "Unavailable"
          ) : (
            "Shiproom will infer"
          )}
        </Chip>
        <Chip label="Linear team">{linearTeam ? `${linearTeam.name} (${linearTeam.key})` : meeting.linear_team_id ? "Linear unavailable" : "Shiproom will infer"}</Chip>
        <Chip label="Project">{linearProject ? linearProject.name : meeting.linear_project_id ? "Linear unavailable" : "Shiproom will infer"}</Chip>
        <Chip label="Language">{meeting.language === "en" ? "English" : "Georgian (experimental)"}</Chip>
      </section>

      {meeting.agenda && (
        <section className={`${cardClass} p-4`}>
          <h2 className="mb-1 font-medium">Agenda</h2>
          <p className="whitespace-pre-wrap text-muted">{meeting.agenda}</p>
        </section>
      )}

      <section className={`${cardClass} space-y-2 p-4`} aria-labelledby="call-heading">
        <h2 id="call-heading" className="font-medium">
          Call
        </h2>
        {meeting.kind === "upload" ? (
          <p className="text-muted">This meeting is an upload. Live calling is not used for it.</p>
        ) : (
          <CallPanel
            teamId={teamId}
            meetingId={meeting.id}
            isOrganizer={meeting.organizer_id === user.id}
            dailyReady={Boolean(serverConfig.dailyApiKey())}
            georgianMeeting={meeting.language === "ka"}
          />
        )}
      </section>

      <section className={`${cardClass} space-y-3 p-4`} aria-labelledby="result-heading">
        <h2 id="result-heading" className="font-medium">
          Result
        </h2>
        <p className="text-muted">
          Processing: <strong className="text-foreground">{STATUS_LABEL[meeting.processing_status]}</strong>
          {" · "}
          Capture: <strong className="text-foreground">{STATUS_LABEL[meeting.capture_status]}</strong>
        </p>
        {meeting.summary && <p>{meeting.summary}</p>}
        {meeting.decisions.length > 0 && (
          <div>
            <h3 className="font-medium">Decisions</h3>
            <ul className="list-disc pl-5">{meeting.decisions.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        )}
        {meeting.open_questions.length > 0 && (
          <div>
            <h3 className="font-medium">Open questions</h3>
            <ul className="list-disc pl-5">{meeting.open_questions.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        )}
        {meeting.error_message && (
          <p role="alert" className="text-danger">
            {meeting.error_message}
          </p>
        )}
        {(tasks.data ?? []).length > 0 ? (
          <ul className="divide-y divide-border">
            {(tasks.data ?? []).map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-4 py-2">
                <span>{task.payload.title ?? `Task ${task.ordinal}`}</span>
                {task.linear_issue_url ? (
                  <a href={task.linear_issue_url} target="_blank" rel="noreferrer" className="text-accent">
                    {task.linear_issue_identifier ?? "Open in Linear"}
                  </a>
                ) : (
                  <span className="text-xs text-muted">{task.publication_status}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No tasks yet.</p>
        )}
      </section>

      <section aria-labelledby="invitees-heading" className="space-y-1">
        <h2 id="invitees-heading" className="font-medium text-muted">
          Invited
        </h2>
        <ul className="flex flex-wrap gap-2">
          {(invitees.data ?? []).map((i) => {
            const profile = (Array.isArray(i.profile) ? i.profile[0] : i.profile) as { display_name: string; github_login: string | null } | null;
            return (
              <li key={i.user_id as string} className="rounded-full border border-border px-2 py-0.5">
                {profile?.display_name || profile?.github_login || "Member"}
                {i.user_id === meeting.organizer_id && <span className="text-muted"> · organizer</span>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Chip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1">
      <span className="text-muted">{label}</span>
      <span>{children}</span>
    </span>
  );
}
