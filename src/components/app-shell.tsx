import type { CurrentUser, TeamMembership } from "@/lib/server/auth";
import { Icon } from "./icons";
import { NavLink } from "./nav-link";
import { Avatar } from "./page-parts";
import { TeamSwitcher } from "./team-switcher";

/** Signed-in frame: sidebar plus an inset content panel. `teamId` is absent before the user belongs to a team. */
export function AppShell(props: {
  user: CurrentUser;
  memberships: TeamMembership[];
  teamId?: string;
  unread?: number;
  children: React.ReactNode;
}) {
  const base = props.teamId ? `/teams/${props.teamId}` : null;
  const role = props.memberships.find((m) => m.teamId === props.teamId)?.role;
  return (
    <div className="flex h-dvh">
      <aside className="flex w-60 shrink-0 flex-col gap-4 p-2">
        <TeamSwitcher teams={props.memberships} currentTeamId={props.teamId} email={props.user.email} />

        <nav aria-label="Main" className="flex flex-col gap-px">
          {base ? (
            <>
              <NavLink href={base} exact>
                <Icon name="home" />
                Home
              </NavLink>
              <NavLink href={`${base}/inbox`}>
                <Icon name="inbox" />
                Inbox
                {props.unread ? (
                  <span className="ml-auto text-xs text-foreground tabular-nums" aria-label={`${props.unread} unread`}>
                    {props.unread}
                  </span>
                ) : null}
              </NavLink>
            </>
          ) : (
            <NavLink href="/" exact>
              <Icon name="home" />
              Home
            </NavLink>
          )}
        </nav>

        {base && (
          <nav aria-label="Team settings" className="flex flex-col gap-px">
            <p className="px-2 pb-1 text-xs font-medium text-muted">Team</p>
            <NavLink href={`${base}/settings/connections`}>
              <Icon name="plug" />
              Connections
            </NavLink>
            <NavLink href={`${base}/settings/members`}>
              <Icon name="users" />
              Members
            </NavLink>
          </nav>
        )}

        <div className="mt-auto flex items-center gap-2 px-2 py-1">
          <Avatar name={props.user.displayName} />
          <span className="min-w-0 flex-1 truncate">{props.user.displayName}</span>
          {role && <span className="text-xs text-muted">{role === "owner" ? "Owner" : "Member"}</span>}
        </div>
      </aside>

      <main className="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-y-auto rounded-lg border border-border bg-background shadow-xs">{props.children}</main>
    </div>
  );
}
