import { AppShell } from "@/components/app-shell";
import { listMemberships, requireMembership } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TeamLayout({ children, params }: { children: React.ReactNode; params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { user } = await requireMembership(teamId);
  const memberships = await listMemberships();

  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("recipient_id", user.id)
    .is("read_at", null);

  return (
    <AppShell user={user} memberships={memberships} teamId={teamId} unread={unread ?? 0}>
      {children}
    </AppShell>
  );
}
