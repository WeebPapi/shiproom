"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { githubRepositoryNameSchema, invitationInputSchema } from "@/lib/contracts";
import { getPublicEnv } from "@/lib/env";
import { findMembership } from "@/lib/server/auth";
import { serverConfig } from "@/lib/server/config";
import { fetchPublicRepository } from "@/lib/server/github";
import { LINEAR_CALLBACK_PATH, LINEAR_STATE_COOKIE, linearAuthorizeUrl } from "@/lib/server/linear";
import { generateToken, hashToken } from "@/lib/server/tokens";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { fromZodError, type ActionState } from "./state";

const INVITATION_TTL_DAYS = 7;
const NOT_ALLOWED: ActionState = { error: "Only team owners can do that." };
const SERVER_DB_MISSING: ActionState = { error: "Server database access isn't configured yet, so this can't be saved." };

const teamIdSchema = z.uuid();

async function requireOwner(teamId: unknown) {
  const parsed = teamIdSchema.safeParse(teamId);
  if (!parsed.success) return null;
  const access = await findMembership(parsed.data);
  return access?.membership.role === "owner" ? { ...access, teamId: parsed.data } : null;
}

export async function createInvitation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const input = invitationInputSchema.safeParse({ teamId: formData.get("teamId"), email: formData.get("email") });
  if (!input.success) return fromZodError(input.error);
  const owner = await requireOwner(input.data.teamId);
  if (!owner) return NOT_ALLOWED;
  const env = getPublicEnv();
  if (!env) return { error: "The app URL isn't configured." };

  const token = generateToken();
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").insert({
    team_id: owner.teamId,
    email: input.data.email,
    token_hash: hashToken(token),
    invited_by: owner.user.id,
    expires_at: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000).toISOString(),
  });
  if (error) {
    console.error("invitation insert failed", error);
    return { error: "The invitation could not be created." };
  }
  revalidatePath(`/teams/${owner.teamId}/settings/members`);
  return {
    message: `Invitation created for ${input.data.email}. Copy the link now; it is shown only once and expires in ${INVITATION_TTL_DAYS} days.`,
    inviteUrl: new URL(`/invite/${token}`, env.appUrl).toString(),
  };
}

export async function revokeInvitation(formData: FormData) {
  const owner = await requireOwner(formData.get("teamId"));
  const invitationId = z.uuid().safeParse(formData.get("invitationId"));
  if (!owner || !invitationId.success) return;
  const supabase = await createClient();
  await supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId.data)
    .eq("team_id", owner.teamId)
    .is("accepted_at", null);
  revalidatePath(`/teams/${owner.teamId}/settings/members`);
}

// shortcut: does not yet end the removed member's active Daily room session; the media lane must.
export async function removeMember(formData: FormData) {
  const owner = await requireOwner(formData.get("teamId"));
  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!owner || !userId.success || userId.data === owner.user.id) return;
  const supabase = await createClient();
  await supabase.from("memberships").delete().eq("team_id", owner.teamId).eq("user_id", userId.data).eq("role", "member");
  revalidatePath(`/teams/${owner.teamId}/settings/members`);
}

export async function addPublicRepository(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const owner = await requireOwner(formData.get("teamId"));
  if (!owner) return NOT_ALLOWED;
  const name = githubRepositoryNameSchema.safeParse(formData.get("repository"));
  if (!name.success) return { fieldErrors: { repository: name.error.issues.map((i) => i.message) } };
  const admin = createAdminClient();
  if (!admin) return SERVER_DB_MISSING;

  const lookup = await fetchPublicRepository(name.data);
  if (!lookup.ok) {
    return {
      error: {
        not_found_or_private: "That repository doesn't exist or isn't public. Private repositories need the GitHub App, which isn't set up yet.",
        rate_limited: "GitHub is rate-limiting requests. Try again in a few minutes.",
        unavailable: "GitHub couldn't be reached. Try again.",
      }[lookup.reason],
    };
  }
  const { repository } = lookup;
  const { error } = await admin.from("team_repositories").upsert(
    {
      team_id: owner.teamId,
      github_repository_id: String(repository.id),
      full_name: repository.full_name,
      html_url: repository.html_url,
      default_branch: repository.default_branch,
      is_private: false,
      access: "public",
      added_by: owner.user.id,
    },
    { onConflict: "team_id,github_repository_id" },
  );
  if (error) {
    console.error("team_repositories upsert failed", error);
    return { error: "The repository could not be saved." };
  }
  revalidatePath(`/teams/${owner.teamId}`, "layout");
  return { message: `${repository.full_name} is now available as meeting context.` };
}

export async function startLinearConnection(formData: FormData) {
  const owner = await requireOwner(formData.get("teamId"));
  const linear = serverConfig.linear();
  const env = getPublicEnv();
  if (!owner || !linear || !env || !createAdminClient() || !serverConfig.credentialEncryptionKey()) return;

  const state = randomBytes(32).toString("base64url");
  (await cookies()).set(LINEAR_STATE_COOKIE, JSON.stringify({ state, teamId: owner.teamId }), {
    httpOnly: true,
    secure: env.appUrl.startsWith("https://"),
    sameSite: "lax",
    path: LINEAR_CALLBACK_PATH,
    maxAge: 600,
  });
  redirect(
    linearAuthorizeUrl({
      clientId: linear.clientId,
      redirectUri: new URL(LINEAR_CALLBACK_PATH, env.appUrl).toString(),
      state,
    }),
  );
}

export async function disconnectLinear(formData: FormData) {
  const owner = await requireOwner(formData.get("teamId"));
  const admin = createAdminClient();
  if (!owner || !admin) return;
  await admin.from("connections").delete().eq("team_id", owner.teamId).eq("provider", "linear");
  revalidatePath(`/teams/${owner.teamId}`, "layout");
}
