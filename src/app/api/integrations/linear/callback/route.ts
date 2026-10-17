import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getPublicEnv } from "@/lib/env";
import { findMembership } from "@/lib/server/auth";
import { serverConfig } from "@/lib/server/config";
import { saveLinearConnection } from "@/lib/server/connections";
import {
  exchangeLinearCode,
  fetchLinearOrganization,
  LINEAR_CALLBACK_PATH,
  LINEAR_STATE_COOKIE,
} from "@/lib/server/linear";
import { createAdminClient } from "@/lib/supabase/server";

const stateCookieSchema = z.object({ state: z.string().min(32), teamId: z.uuid() });

const sameString = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export async function GET(request: NextRequest) {
  const env = getPublicEnv();
  const origin = env?.appUrl ?? request.nextUrl.origin;
  const cookieStore = await cookies();
  const rawState = cookieStore.get(LINEAR_STATE_COOKIE)?.value;
  cookieStore.delete({ name: LINEAR_STATE_COOKIE, path: LINEAR_CALLBACK_PATH });

  let saved: z.infer<typeof stateCookieSchema> | null = null;
  try {
    saved = rawState ? stateCookieSchema.parse(JSON.parse(rawState)) : null;
  } catch {
    saved = null;
  }
  const returnedState = request.nextUrl.searchParams.get("state");
  if (!saved || !returnedState || !sameString(saved.state, returnedState)) {
    return NextResponse.json({ error: "invalid_oauth_state" }, { status: 400 });
  }

  const back = (result: string) =>
    NextResponse.redirect(new URL(`/teams/${saved.teamId}/settings/connections?linear=${result}`, origin));

  const access = await findMembership(saved.teamId);
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  if (access.membership.role !== "owner") return back("owner_required");

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return back(request.nextUrl.searchParams.get("error") === "access_denied" ? "denied" : "failed");

  const linear = serverConfig.linear();
  const admin = createAdminClient();
  if (!linear || !admin || !env || !serverConfig.credentialEncryptionKey()) return back("not_configured");

  try {
    const tokens = await exchangeLinearCode({
      code,
      ...linear,
      redirectUri: new URL(LINEAR_CALLBACK_PATH, env.appUrl).toString(),
    });
    const organization = await fetchLinearOrganization(tokens.accessToken);

    const { data: existing } = await admin
      .from("connections")
      .select("external_account_id")
      .eq("team_id", saved.teamId)
      .eq("provider", "linear")
      .maybeSingle();
    if (existing && existing.external_account_id !== organization.id) return back("different_workspace");

    await saveLinearConnection(admin, { teamId: saved.teamId, userId: access.user.id, organization, tokens });
    return back("connected");
  } catch (error) {
    console.error("Linear OAuth callback failed", error);
    return back("failed");
  }
}
