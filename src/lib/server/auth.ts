import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  displayName: string;
  githubLogin: string | null;
  avatarUrl: string | null;
  email: string | null;
  emailVerified: boolean;
};

export type TeamRole = "owner" | "member";

/** The auth server's verified user for this request; shared so profile and membership reads can run in parallel. */
const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
});

/** Data access layer entry point: the verified user for this request, or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();
  const github = user.identities?.find((identity) => identity.provider === "github")?.identity_data;
  const githubLogin = typeof github?.user_name === "string" && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(github.user_name) ? github.user_name : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, github_login, avatar_url, email, email_verified")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    displayName: profile?.display_name || profile?.github_login || "Signed-in user",
    githubLogin,
    avatarUrl: profile?.avatar_url ?? null,
    email: profile?.email ?? null,
    emailVerified: profile?.email_verified ?? false,
  };
});

export async function requireUser(nextPath = "/"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export type TeamMembership = { teamId: string; teamName: string; role: TeamRole };

export const listMemberships = cache(async (): Promise<TeamMembership[]> => {
  const user = await getAuthUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, team:teams(id, name)")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const team = Array.isArray(row.team) ? row.team[0] : row.team;
    return team ? [{ teamId: team.id as string, teamName: team.name as string, role: row.role as TeamRole }] : [];
  });
});

/**
 * Resolves the caller's membership in a team. Non-members get a 404 so team IDs
 * are not confirmed to outsiders. Use before every team-scoped read or write.
 */
export async function requireMembership(teamId: string, options: { role?: TeamRole } = {}) {
  const [user, memberships] = await Promise.all([requireUser(`/teams/${teamId}`), listMemberships()]);
  const membership = memberships.find((m) => m.teamId === teamId);
  if (!membership) notFound();
  if (options.role === "owner" && membership.role !== "owner") notFound();
  return { user, membership };
}

/** Like requireMembership, but returns null instead of rendering a 404 (for route handlers/actions). */
export async function findMembership(teamId: string) {
  const [user, memberships] = await Promise.all([getCurrentUser(), listMemberships()]);
  if (!user) return null;
  const membership = memberships.find((m) => m.teamId === teamId);
  return membership ? { user, membership } : null;
}
