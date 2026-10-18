import "server-only";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { serverConfig } from "./config";
import { findMembership } from "./auth";
import { decryptSecret, encryptSecret } from "./crypto";
import {
  fetchLinearContextOptions,
  LinearAuthError,
  refreshLinearTokens,
  type LinearTeamOption,
  type LinearTokens,
} from "./linear";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const aad = (teamId: string) => `${teamId}:linear`;

/** Caller must already have verified the user is an owner of teamId. */
export async function saveLinearConnection(
  admin: AdminClient,
  params: { teamId: string; userId: string; organization: { id: string; name: string; urlKey: string }; tokens: LinearTokens },
) {
  const key = serverConfig.credentialEncryptionKey();
  if (!key) throw new Error("Credential encryption key is not configured.");

  const { data: connection, error } = await admin
    .from("connections")
    .upsert(
      {
        team_id: params.teamId,
        provider: "linear",
        external_account_id: params.organization.id,
        external_account_name: params.organization.name,
        external_account_url: `https://linear.app/${params.organization.urlKey}`,
        status: "active",
        connected_by: params.userId,
      },
      { onConflict: "team_id,provider" },
    )
    .select("id")
    .single();
  if (error) throw error;

  const { error: secretError } = await admin.rpc("put_connection_secret", {
    p_connection_id: connection.id,
    p_access_token_ciphertext: encryptSecret(params.tokens.accessToken, key, aad(params.teamId)),
    p_refresh_token_ciphertext: params.tokens.refreshToken
      ? encryptSecret(params.tokens.refreshToken, key, aad(params.teamId))
      : null,
    p_scope: params.tokens.scope,
    p_expires_at: params.tokens.expiresAt,
  });
  if (secretError) throw secretError;
}

/**
 * Returns a usable Linear access token for a team, refreshing it if expired.
 * Caller must already have verified team membership.
 */
async function getLinearAccessToken(admin: AdminClient, teamId: string): Promise<string | null> {
  const key = serverConfig.credentialEncryptionKey();
  if (!key) return null;
  const { data: connection } = await admin
    .from("connections")
    .select("id, status")
    .eq("team_id", teamId)
    .eq("provider", "linear")
    .maybeSingle();
  if (!connection || connection.status !== "active") return null;

  const { data: secrets, error } = await admin.rpc("get_connection_secret", { p_connection_id: connection.id });
  if (error) throw error;
  const secret = (secrets as { access_token_ciphertext: string; refresh_token_ciphertext: string | null; expires_at: string | null; scope: string | null }[])[0];
  if (!secret) return null;
  if (!secret.scope?.split(/[\s,]+/).includes("write")) throw new LinearAuthError("Reconnect Linear to allow agreed issue updates.");

  const expired = secret.expires_at !== null && Date.parse(secret.expires_at) <= Date.now() + 60_000;
  if (!expired) return decryptSecret(secret.access_token_ciphertext, key, aad(teamId));

  const linear = serverConfig.linear();
  if (!secret.refresh_token_ciphertext || !linear) throw new LinearAuthError("Linear access expired.");
  const tokens = await refreshLinearTokens({
    refreshToken: decryptSecret(secret.refresh_token_ciphertext, key, aad(teamId)),
    ...linear,
  });
  await admin.rpc("put_connection_secret", {
    p_connection_id: connection.id,
    p_access_token_ciphertext: encryptSecret(tokens.accessToken, key, aad(teamId)),
    p_refresh_token_ciphertext: tokens.refreshToken
      ? encryptSecret(tokens.refreshToken, key, aad(teamId))
      : secret.refresh_token_ciphertext,
    p_scope: tokens.scope ?? secret.scope,
    p_expires_at: tokens.expiresAt,
  });
  return tokens.accessToken;
}

export type LinearOptionsState =
  | { status: "not_configured" }
  | { status: "disconnected" }
  | { status: "reconnect_required" }
  | { status: "unavailable" }
  | { status: "ready"; teams: LinearTeamOption[] };

/** Returns credentials only for a current member and the team's own connection or explicit demo binding. */
export async function getLinearAuthorization(teamId: string): Promise<string | null> {
  if (!(await findMembership(teamId))) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const token = await getLinearAccessToken(admin, teamId);
  if (token) return `Bearer ${token}`;
  return serverConfig.linearDemoTeamId() === teamId ? serverConfig.linearApiKey() : null;
}

/** Authorized Linear destinations for a team. Caller must already have verified membership. */
export async function getLinearOptions(teamId: string): Promise<LinearOptionsState> {
  if (!(await findMembership(teamId))) return { status: "disconnected" };
  const admin = createAdminClient();
  if (!admin) return { status: "not_configured" };
  try {
    const authorization = await getLinearAuthorization(teamId);
    if (!authorization) {
      if (!serverConfig.linear()) return { status: "not_configured" };
      const { data } = await admin.from("connections").select("status").eq("team_id", teamId).eq("provider", "linear").maybeSingle();
      return data?.status === "reconnect_required" ? { status: "reconnect_required" } : { status: "disconnected" };
    }
    const teams = await fetchLinearContextOptions(authorization);
    return {
      status: "ready",
      teams: authorization.startsWith("Bearer ") ? teams : teams.filter((team) => team.name.toLowerCase().includes("shiproom")),
    };
  } catch (error) {
    if (error instanceof LinearAuthError) {
      await admin.from("connections").update({ status: "reconnect_required" }).eq("team_id", teamId).eq("provider", "linear");
      return { status: "reconnect_required" };
    }
    console.error("Linear context options failed", error);
    return { status: "unavailable" };
  }
}

export type RepositoryOption = { id: string; fullName: string; htmlUrl: string; access: "public" | "github_app" };

/** Owner-approved repositories, read with the user's RLS-scoped client. */
export async function listTeamRepositories(teamId: string): Promise<RepositoryOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_repositories")
    .select("github_repository_id, full_name, html_url, access")
    .eq("team_id", teamId)
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.github_repository_id, fullName: r.full_name, htmlUrl: r.html_url, access: r.access }));
}
