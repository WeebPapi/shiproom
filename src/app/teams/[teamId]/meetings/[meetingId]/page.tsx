import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Icon } from "@/components/icons";
import { Avatar, PageHeader, SectionTitle } from "@/components/page-parts";
import { badgeClass, cardClass } from "@/components/styles";
import { requireMembership } from "@/lib/server/auth";
import { serverConfig } from "@/lib/server/config";
import { getLinearAuthorization, getLinearOptions, listTeamRepositories, type LinearOptionsState } from "@/lib/server/connections";
import { fetchCursorWork } from "@/lib/server/linear";
import { STATUS_LABEL } from "@/lib/server/meetings";
import { createClient } from "@/lib/supabase/server";
import type { CursorWork } from "@/lib/call-result";
import { formatInZone } from "@/lib/time";
import type { CaptureStatus, ProcessingStatus, ExtractionResult, Transcript } from "@/lib/contracts";
import { DEMO_NOTE, DEMO_SEGMENTS } from "@/lib/demo";
import { CallPanel } from "./call-panel";
import { CursorWorkBadge, CursorWorkPoll } from "./cursor-work";
import { RefreshPage } from "@/components/refresh-page";

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
  ended_at: string | null;
  is_demo: boolean;
};

type TaskRow = { id: string; ordinal: number; payload: Partial<ExtractionResult["tasks"][number]>; publication_status: string; linear_issue_url: string | null; linear_issue_identifier: string | null; linear_issue_uuid: string };

