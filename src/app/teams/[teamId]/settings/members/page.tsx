import { cardClass } from "@/components/styles";
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
  const members = await listTeamMembers(teamId);

  let pending: InvitationRow[] = [];
  if (isOwner) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("invitations")
      .select("id, email, expires_at, created_at")
      .eq("team_id", teamId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .returns<InvitationRow[]>();
    pending = data ?? [];
  }

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-lg font-semibold">Members</h1>

      <section aria-labelledby="members-heading" className="space-y-2">
        <h2 id="members-heading" className="font-medium text-muted">
          Team members
        </h2>
        <ul className={`${cardClass} divide-y divide-border`}>
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="font-medium">
                  {m.name} {m.githubLogin && <span className="font-normal text-muted">@{m.githubLogin}</span>}
                </p>
                <p className="text-xs text-muted">{m.role === "owner" ? "Owner" : "Member"}</p>
              </div>
              {isOwner && m.role === "member" && m.id !== user.id && (
                <form action={removeMember}>
                  <input type="hidden" name="teamId" value={teamId} />
                  <input type="hidden" name="userId" value={m.id} />
                  <button type="submit" className="text-xs text-danger hover:underline">
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isOwner ? (
        <section aria-labelledby="invite-heading" className="space-y-3">
          <h2 id="invite-heading" className="font-medium text-muted">
            Invite a teammate
          </h2>
          <p className="text-muted">
            The invitation only works for someone signed in with GitHub whose verified email matches. Shiproom doesn&apos;t send email; share the
            link yourself.
          </p>
          <InviteForm teamId={teamId} />

          {pending.length > 0 && (
            <ul className={`${cardClass} divide-y divide-border`}>
              {pending.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p>{inv.email}</p>
                    <p className="text-xs text-muted">Expires {new Date(inv.expires_at).toUTCString()}</p>
                  </div>
                  <form action={revokeInvitation}>
                    <input type="hidden" name="teamId" value={teamId} />
                    <input type="hidden" name="invitationId" value={inv.id} />
                    <button type="submit" className="text-xs text-danger hover:underline">
                      Revoke
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="text-muted">Only team owners can invite or remove members.</p>
      )}
    </div>
  );
}
