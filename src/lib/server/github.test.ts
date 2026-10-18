import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicRepository, fetchPublicRepositoryContext, listPublicRepositories } from "./github";

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

  it("loads a bounded README for the approved public repository", async () => {
    const text = "a".repeat(16_001);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(repository)).mockResolvedValueOnce(
      Response.json({ encoding: "base64", content: Buffer.from(text).toString("base64") }),
    ));
    const context = await fetchPublicRepositoryContext("123", "example/demo");
    expect(context).toMatchObject({ id: "123", fullName: "example/demo", truncated: true });
    expect(context.readme).toHaveLength(16_000);
  });

  it("blocks source reads if an approved owner/name now points at another repository ID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...repository, id: 999 })));
    await expect(fetchPublicRepositoryContext("123", "example/demo")).rejects.toThrow("no longer available");
  });
});
