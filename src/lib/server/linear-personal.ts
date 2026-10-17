import "server-only";
import type { LinearTeamList } from "@/lib/call-result";
import { serverConfig } from "@/lib/server/config";

type GraphQl<T> = { data?: T; errors?: { message?: string }[] };

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const key = serverConfig.linearApiKey();
  if (!key) return { ok: false, error: "The Linear personal key isn't set up on this server yet." };
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as GraphQl<T>;
  if (!response.ok || body.errors?.length) return { ok: false, error: body.errors?.[0]?.message ?? "Linear could not be reached." };
  if (!body.data) return { ok: false, error: "Linear returned an empty response." };
  return { ok: true, data: body.data };
}

export async function listLinearDestinations(): Promise<{ ok: true; teams: LinearTeamList[] } | { ok: false; error: string }> {
  const result = await linear<{ teams: { nodes: { id: string; name: string; projects: { nodes: { id: string; name: string }[] } }[] } }>(
    `query { teams(first: 50) { nodes { id name projects(first: 50) { nodes { id name } } } } }`,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    teams: result.data.teams.nodes.map((team) => ({ id: team.id, name: team.name, projects: team.projects.nodes })),
  };
}

export async function findIssueByMarker(teamId: string, marker: string): Promise<{ id: string; identifier: string; url: string } | null> {
  const result = await linear<{ issues: { nodes: { id: string; identifier: string; url: string }[] } }>(
    `query($teamId: ID!, $marker: String!) {
      issues(first: 5, filter: { team: { id: { eq: $teamId } }, description: { contains: $marker } }) {
        nodes { id identifier url }
      }
    }`,
    { teamId, marker },
  );
  if (!result.ok) return null;
  return result.data.issues.nodes[0] ?? null;
}

export async function createLinearIssue(input: { id: string; teamId: string; projectId: string | null; title: string; description: string }): Promise<{ ok: true; identifier: string; url: string } | { ok: false; error: string }> {
  const result = await linear<{ issueCreate: { success: boolean; issue: { identifier: string; url: string } | null } }>(
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier url } } }`,
    { input: { id: input.id, teamId: input.teamId, ...(input.projectId ? { projectId: input.projectId } : {}), title: input.title, description: input.description } },
  );
  if (!result.ok) {
    const existing = await linear<{ issue: { identifier: string; url: string } | null }>(`query($id: String!) { issue(id: $id) { identifier url } }`, { id: input.id });
    if (existing.ok && existing.data.issue) return { ok: true, identifier: existing.data.issue.identifier, url: existing.data.issue.url };
    return result;
  }
  if (!result.data.issueCreate.success || !result.data.issueCreate.issue) return { ok: false, error: "Linear did not create the issue." };
  return { ok: true, identifier: result.data.issueCreate.issue.identifier, url: result.data.issueCreate.issue.url };
}
