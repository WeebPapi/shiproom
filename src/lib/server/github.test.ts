import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicRepository, listPublicRepositories } from "./github";

vi.mock("server-only", () => ({}));

const repository = { id: 123, full_name: "example/demo", html_url: "https://github.com/example/demo", default_branch: "main", private: false };

afterEach(() => vi.unstubAllGlobals());

describe("public GitHub context", () => {
  it("suggests public repositories without exposing private entries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([repository, { ...repository, id: 456, private: true }])));
    expect(await listPublicRepositories("example")).toEqual({ status: "ready", repositories: [repository] });
  });

  it.each([403, 429, 500])("makes provider HTTP %s failures recoverable", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    const reason = status === 500 ? "unavailable" : "rate_limited";
    expect(await listPublicRepositories("example")).toEqual({ status: reason });
    expect(await fetchPublicRepository("example/demo")).toEqual({ ok: false, reason });
  });

  it("rejects malformed provider data without crashing the connection page or add action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ id: "invalid" })));
    expect(await listPublicRepositories("example")).toEqual({ status: "unavailable" });
    expect(await fetchPublicRepository("example/demo")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("rechecks public visibility before approving a repository", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...repository, private: true })));
    expect(await fetchPublicRepository("example/demo")).toEqual({ ok: false, reason: "not_found_or_private" });
  });
});
