import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Icon } from "@/components/icons";
import { Avatar, PageHeader, SectionTitle } from "@/components/page-parts";
import { badgeClass, cardClass } from "@/components/styles";
import { requireMembership } from "@/lib/server/auth";
import { serverConfig } from "@/lib/server/config";
import { getLinearOptions, listTeamRepositories, type LinearOptionsState } from "@/lib/server/connections";
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

  // Not awaited: the Linear API is slow, so only its two properties wait for it.
  const linear = meeting.linear_team_id ? getLinearOptions(teamId) : Promise.resolve(null);
  const [invitees, tasks, repositories] = await Promise.all([
    supabase.from("meeting_invitees").select("user_id, profile:profiles(display_name, github_login)").eq("meeting_id", meetingId),
    supabase
      .from("tasks")
      .select("id, ordinal, payload, publication_status, linear_issue_url, linear_issue_identifier")
      .eq("meeting_id", meetingId)
      .order("ordinal")
      .returns<TaskRow[]>(),
    listTeamRepositories(teamId),
  ]);

  const repo = repositories.find((r) => r.id === meeting.github_repository_id);
  const kindLabel = meeting.kind === "scheduled" ? "Scheduled call" : meeting.kind === "huddle" ? "Huddle" : "Uploaded audio";

  return (
    <>
      <PageHeader
        title={
          <>
            <Link href={`/teams/${teamId}`} className="text-muted transition-colors hover:text-foreground">
              Home
            </Link>
            <span aria-hidden className="text-muted">
              /
            </span>
            <span className="truncate">{meeting.title}</span>
          </>
        }
      />
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-8">
          <header className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">{meeting.title}</h2>
            {meeting.agenda && <p className="whitespace-pre-wrap text-muted">{meeting.agenda}</p>}
          </header>

          <section aria-labelledby="call-heading">
            <SectionTitle id="call-heading">Call</SectionTitle>
            <div className={`${cardClass} p-4`}>
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
            </div>
          </section>

          <section aria-labelledby="result-heading" className="space-y-4">
            <SectionTitle id="result-heading">Result</SectionTitle>
            {meeting.error_message && (
              <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">
                {meeting.error_message}
              </p>
            )}
            {meeting.summary && <p className="leading-relaxed">{meeting.summary}</p>}
            {meeting.decisions.length > 0 && (
              <div>
                <h3 className="mb-1 font-medium">Decisions</h3>
                <ul className="list-disc space-y-0.5 pl-5 text-muted marker:text-border">{meeting.decisions.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            )}
            {meeting.open_questions.length > 0 && (
              <div>
                <h3 className="mb-1 font-medium">Open questions</h3>
                <ul className="list-disc space-y-0.5 pl-5 text-muted marker:text-border">{meeting.open_questions.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            )}
            {(tasks.data ?? []).length > 0 ? (
              <ul className={`${cardClass} divide-y divide-border`}>
                {(tasks.data ?? []).map((task) => (
                  <li key={task.id} className="flex min-h-10 items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1">{task.payload.title ?? `Task ${task.ordinal}`}</span>
                    {task.linear_issue_url ? (
                      <a
                        href={task.linear_issue_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-accent hover:underline"
                      >
                        {task.linear_issue_identifier ?? "Open in Linear"}
                        <Icon name="external" className="size-3" />
                      </a>
                    ) : (
                      <span className={badgeClass}>{task.publication_status}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">No tasks yet.</p>
            )}
          </section>
        </div>

        <aside aria-label="Meeting details" className="space-y-6 lg:border-l lg:border-border lg:pl-6">
          <dl className="space-y-3">
            <Property label="Type">{kindLabel}</Property>
            {meeting.scheduled_start && meeting.scheduled_end && meeting.timezone && (
              <Property label="When">
                {formatInZone(meeting.scheduled_start, meeting.timezone)} – {formatInZone(meeting.scheduled_end, meeting.timezone, { dateStyle: undefined, timeStyle: "short" })}
                <span className="block text-xs text-muted">{meeting.timezone}</span>
              </Property>
            )}
            <Property label="Processing">{STATUS_LABEL[meeting.processing_status]}</Property>
            <Property label="Capture">{STATUS_LABEL[meeting.capture_status]}</Property>
            <Property label="Repository">
              {repo ? (
                <a href={repo.htmlUrl} target="_blank" rel="noreferrer" className="font-mono text-xs hover:underline">
                  {repo.fullName}
                </a>
              ) : meeting.github_repository_id ? (
                "Unavailable"
              ) : (
                <span className="text-muted">Shiproom will infer</span>
              )}
            </Property>
            <Suspense
              fallback={
                <>
                  <Property label="Linear team">…</Property>
                  <Property label="Project">…</Property>
                </>
              }
            >
              <LinearProperties linear={linear} teamId={meeting.linear_team_id} projectId={meeting.linear_project_id} />
            </Suspense>
            <Property label="Language">{meeting.language === "en" ? "English" : "Georgian (experimental)"}</Property>
          </dl>

          <section aria-labelledby="invitees-heading">
            <SectionTitle id="invitees-heading">Invited</SectionTitle>
            <ul className="space-y-1.5">
              {(invitees.data ?? []).map((i) => {
                const profile = (Array.isArray(i.profile) ? i.profile[0] : i.profile) as { display_name: string; github_login: string | null } | null;
                const name = profile?.display_name || profile?.github_login || "Member";
                return (
                  <li key={i.user_id as string} className="flex items-center gap-2">
                    <Avatar name={name} />
                    <span className="min-w-0 truncate">{name}</span>
                    {i.user_id === meeting.organizer_id && <span className="text-xs text-muted">Organizer</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

async function LinearProperties(props: { linear: Promise<LinearOptionsState | null>; teamId: string | null; projectId: string | null }) {
  const linear = await props.linear;
  const team = linear?.status === "ready" ? linear.teams.find((t) => t.id === props.teamId) : undefined;
  const project = team?.projects.find((p) => p.id === props.projectId);
  const infer = <span className="text-muted">Shiproom will infer</span>;
  return (
    <>
      <Property label="Linear team">{team ? `${team.name} (${team.key})` : props.teamId ? "Linear unavailable" : infer}</Property>
      <Property label="Project">{project ? project.name : props.projectId ? "Linear unavailable" : infer}</Property>
    </>
  );
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}