export default async function MeetingPage({ params }: { params: Promise<{ teamId: string; meetingId: string }> }) {
  const { teamId, meetingId } = await params;
  const { user } = await requireMembership(teamId);
  if (!z.uuid().safeParse(meetingId).success) notFound();

  const supabase = await createClient();
  const { data: meeting } = await supabase
    .from("meetings")
    .select(
      "id, kind, title, agenda, language, scheduled_start, scheduled_end, timezone, context_mode, github_repository_id, linear_team_id, linear_project_id, capture_status, processing_status, summary, decisions, open_questions, error_message, organizer_id, ended_at, is_demo",
    )
    .eq("id", meetingId)
    .eq("team_id", teamId)
    .maybeSingle<MeetingRow>();
  if (!meeting) notFound();

  // Not awaited: the Linear API is slow, so only its two properties wait for it.
  const linear = meeting.linear_team_id ? getLinearOptions(teamId) : Promise.resolve(null);
  const [invitees, tasks, repositories, transcript] = await Promise.all([
    supabase.from("meeting_invitees").select("user_id, profile:profiles(display_name, github_login)").eq("meeting_id", meetingId),
    supabase
      .from("tasks")
      .select("id, ordinal, payload, publication_status, linear_issue_url, linear_issue_identifier, linear_issue_uuid")
      .eq("meeting_id", meetingId)
      .order("ordinal")
      .returns<TaskRow[]>(),
    listTeamRepositories(teamId),
    supabase.from("transcripts").select("segments, language, complete, source").eq("meeting_id", meetingId).eq("revision", 1).maybeSingle<Pick<Transcript, "segments" | "language" | "complete" | "source">>(),
  ]);

  const repo = repositories.find((r) => r.id === meeting.github_repository_id);
  const kindLabel = meeting.kind === "scheduled" ? "Scheduled call" : meeting.kind === "huddle" ? "Huddle" : "Uploaded audio";
  const publishedIds = (tasks.data ?? []).filter((task) => task.linear_issue_url).map((task) => task.linear_issue_uuid);
  let cursorWork: Record<string, CursorWork> = {};
  try {
    const authorization = publishedIds.length > 0 ? await getLinearAuthorization(teamId) : null;
    if (authorization) cursorWork = await fetchCursorWork(authorization, publishedIds);
  } catch {
    cursorWork = {};
  }
  // shortcut: completed meetings without a PR URL keep polling Linear every 10s while open, including seeded history that never ran Cursor.
  const cursorPending = meeting.processing_status === "complete" && publishedIds.some((id) => !cursorWork[id]?.href);

  return (
    <>
      {!meeting.ended_at && meeting.kind !== "upload" && <RefreshPage />}
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
              {meeting.is_demo && meeting.processing_status === "complete" ? (
                <p className="text-muted">Demo huddle ended. Open an issue below, or start a new take from <Link href="/demo" className="text-accent">the demo studio</Link>.</p>
              ) : meeting.processing_status === "complete" ? (
                <p className="text-muted">This meeting has ended. Its results are below.</p>
              ) : meeting.kind === "upload" ? (
                <p className="text-muted">This meeting is an upload. Live calling is not used for it.</p>
              ) : (
                <CallPanel
                  teamId={teamId}
                  meetingId={meeting.id}
                  isOrganizer={meeting.organizer_id === user.id}
                  dailyReady={Boolean(serverConfig.dailyApiKey())}
                  language={meeting.language}
                  ended={Boolean(meeting.ended_at)}
                  isDemo={meeting.is_demo}
                  live={meeting.capture_status === "live"}
                />
              )}
            </div>
          </section>

          {meeting.is_demo && meeting.processing_status !== "not_started" && (
            <section aria-labelledby="demo-transcript">
              <SectionTitle id="demo-transcript">Georgian transcript · scripted · 00:30</SectionTitle>
              <p className="mb-3 text-xs text-muted">{DEMO_NOTE}</p>
              <ol className={`${cardClass} divide-y divide-border`} lang="ka">
                {DEMO_SEGMENTS.map((segment) => (
                  <li key={segment.id} className="px-4 py-3">
                    <p className="mb-1 text-xs text-muted"><span className="font-mono">00:{String(segment.startMs / 1000).padStart(2, "0")}</span> · {segment.speakerLabel}</p>
                    <p className="leading-relaxed">{segment.text}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="result-heading" className="space-y-4">
            <SectionTitle id="result-heading">Meeting notes</SectionTitle>
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
              <>
              <CursorWorkPoll pending={cursorPending} />
              <ul className={`${cardClass} divide-y divide-border`}>
                {(tasks.data ?? []).map((task) => (
                  <li key={task.id} className="px-4 py-3">
                    <div className="flex min-h-7 items-center gap-3">
                      <span className="min-w-0 flex-1 font-medium">{task.payload.title ?? `Task ${task.ordinal}`}</span>
                      <CursorWorkBadge work={cursorWork[task.linear_issue_uuid]} />
                      {task.linear_issue_url && <span className={badgeClass}>{task.payload.existingLinearIssueId ? "Updated" : "Created"}</span>}
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
                    </div>
                    {task.payload.description && (
                      <details className="mt-1 text-xs text-muted">
                        <summary className="cursor-pointer py-1 hover:text-foreground">Details and evidence</summary>
                        <div className="space-y-3 py-2 leading-relaxed">
                          <p className="whitespace-pre-wrap">{task.payload.description}</p>
                          {(task.payload.acceptanceCriteria ?? []).length > 0 && (
                            <ul className="list-disc space-y-1 pl-4">
                              {task.payload.acceptanceCriteria?.map((criterion, index) => <li key={index}>{criterion}</li>)}
                            </ul>
                          )}
                          {(task.payload.evidenceSegmentIds ?? []).map((id, index) => {
                            const segment = transcript.data?.segments.find((segment) => segment.id === id);
                            return segment ? (
                              <blockquote key={index} className="border-l-2 border-accent/40 pl-3">
                                <span className="mr-2 font-mono">{(segment.startMs / 1000).toFixed(1)}s · {segment.speakerLabel ?? "Unknown speaker"}</span>{segment.text}
                              </blockquote>
                            ) : null;
                          })}
                          {(task.payload.sourceReferences ?? []).filter((source) => source.url.startsWith("https://github.com/") || source.url.startsWith("https://linear.app/")).map((source) => (
                            <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block text-accent hover:underline">{source.kind === "linear" ? "Existing issue" : "Repository context"}</a>
                          ))}
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
              </>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">No tasks yet.</p>
            )}
          </section>
          {transcript.data && !meeting.is_demo && (
            <section aria-labelledby="transcript-heading" className="space-y-3">
              <SectionTitle id="transcript-heading">Transcript</SectionTitle>
              <p className="text-xs text-muted">
                Original {transcript.data.language === "ka" ? "Georgian" : "English"} · {transcript.data.complete ? "Full stored transcript" : "Partial capture — not used to create issues"}
              </p>
              <details className={cardClass}>
                <summary className="cursor-pointer px-4 py-3 font-medium">Read transcript ({transcript.data.segments.length} segments)</summary>
                <ol className="max-h-[32rem] space-y-4 overflow-y-auto border-t border-border p-4" lang={transcript.data.language}>
                  {transcript.data.segments.map((segment) => (
                    <li key={segment.id} id={segment.id}>
                      <p className="mb-1 text-xs text-muted"><span className="font-mono">{(segment.startMs / 1000).toFixed(1)}s–{(segment.endMs / 1000).toFixed(1)}s</span> · {segment.speakerLabel ?? "Unknown speaker"}</p>
                      <p className="whitespace-pre-wrap leading-relaxed">{segment.text}</p>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          )}
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
            <Property label="Language">{meeting.is_demo ? "Georgian (scripted demo)" : meeting.language === "en" ? "English" : "Georgian (experimental)"}</Property>
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
