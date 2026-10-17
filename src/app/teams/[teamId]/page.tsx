import Link from "next/link";
import { cardClass } from "@/components/styles";
import { requireMembership } from "@/lib/server/auth";
import { getLinearOptions, listTeamRepositories } from "@/lib/server/connections";
import { listTeamMeetings, listTeamMembers, STATUS_LABEL, type MeetingSummary } from "@/lib/server/meetings";
import { formatInZone } from "@/lib/time";
import { MeetingDialog } from "./meeting-dialog";

export default async function TeamHomePage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { user } = await requireMembership(teamId);
  const [meetings, members, repositories, linear] = await Promise.all([
    listTeamMeetings(teamId),
    listTeamMembers(teamId),
    listTeamRepositories(teamId),
    getLinearOptions(teamId),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Home</h1>
        <MeetingDialog
          teamId={teamId}
          currentUserId={user.id}
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          repositories={repositories}
          linear={linear}
        />
      </header>

      <MeetingList
        title="Upcoming calls"
        teamId={teamId}
        meetings={meetings.upcoming}
        empty="No scheduled calls. Use “Schedule call” to book one."
      />
      <MeetingList title="Recent meetings" teamId={teamId} meetings={meetings.recent} empty="No meetings yet." />
    </div>
  );
}

function MeetingList({ title, teamId, meetings, empty }: { title: string; teamId: string; meetings: MeetingSummary[]; empty: string }) {
  return (
    <section aria-labelledby={`${title}-heading`} className="space-y-2">
      <h2 id={`${title}-heading`} className="font-medium text-muted">
        {title}
      </h2>
      {meetings.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <ul className={`${cardClass} divide-y divide-border`}>
          {meetings.map((m) => (
            <li key={m.id}>
              <Link href={`/teams/${teamId}/meetings/${m.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-sidebar">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.title}</span>
                  <span className="text-xs text-muted">
                    {m.kind === "scheduled" && m.scheduledStart && m.timezone
                      ? `${formatInZone(m.scheduledStart, m.timezone)} · ${m.timezone}`
                      : `${m.kind === "huddle" ? "Huddle" : "Upload"} · ${formatInZone(m.createdAt, "UTC")} UTC`}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">{STATUS_LABEL[m.processingStatus]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
