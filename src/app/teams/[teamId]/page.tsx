import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { PageBody, PageHeader, SectionTitle } from "@/components/page-parts";
import { badgeClass, cardClass, rowClass } from "@/components/styles";
import { requireMembership } from "@/lib/server/auth";
import { getLinearOptions, listTeamRepositories, type LinearOptionsState } from "@/lib/server/connections";
import { listTeamMeetings, listTeamMembers, STATUS_LABEL, type MeetingSummary } from "@/lib/server/meetings";
import { formatInZone } from "@/lib/time";
import { MeetingDialog } from "./meeting-dialog";
import { RefreshPage } from "@/components/refresh-page";

const STATUS_DOT: Partial<Record<MeetingSummary["processingStatus"], string>> = {
  complete: "bg-success",
  failed: "bg-danger",
  partial_failure: "bg-warning",
  needs_context: "bg-warning",
};

export default async function TeamHomePage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { user } = await requireMembership(teamId);
  // Not awaited: the Linear API is slow, so its consumers stream in behind Suspense.
  const linear = getLinearOptions(teamId);
  const [meetings, members, repositories] = await Promise.all([listTeamMeetings(teamId), listTeamMembers(teamId), listTeamRepositories(teamId)]);

  return (
    <>
      <RefreshPage />
      <PageHeader title="Home">
        <MeetingDialog
          teamId={teamId}
          currentUserId={user.id}
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          repositories={repositories}
          linear={linear}
        />
      </PageHeader>
      <PageBody>
        <Suspense fallback={null}>
          <SetupChecklist teamId={teamId} linear={linear} hasRepository={repositories.length > 0} hasTeammates={members.length > 1} />
        </Suspense>

        <MeetingList title="Live now" teamId={teamId} meetings={meetings.live} empty="No calls are live right now." />
        <MeetingList title="Upcoming" teamId={teamId} meetings={meetings.upcoming} empty="No scheduled calls. Use Schedule call to book one." />
        <RecentCalls teamId={teamId} meetings={meetings.recent} />
      </PageBody>
    </>
  );
}

async function SetupChecklist(props: { teamId: string; linear: Promise<LinearOptionsState>; hasRepository: boolean; hasTeammates: boolean }) {
  const base = `/teams/${props.teamId}`;
  const linear = await props.linear;
  const setup = [
    { label: "Connect Linear", href: `${base}/settings/connections`, done: linear.status === "ready" },
    { label: "Add a repository", href: `${base}/settings/connections`, done: props.hasRepository },
    { label: "Invite teammates", href: `${base}/settings/members`, done: props.hasTeammates },
  ];
  if (setup.every((s) => s.done)) return null;

  return (
    <section aria-labelledby="setup-heading">
      <SectionTitle id="setup-heading">Finish setting up</SectionTitle>
      <ul className="flex flex-wrap gap-2">
        {setup.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className={`inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 transition-colors hover:bg-subtle ${s.done ? "text-muted line-through decoration-muted/50" : ""}`}
            >
              {s.done ? (
                <Icon name="check" className="size-3.5 text-success" />
              ) : (
                <span aria-hidden className="size-3 rounded-full border border-dashed border-muted" />
              )}
              {s.label}
              <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MeetingList({ title, teamId, meetings, empty }: { title: string; teamId: string; meetings: MeetingSummary[]; empty: string }) {
  const headingId = `${title.replaceAll(" ", "-")}-heading`;
  return (
    <section aria-labelledby={headingId}>
      <SectionTitle id={headingId}>
        {title} {meetings.length > 0 && <span className="ml-1 tabular-nums">{meetings.length}</span>}
      </SectionTitle>
      {meetings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">{empty}</p>
      ) : (
        <ul className={`${cardClass} divide-y divide-border overflow-hidden`}>
          {meetings.map((m) => (
            <li key={m.id}>
              <Link href={`/teams/${teamId}/meetings/${m.id}`} className={`${rowClass} hover:bg-subtle`}>
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${m.captureStatus === "live" ? "bg-success" : STATUS_DOT[m.processingStatus] ?? "bg-muted/40"}`} />
                <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                <span className="hidden shrink-0 text-xs text-muted sm:inline">{whenLabel(m)}</span>
                <span className={badgeClass}>{m.captureStatus === "live" ? "Join call" : STATUS_LABEL[m.processingStatus]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function whenLabel(m: MeetingSummary) {
  return m.kind === "scheduled" && m.scheduledStart && m.timezone
    ? `${formatInZone(m.scheduledStart, m.timezone)} · ${m.timezone}`
    : `${m.kind === "huddle" ? "Huddle" : "Upload"} · ${formatInZone(m.createdAt, "UTC")} UTC`;
}

function RecentCalls({ teamId, meetings }: { teamId: string; meetings: MeetingSummary[] }) {
  return (
    <section aria-labelledby="recent-heading">
      <SectionTitle id="recent-heading">
        Recent calls {meetings.length > 0 && <span className="ml-1 tabular-nums">{meetings.length}</span>}
      </SectionTitle>
      {meetings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">No meetings yet. Start a huddle to run your first one.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {meetings.map((m) => (
            <li key={m.id}>
              <Link
                href={`/teams/${teamId}/meetings/${m.id}`}
                className={`${cardClass} flex h-full flex-col gap-2 p-4 transition-colors hover:border-muted/50 hover:bg-subtle`}
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${m.captureStatus === "live" ? "bg-success" : STATUS_DOT[m.processingStatus] ?? "bg-muted/40"}`} />
                  <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                  <span className={badgeClass}>{m.captureStatus === "live" ? "Join call" : STATUS_LABEL[m.processingStatus]}</span>
                </div>
                <p className="text-xs text-muted">{whenLabel(m)}</p>
                {m.summary && <p className="line-clamp-3 text-muted">{m.summary}</p>}
                {m.issueIdentifiers.length > 0 && (
                  <p className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="sr-only">Linear issues:</span>
                    {m.issueIdentifiers.map((id) => (
                      <span key={id} className={`${badgeClass} font-mono`}>{id}</span>
                    ))}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
