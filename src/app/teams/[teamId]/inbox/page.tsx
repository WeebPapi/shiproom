import Link from "next/link";
import { cardClass } from "@/components/styles";
import { markNotificationRead } from "@/lib/actions/inbox";
import { requireMembership } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";

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
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, meeting_id, linear_issue_url, read_at, resolved_at, created_at")
    .eq("team_id", teamId)
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<NotificationRow[]>();
  if (error) throw error;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">Inbox</h1>
      {data.length === 0 ? (
        <p className="text-muted">Nothing here yet. Issue links from meetings you joined will appear here.</p>
      ) : (
        <ul className={`${cardClass} divide-y divide-border`}>
          {data.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className={n.read_at ? "text-muted" : "font-medium"}>
                  {!n.read_at && <span className="sr-only">Unread: </span>}
                  {n.title}
                </p>
                <p className="space-x-3 text-xs">
                  {n.kind === "context_required" && !n.resolved_at && <span className="text-warning">Needs your input</span>}
                  <Link href={`/teams/${teamId}/meetings/${n.meeting_id}`} className="text-accent">
                    {n.kind === "context_required" ? "Choose meeting context" : "Meeting result"}
                  </Link>
                  {n.linear_issue_url && (
                    <a href={n.linear_issue_url} target="_blank" rel="noreferrer" className="text-accent">
                      Open in Linear
                    </a>
                  )}
                </p>
              </div>
              {!n.read_at && (
                <form action={markNotificationRead}>
                  <input type="hidden" name="notificationId" value={n.id} />
                  <input type="hidden" name="teamId" value={teamId} />
                  <button type="submit" className="text-xs text-muted hover:text-foreground">
                    Mark read
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
