"use server";

import { redirect } from "next/navigation";
import { invitationTokenSchema, teamNameSchema } from "@/lib/contracts";
import { getCurrentUser } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "./state";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) redirect("/login");
  const name = teamNameSchema.safeParse(formData.get("name"));
  if (!name.success) return { fieldErrors: { name: name.error.issues.map((i) => i.message) } };

  const supabase = await createClient();
  const { data: teamId, error } = await supabase.rpc("create_team", { p_name: name.data });
  if (error) {
    console.error("create_team failed", error);
    return { error: "The team could not be created. Try again." };
  }
  redirect(`/teams/${teamId}`);
}

const INVITATION_ERRORS: Record<string, string> = {
  verified_email_required: "Your account has no verified email Shiproom can read. Open the sign-in link from your email, then try again.",
  invitation_email_mismatch: "This invitation was sent to a different email address than the one on your GitHub account.",
  invalid_invitation: "This invitation is invalid, expired, or was revoked. Ask a team owner for a new link.",
};

export async function acceptInvitation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = invitationTokenSchema.safeParse(formData.get("token"));
  if (!(await getCurrentUser())) redirect("/login");
  if (!token.success) return { error: INVITATION_ERRORS.invalid_invitation };

  const supabase = await createClient();
  const { data: teamId, error } = await supabase.rpc("accept_invitation", { p_token: token.data });
  if (error) {
    const known = Object.keys(INVITATION_ERRORS).find((code) => error.message.includes(code));
    if (!known) console.error("accept_invitation failed", error);
    return { error: known ? INVITATION_ERRORS[known] : "The invitation could not be accepted. Try again." };
  }
  redirect(`/teams/${teamId}`);
}
