import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { signOut } from "@/lib/actions/session";
import { listMemberships, requireMembership } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TeamLayout({ children, params }: { children: React.ReactNode; params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { user, membership } = await requireMembership(teamId);
  const memberships = await listMemberships();

  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("recipient_id", user.id)
    .is("read_at", null);

  const base = `/teams/${teamId}`;
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-border bg-sidebar p-3">
        <div className="px-2 pt-1">
          <Link href={base} className="font-semibold">
            Shiproom
          </Link>
          {memberships.length > 1 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-muted">{membership.teamName}</summary>
              <ul className="mt-1 space-y-0.5">
                {memberships.map((m) => (
                  <li key={m.teamId}>
                    <Link href={`/teams/${m.teamId}`} className="block rounded px-2 py-1 hover:bg-border/50" aria-current={m.teamId === teamId ? "page" : undefined}>
                      {m.teamName}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="mt-1 truncate text-muted">{membership.teamName}</p>
          )}
        </div>

        <nav aria-label="Team" className="flex flex-col gap-0.5">
          <NavLink href={base} exact>
            Home
          </NavLink>
          <NavLink href={`${base}/inbox`}>
            <span>Inbox</span>
            {unread ? (
              <span className="rounded-full bg-accent px-1.5 text-xs text-accent-foreground" aria-label={`${unread} unread`}>
                {unread}
              </span>
            ) : null}
          </NavLink>
          <NavLink href={`${base}/settings/connections`}>Connections</NavLink>
          <NavLink href={`${base}/settings/members`}>Members</NavLink>
        </nav>

        <div className="mt-auto space-y-1 px-2">
          <p className="truncate font-medium">{user.displayName}</p>
          <p className="truncate text-xs text-muted">{membership.role === "owner" ? "Owner" : "Member"}</p>
          <form action={signOut}>
            <button type="submit" className="text-xs text-muted hover:text-foreground">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
