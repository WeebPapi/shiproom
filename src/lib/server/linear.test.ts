import { afterEach, expect, it, vi } from "vitest";
import { createLinearIssue, fetchCursorWork, findCursorDelegate, updateLinearIssue } from "./linear";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllGlobals());

const input = { id: "issue-id", teamId: "chosen-team", projectId: "chosen-project", title: "[shiproom] Add an empty state", description: "Agreed task. shiproom-task:meeting:1" };
const issue = { id: input.id, team: { id: input.teamId }, project: { id: input.projectId }, identifier: "SHIP-1", url: "https://linear.app/example/issue/SHIP-1", description: input.description };

it.each(["Bearer oauth-token", "personal-key"])("creates in the selected destination with %s authentication", async (authorization) => {
  const fetchMock = vi.fn(async (_url, request) => {
    expect(request.headers.Authorization).toBe(authorization);
    const sent = JSON.parse(request.body).variables.input;
    expect(sent).toMatchObject({ ...input, description: expect.stringContaining(input.description) });
    expect(sent.description).toMatch(/shiproom-content:[a-f0-9]{64}/);
    return Response.json({ data: { issueCreate: { success: true, issue: { ...issue, description: sent.description.replace("Agreed task.", "Agreed task.\n") } } } });
  });
  vi.stubGlobal("fetch", fetchMock);
  expect(await createLinearIssue(authorization, input)).toMatchObject({ ok: true, identifier: "SHIP-1" });
});

it.each([true, false])("reconciles a timeout only when the saved issue matches its destination and content (match=%s)", async (matches) => {
  let committed = issue;
  vi.stubGlobal("fetch", vi.fn(async (_url, request) => {
    const { query, variables } = JSON.parse(request.body);
    if (query.includes("issueCreate")) {
      committed = { ...issue, description: variables.input.description };
      throw new Error("timeout after commit");
    }
    return Response.json({ data: { issue: matches ? committed : { ...committed, project: { id: "other-project" } } } });
  }));
  expect((await createLinearIssue("personal-key", input)).ok).toBe(matches);
});

it("keeps the caller's saved UUID when creation and reconciliation fail", async () => {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, request) => { requests.push(JSON.parse(request.body).variables); throw new Error("unavailable"); }));
  expect((await createLinearIssue("personal-key", input)).ok).toBe(false);
  expect(requests).toEqual([{ input: expect.objectContaining({ id: input.id }) }, { id: input.id }]);
});

it.each(["success", "timeout", "stale", "moved", "unavailable"])("amends only the unchanged scoped issue and reconciles its exact update (%s)", async mode => {
  const amendment = "### Shiproom meeting update\n\n- Show an empty-state message.\nshiproom-task:meeting:2";
  let remote = { ...issue, title: "Human title", description: "Human-authored requirements.", updatedAt: "version-1" };
  if (mode === "stale") remote.updatedAt = "version-2";
  if (mode === "moved") remote = { ...remote, project: { id: "other-project" } };
  const mutation = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (_url, request) => {
    if (mode === "unavailable") throw new Error("read failed");
    const { query, variables } = JSON.parse(request.body);
    if (query.includes("issueUpdate")) {
      expect(variables).toEqual({ id: issue.id, input: { description: expect.stringContaining(`Human-authored requirements.\n\n${amendment}`) } });
      mutation();
      remote = { ...remote, description: variables.input.description.replace("- Show", "* Show"), updatedAt: "version-2" };
      if (mode === "timeout") throw new Error("response lost after commit");
      return Response.json({ data: { issueUpdate: { success: true, issue: remote } } });
    }
    return Response.json({ data: { issue: remote } });
  }));
  const action = { id: issue.id, teamId: input.teamId, projectId: input.projectId, updatedAt: "version-1", amendment };
  const result = await updateLinearIssue("personal-key", action);
  expect(result.ok).toBe(mode === "success" || mode === "timeout");
  expect(mutation).toHaveBeenCalledTimes(result.ok ? 1 : 0);
  if (result.ok) {
    expect((await updateLinearIssue("personal-key", action)).ok).toBe(true);
    expect(mutation).toHaveBeenCalledOnce();
  }
});

it("finds the Cursor app user and omits delegation when none exists", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { users: { nodes: [{ id: "cursor-user" }] } } })));
  expect(await findCursorDelegate("personal-key")).toBe("cursor-user");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { users: { nodes: [] } } })));
  expect(await findCursorDelegate("personal-key")).toBeNull();
});

it("delegates issue creation to Cursor when an app user id is supplied", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url, request) => {
    const sent = JSON.parse(request.body).variables.input;
    expect(sent.delegateId).toBe("cursor-user");
    return Response.json({ data: { issueCreate: { success: true, issue: { ...issue, description: sent.description } } } });
  }));
  expect((await createLinearIssue("personal-key", { ...input, delegateId: "cursor-user" })).ok).toBe(true);
});

it.each([
  {
    name: "assigned",
    nodes: [{ id: "1", delegate: { name: "Cursor" }, agentSessions: { nodes: [] }, attachments: { nodes: [] } }],
    phase: "assigned",
    href: null,
  },
  {
    name: "building",
    nodes: [{ id: "1", delegate: { name: "Cursor" }, agentSessions: { nodes: [{ status: "active", url: "https://linear.app/session", pullRequests: { nodes: [] } }] }, attachments: { nodes: [] } }],
    phase: "building",
    href: "https://linear.app/session",
  },
  {
    name: "draft PR",
    nodes: [{ id: "1", delegate: { name: "Cursor" }, agentSessions: { nodes: [{ status: "complete", url: null, pullRequests: { nodes: [{ pullRequest: { url: "https://github.com/WeebPapi/acme-repo-picker/pull/4", number: 4, status: "draft" } }] } }] }, attachments: { nodes: [] } }],
    phase: "ready",
    href: "https://github.com/WeebPapi/acme-repo-picker/pull/4",
    label: "Draft #4",
  },
])("maps Linear Cursor $name onto the meeting badge", async ({ nodes, phase, href, label }) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { issues: { nodes } } })));
  const work = await fetchCursorWork("personal-key", ["1"]);
  expect(work["1"]).toMatchObject({ phase, href, ...(label ? { label } : {}) });
});

it("does not query Linear for Cursor work without issue ids", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect(await fetchCursorWork("personal-key", [])).toEqual({});
  expect(fetchMock).not.toHaveBeenCalled();
});
