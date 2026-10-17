import "server-only";
import { z } from "zod";

const AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const TOKEN_URL = "https://api.linear.app/oauth/token";
const GRAPHQL_URL = "https://api.linear.app/graphql";
const TIMEOUT_MS = 10_000;

export const LINEAR_SCOPES = "read,issues:create";
export const LINEAR_CALLBACK_PATH = "/api/integrations/linear/callback";
export const LINEAR_STATE_COOKIE = "shiproom_linear_oauth";

export class LinearAuthError extends Error {}

export function linearAuthorizeUrl(params: { clientId: string; redirectUri: string; state: string }) {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: LINEAR_SCOPES,
    state: params.state,
    prompt: "consent",
  }).toString();
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive().optional(),
  scope: z.union([z.string(), z.array(z.string())]).optional(),
});

export type LinearTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
};

async function requestTokens(body: Record<string, string>): Promise<LinearTokens> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 400 || response.status === 401) throw new LinearAuthError("Linear rejected the authorization.");
  if (!response.ok) throw new Error(`Linear token endpoint returned ${response.status}.`);
  const parsed = tokenResponseSchema.parse(await response.json());
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresAt: parsed.expires_in ? new Date(Date.now() + parsed.expires_in * 1000).toISOString() : null,
    scope: Array.isArray(parsed.scope) ? parsed.scope.join(",") : (parsed.scope ?? null),
  };
}

export function exchangeLinearCode(params: { code: string; clientId: string; clientSecret: string; redirectUri: string }) {
  return requestTokens({
    grant_type: "authorization_code",
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
  });
}

export function refreshLinearTokens(params: { refreshToken: string; clientId: string; clientSecret: string }) {
  return requestTokens({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  });
}

async function linearQuery<T>(accessToken: string, query: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 401) throw new LinearAuthError("Linear access was revoked or expired.");
  if (!response.ok) throw new Error(`Linear API returned ${response.status}.`);
  const body = (await response.json()) as { data?: unknown; errors?: { message: string; extensions?: { code?: string } }[] };
  if (body.errors?.some((e) => e.extensions?.code === "AUTHENTICATION_ERROR")) throw new LinearAuthError("Linear access was revoked.");
  if (body.errors?.length) throw new Error(`Linear API error: ${body.errors[0].message}`);
  return schema.parse(body.data);
}

const organizationSchema = z.object({
  organization: z.object({ id: z.string(), name: z.string(), urlKey: z.string() }),
});

export async function fetchLinearOrganization(accessToken: string) {
  const data = await linearQuery(accessToken, `query { organization { id name urlKey } }`, organizationSchema);
  return data.organization;
}

const contextSchema = z.object({
  teams: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        key: z.string(),
        projects: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string() })) }),
      }),
    ),
  }),
});

export type LinearTeamOption = { id: string; name: string; key: string; projects: { id: string; name: string }[] };

// shortcut: first 100 teams/projects only, no pagination; enough for one demo workspace.
export async function fetchLinearContextOptions(accessToken: string): Promise<LinearTeamOption[]> {
  const data = await linearQuery(
    accessToken,
    `query { teams(first: 100) { nodes { id name key projects(first: 100) { nodes { id name } } } } }`,
    contextSchema,
  );
  return data.teams.nodes.map((t) => ({ id: t.id, name: t.name, key: t.key, projects: t.projects.nodes }));
}
