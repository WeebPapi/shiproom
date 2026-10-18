import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";

const AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const TOKEN_URL = "https://api.linear.app/oauth/token";
const GRAPHQL_URL = "https://api.linear.app/graphql";
const TIMEOUT_MS = 10_000;

export const LINEAR_SCOPES = "read,write";
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

async function linearQuery<T>(authorization: string, query: string, schema: z.ZodType<T>, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authorization },
    body: JSON.stringify({ query, variables }),
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
  const data = await linearQuery(`Bearer ${accessToken}`, `query { organization { id name urlKey } }`, organizationSchema);
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

// shortcut: first 50 teams/projects only to stay within Linear's query budget; paginate for larger workspaces.
export async function fetchLinearContextOptions(authorization: string): Promise<LinearTeamOption[]> {
  const data = await linearQuery(
    authorization,
    `query { teams(first: 50) { nodes { id name key projects(first: 50) { nodes { id name } } } } }`,
    contextSchema,
  );
  return data.teams.nodes.map((t) => ({ id: t.id, name: t.name, key: t.key, projects: t.projects.nodes }));
}

const issueSchema = z.object({ id: z.string(), team: z.object({ id: z.string() }), project: z.object({ id: z.string() }).nullable(), identifier: z.string(), url: z.url(), description: z.string().nullable() });

const contextIssueSchema = issueSchema.extend({ title: z.string(), updatedAt: z.string() });
export type LinearIssueContext = z.infer<typeof contextIssueSchema>;

function contentMarker(description: string): string {
  return `shiproom-content:${createHash("sha256").update(description).digest("hex")}`;
}

// shortcut: context includes the 25 most recently updated issues, add scoped search/pagination for larger projects.
export async function fetchLinearIssues(authorization: string, teamId: string, projectId: string | null): Promise<LinearIssueContext[]> {
  const data = await linearQuery(authorization,
    `query($filter: IssueFilter!) { issues(first: 25, orderBy: updatedAt, filter: $filter) { nodes { id title updatedAt identifier url description team { id } project { id } } } }`,
    z.object({ issues: z.object({ nodes: z.array(contextIssueSchema) }) }),
    { filter: { team: { id: { eq: teamId } }, project: projectId ? { id: { eq: projectId } } : { null: true } } });
  if (data.issues.nodes.some(issue => issue.team.id !== teamId || (issue.project?.id ?? null) !== projectId)) throw new Error("Linear returned issues outside the selected destination.");
  return data.issues.nodes.map(issue => ({ ...issue, description: issue.description?.slice(0, 2000) ?? null }));
}

async function fetchLinearIssue(authorization: string, id: string) {
  const data = await linearQuery(authorization,
    `query($id: String!) { issue(id: $id) { id title updatedAt identifier url description team { id } project { id } } }`,
    z.object({ issue: contextIssueSchema.nullable() }), { id });
  return data.issue;
}

/** Append a grounded amendment; never replace existing content with model output. */
export async function updateLinearIssue(authorization: string, input: { id: string; teamId: string; projectId: string | null; updatedAt: string; amendment: string }) {
  const marker = contentMarker(input.amendment);
  const matches = (issue: LinearIssueContext | null) => issue?.id === input.id && issue.team.id === input.teamId && (issue.project?.id ?? null) === input.projectId;
  try {
    const current = await fetchLinearIssue(authorization, input.id);
    if (!matches(current) || !current) return { ok: false as const, error: "The existing issue is no longer in the selected team/project. No update was made." };
    if (current.description?.includes(marker)) return { ok: true as const, ...current };
    if (current.updatedAt !== input.updatedAt) return { ok: false as const, error: "This issue changed after it was analyzed. No update was made; review it in Linear." };
    const description = [current.description, input.amendment, marker].filter(Boolean).join("\n\n");
    if (description.length > 100_000) return { ok: false as const, error: "The issue is too long to amend safely. No update was made." };
    // shortcut: Linear has no atomic description append/CAS, simultaneous edits in this read/write window need collaborative editing support.
    const data = await linearQuery(authorization,
      `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id title updatedAt identifier url description team { id } project { id } } } }`,
      z.object({ issueUpdate: z.object({ success: z.boolean(), issue: contextIssueSchema.nullable() }) }), { id: input.id, input: { description } });
    const issue = data.issueUpdate.issue;
    if (data.issueUpdate.success && matches(issue) && issue?.description?.includes(marker)) return { ok: true as const, ...issue };
  } catch {
    // A timed-out update may have succeeded; reconcile only this target and saved amendment.
  }
  try {
    const issue = await fetchLinearIssue(authorization, input.id);
    if (matches(issue) && issue?.description?.includes(marker)) return { ok: true as const, ...issue };
  } catch {
    // Retain the saved action for retry without falling back to issue creation.
  }
  return { ok: false as const, error: "Linear could not confirm the update. Retry the saved action; no replacement issue will be created." };
}

export async function createLinearIssue(authorization: string, input: { id: string; teamId: string; projectId: string | null; title: string; description: string }) {
  const marker = contentMarker(input.description);
  try {
    const data = await linearQuery(authorization,
      `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id team { id } project { id } identifier url description } } }`,
      z.object({ issueCreate: z.object({ success: z.boolean(), issue: issueSchema.nullable() }) }),
      { input: { id: input.id, teamId: input.teamId, ...(input.projectId ? { projectId: input.projectId } : {}), title: input.title, description: `${input.description}\n\n${marker}` } });
    const issue = data.issueCreate.issue;
    if (data.issueCreate.success && issue && issue.id === input.id && issue.team.id === input.teamId && (issue.project?.id ?? null) === input.projectId && issue.description?.includes(marker)) return { ok: true as const, ...issue };
    return { ok: false as const, error: "Linear did not create the issue." };
  } catch {
    try {
      const data = await linearQuery(authorization,
        `query($id: String!) { issue(id: $id) { id team { id } project { id } identifier url description } }`,
        z.object({ issue: issueSchema.nullable() }), { id: input.id });
      const issue = data.issue;
      if (issue && issue.id === input.id && issue.team.id === input.teamId && (issue.project?.id ?? null) === input.projectId && issue.description?.includes(marker)) {
        return { ok: true as const, ...issue };
      }
    } catch {
      // Keep the persisted issue UUID for reconciliation on retry.
    }
    return { ok: false as const, error: "Linear could not confirm issue creation. Retry with the saved task identity." };
  }
}
