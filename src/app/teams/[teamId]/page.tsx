import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { PageBody, PageHeader, SectionTitle } from "@/components/page-parts";
import { badgeClass, cardClass, rowClass } from "@/components/styles";
import { requireMembership } from "@/lib/server/auth";
import { integrationReadiness } from "@/lib/server/config";
import { getLinearOptions, listTeamRepositories, type LinearOptionsState } from "@/lib/server/connections";
import { listTeamMeetings, listTeamMembers, STATUS_LABEL, type MeetingSummary } from "@/lib/server/meetings";
import { formatInZone } from "@/lib/time";
import { MeetingDialog } from "./meeting-dialog";

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

        <MeetingList title="Upcoming" teamId={teamId} meetings={meetings.upcoming} empty="No scheduled calls. Use Schedule call to book one." />
        <MeetingList title="Recent" teamId={teamId} meetings={meetings.recent} empty="No meetings yet. Start a huddle to run your first one." />
      </PageBody>
    </>
  );
}

async function SetupChecklist(props: { teamId: string; linear: Promise<LinearOptionsState>; hasRepository: boolean; hasTeammates: boolean }) {
  const base = `/teams/${props.teamId}`;
  const linear = await props.linear;
  const setup = [
    { label: "Connect Linear", href: `${base}/settings/connections`, done: linear.status === "ready" || integrationReadiness().linearPersonal === "configured" },
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
  return (
    <section aria-labelledby={`${title}-heading`}>
      <SectionTitle id={`${title}-heading`}>
        {title} {meetings.length > 0 && <span className="ml-1 tabular-nums">{meetings.length}</span>}
      </SectionTitle>
      {meetings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">{empty}</p>
      ) : (
        <ul className={`${cardClass} divide-y divide-border overflow-hidden`}>
          {meetings.map((m) => (
            <li key={m.id}>
              <Link href={`/teams/${teamId}/meetings/${m.id}`} className={`${rowClass} hover:bg-subtle`}>
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[m.processingStatus] ?? "bg-muted/40"}`} />
                <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                <span className="hidden shrink-0 text-xs text-muted sm:inline">
                  {m.kind === "scheduled" && m.scheduledStart && m.timezone
                    ? `${formatInZone(m.scheduledStart, m.timezone)} · ${m.timezone}`
                    : `${m.kind === "huddle" ? "Huddle" : "Upload"} · ${formatInZone(m.createdAt, "UTC")} UTC`}
                </span>
                <span className={badgeClass}>{STATUS_LABEL[m.processingStatus]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
