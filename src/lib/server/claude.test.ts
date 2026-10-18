import { afterEach, expect, it, vi } from "vitest";
import { extractAgreedTasks } from "./claude";
import { transcriptSchema } from "../contracts";

vi.mock("server-only", () => ({}));
vi.mock("./config", () => ({ serverConfig: { anthropicApiKey: () => "test-key", anthropicWorkspaceId: () => null, anthropicModel: () => "test-model" } }));
afterEach(() => vi.unstubAllGlobals());

it.each(["known", "unknown", "duplicate"])("accepts only one update per supplied issue and assigns its server-read version (%s)", async mode => {
  const transcript = transcriptSchema.parse({ meetingId: "00000000-0000-4000-8000-000000000002", revision: 1, source: "daily", complete: true, language: "en", segments: [{ id: "seg-1", startMs: 0, endMs: 2000, speakerLabel: "Speaker 1", speakerUserId: null, text: "We agree to add the empty-state requirement to SHI-1." }] });
  const task = { title: "Add empty-state requirement", description: "Show a message when no repositories are available.", acceptanceCriteria: [], evidenceSegmentIds: ["seg-1"], existingLinearIssueId: mode === "unknown" ? "not-supplied" : "allowed-issue", existingLinearIssueUpdatedAt: "model-invented-version" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ content: [{ type: "tool_use", name: "record_extraction", input: { summary: "Refine SHI-1.", decisions: [], openQuestions: [], tasks: mode === "duplicate" ? [task, task] : [task] } }] })));
  const result = await extractAgreedTasks(transcript, { repository: { id: "123", fullName: "example/demo", url: "https://github.com/example/demo", readme: "", truncated: false }, linearTeam: "Shiproom", linearProject: "Demo", linearIssues: [{ id: "allowed-issue", title: "Repository picker", description: "Existing scope", updatedAt: "server-read-version", identifier: "SHI-1", url: "https://linear.app/example/issue/SHI-1", team: { id: "team" }, project: { id: "project" } }] });
  expect(result.ok).toBe(mode === "known");
  if (result.ok) {
    expect(result.result.tasks[0].existingLinearIssueUpdatedAt).toBe("server-read-version");
    expect(result.result.tasks[0].sourceReferences).toContainEqual({ kind: "linear", url: "https://linear.app/example/issue/SHI-1" });
  }
});
