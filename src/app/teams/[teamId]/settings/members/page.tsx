import { Avatar, PageBody, PageHeader, SectionTitle } from "@/components/page-parts";
import { badgeClass, buttonClass, cardClass, rowClass } from "@/components/styles";
import { removeMember, revokeInvitation } from "@/lib/actions/team";
import { requireMembership } from "@/lib/server/auth";
import { listTeamMembers } from "@/lib/server/meetings";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";

type InvitationRow = { id: string; email: string; expires_at: string; created_at: string };

export default async function MembersPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { user, membership } = await requireMembership(teamId);
  const isOwner = membership.role === "owner";
  const supabase = await createClient();
  const [members, { data: pending }] = await Promise.all([
    listTeamMembers(teamId),
    isOwner
      ? supabase
          .from("invitations")
          .select("id, email, expires_at, created_at")
          .eq("team_id", teamId)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .returns<InvitationRow[]>()
      : { data: [] as InvitationRow[] },
  ]);

  return (
    <>
      <PageHeader title="Members" />
      <PageBody>
        <section aria-labelledby="members-heading">
          <SectionTitle id="members-heading">
            Team members <span className="ml-1 tabular-nums">{members.length}</span>
          </SectionTitle>
          <ul className={`${cardClass} divide-y divide-border`}>
            {members.map((m) => (
              <li key={m.id} className={rowClass}>
                <Avatar name={m.name} className="size-7 text-xs" />
                <p className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{m.name}</span>
                  {m.githubLogin && <span className="ml-2 text-muted">@{m.githubLogin}</span>}
                  {m.id === user.id && <span className="ml-2 text-muted">(you)</span>}
                </p>
                <span className={badgeClass}>{m.role === "owner" ? "Owner" : "Member"}</span>
                {isOwner && m.role === "member" && m.id !== user.id && (
                  <form action={removeMember}>
                    <input type="hidden" name="teamId" value={teamId} />
                    <input type="hidden" name="userId" value={m.id} />
                    <button type="submit" className={buttonClass.danger}>
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>

        {isOwner ? (
          <section aria-labelledby="invite-heading">
            <SectionTitle id="invite-heading">Invite a teammate</SectionTitle>
            <div className={`${cardClass} space-y-3 p-4`}>
              <p className="text-muted">
                The invitation only works for someone signed in with GitHub whose verified email matches. Shiproom doesn&apos;t send email; share the
                link yourself.
              </p>
              <InviteForm teamId={teamId} />
            </div>

            {pending && pending.length > 0 && (
              <>
                <h3 className="mt-6 mb-2 text-xs font-medium text-muted">Pending invitations</h3>
                <ul className={`${cardClass} divide-y divide-border`}>
                  {pending.map((inv) => (
                    <li key={inv.id} className={rowClass}>
                      <p className="min-w-0 flex-1 truncate">{inv.email}</p>
                      <span className="text-xs text-muted">Expires {new Date(inv.expires_at).toUTCString()}</span>
                      <form action={revokeInvitation}>
                        <input type="hidden" name="teamId" value={teamId} />
                        <input type="hidden" name="invitationId" value={inv.id} />
                        <button type="submit" className={buttonClass.danger}>
                          Revoke
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ) : (
          <p className="text-muted">Only team owners can invite or remove members.</p>
        )}
      </PageBody>
    </>
  );
}
