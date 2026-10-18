import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageBody, PageHeader } from "@/components/page-parts";
import { buttonClass, cardClass, rowClass } from "@/components/styles";
import { markNotificationRead } from "@/lib/actions/inbox";
import { requireMembership } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";
import { formatInZone } from "@/lib/time";
import { RefreshInbox } from "./refresh-inbox";

type NotificationRow = {
  id: string;
  kind: "task_ready" | "context_required";
  title: string;
  meeting_id: string;
  linear_issue_url: string | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

export default async function InboxPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { user } = await requireMembership(teamId);
  const supabase = await createClient();
  const [notifications, participation] = await Promise.all([supabase
    .from("notifications")
    .select("id, kind, title, meeting_id, linear_issue_url, read_at, resolved_at, created_at")
    .eq("team_id", teamId)
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<NotificationRow[]>(),
    supabase.from("meeting_participants")
      .select("meeting:meetings!inner(id, title, summary, ended_at)")
      .eq("team_id", teamId).eq("user_id", user.id)
      .not("meeting.summary", "is", null)
      .order("ended_at", { referencedTable: "meetings", ascending: false })
      .limit(50)
      .returns<{ meeting: { id: string; title: string; summary: string; ended_at: string | null } | null }[]>(),
  ]);
  if (notifications.error) throw notifications.error;
  if (participation.error) throw participation.error;
  const data = notifications.data;
  const recaps = participation.data.flatMap((row) => row.meeting ? [row.meeting] : []);

  return (
    <>
      <PageHeader title="Inbox" />
      <PageBody>
        <RefreshInbox />
        {recaps.length > 0 && (
          <section aria-labelledby="recaps-heading" className="mb-6 space-y-3">
            <h2 id="recaps-heading" className="font-medium">Meeting notes and transcripts</h2>
            <ul className={`${cardClass} divide-y divide-border`}>
              {recaps.map((meeting) => (
                <li key={meeting.id}>
                  <Link href={`/teams/${teamId}/meetings/${meeting.id}#result-heading`} className="block space-y-1 px-4 py-3 hover:bg-surface-hover">
                    <p className="font-medium">{meeting.title}</p>
                    <p className="line-clamp-2 text-xs text-muted">{meeting.summary}</p>
                    <p className="text-xs text-accent">Read meeting notes, transcript, and issue links</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {data.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-muted">
            No issue notifications. Meeting notes, transcripts, and issue links from calls you joined appear here after processing.
          </p>
        ) : (
          <ul className={`${cardClass} divide-y divide-border overflow-hidden`}>
            {data.map((n) => (
              <li key={n.id} className={rowClass}>
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${n.read_at ? "" : "bg-accent"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate ${n.read_at ? "text-muted" : "font-medium"}`}>
                    {!n.read_at && <span className="sr-only">Unread: </span>}
                    {n.title}
                  </p>
                  <p className="flex flex-wrap gap-x-3 text-xs">
                    {n.kind === "context_required" && !n.resolved_at && <span className="text-warning">Needs your input</span>}
                    <Link href={`/teams/${teamId}/meetings/${n.meeting_id}`} className="text-muted hover:text-foreground">
                      {n.kind === "context_required" ? "Choose meeting context" : "Meeting result"}
                    </Link>
                    {n.linear_issue_url && (
                      <a href={n.linear_issue_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                        Open in Linear
                        <Icon name="external" className="size-3" />
                      </a>
                    )}
                  </p>
                </div>
                <span className="hidden shrink-0 text-xs text-muted sm:inline">{formatInZone(n.created_at, "UTC")} UTC</span>
                {!n.read_at && (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="notificationId" value={n.id} />
                    <input type="hidden" name="teamId" value={teamId} />
                    <button type="submit" className={`${buttonClass.ghost} h-7 px-2 text-xs`}>
                      Mark read
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </>
  );
}
