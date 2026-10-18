import { beforeEach, expect, it, vi } from "vitest";
import { getLinearAuthorization, getLinearOptions } from "./connections";

const mocks = vi.hoisted(() => ({ member: vi.fn(), options: vi.fn(), demoTeam: "demo-team", encryptionKey: null as string | null, admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./auth", () => ({ findMembership: mocks.member }));
vi.mock("./config", () => ({ serverConfig: {
  credentialEncryptionKey: () => mocks.encryptionKey,
  linearDemoTeamId: () => mocks.demoTeam,
  linearApiKey: () => "personal-key",
  linear: () => null,
} }));
vi.mock("./linear", () => ({ fetchLinearContextOptions: mocks.options, LinearAuthError: class extends Error {} }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: mocks.admin, createClient: vi.fn() }));

beforeEach(() => {
  mocks.member.mockResolvedValue({ membership: { role: "member" } });
  mocks.options.mockReset();
  mocks.encryptionKey = null;
  mocks.admin.mockReturnValue({});
});

it("requires an older create-only OAuth connection to reconnect before publishing updates", async () => {
  mocks.encryptionKey = "configured";
  const update = vi.fn();
  const query = { select: () => query, eq: () => query, update: (row: unknown) => { update(row); return query; }, maybeSingle: async () => ({ data: { id: "connection", status: "active" } }) };
  mocks.admin.mockReturnValue({ from: () => query, rpc: async () => ({ data: [{ scope: "read,issues:create", access_token_ciphertext: "not-decrypted" }] }) });
  expect(await getLinearOptions("demo-team")).toEqual({ status: "reconnect_required" });
  expect(update).toHaveBeenCalledWith({ status: "reconnect_required" });
  expect(mocks.options).not.toHaveBeenCalled();
});

it("restricts the server personal key to members of the explicitly configured demo team", async () => {
  expect(await getLinearAuthorization("other-team")).toBeNull();
  mocks.member.mockResolvedValueOnce(null);
  expect(await getLinearAuthorization("demo-team")).toBeNull();
  expect(await getLinearAuthorization("demo-team")).toBe("personal-key");
});

it("exposes only Shiproom teams through the preconfigured demo connection", async () => {
  const allowed = { id: "ship", name: "Shiproom", key: "SHIP", projects: [] };
  mocks.options.mockResolvedValue([allowed, { id: "other", name: "Other work", key: "OTHER", projects: [] }]);
  expect(await getLinearOptions("demo-team")).toEqual({ status: "ready", teams: [allowed] });
});
