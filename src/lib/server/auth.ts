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

/** Data access layer entry point: the verified user for this request, or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, github_login, avatar_url, email, email_verified")
    .eq("id", data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    displayName: profile?.display_name || profile?.github_login || "Signed-in user",
    githubLogin: profile?.github_login ?? null,
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
  const user = await getCurrentUser();
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
  const user = await requireUser(`/teams/${teamId}`);
  const membership = (await listMemberships()).find((m) => m.teamId === teamId);
  if (!membership) notFound();
  if (options.role === "owner" && membership.role !== "owner") notFound();
  return { user, membership };
}

/** Like requireMembership, but returns null instead of rendering a 404 (for route handlers/actions). */
export async function findMembership(teamId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const membership = (await listMemberships()).find((m) => m.teamId === teamId);
  return membership ? { user, membership } : null;
}
