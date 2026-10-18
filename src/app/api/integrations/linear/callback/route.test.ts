import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const STATE = "a".repeat(32);

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  cookie: vi.fn(),
  membership: vi.fn(),
  save: vi.fn(),
  exchange: vi.fn(),
  organization: vi.fn(),
  admin: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookie, delete: vi.fn() }),
}));
vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({
    appUrl: "https://shiproom.example.com",
    supabaseUrl: "https://example.supabase.co",
    supabasePublishableKey: "publishable",
  }),
}));
vi.mock("@/lib/server/auth", () => ({ findMembership: mocks.membership }));
vi.mock("@/lib/server/config", () => ({
  serverConfig: {
    linear: () => ({ clientId: "client-id", clientSecret: "client-secret" }),
    credentialEncryptionKey: () => "encryption-key",
  },
}));
vi.mock("@/lib/server/connections", () => ({ saveLinearConnection: mocks.save }));
vi.mock("@/lib/server/linear", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/linear")>();
  return { ...actual, exchangeLinearCode: mocks.exchange, fetchLinearOrganization: mocks.organization };
});
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: mocks.admin }));

beforeEach(() => {
  mocks.cookie.mockReset();
  mocks.membership.mockReset();
  mocks.save.mockReset();
  mocks.exchange.mockReset();
  mocks.organization.mockReset();
  mocks.admin.mockReset();
});

it("rejects a missing or mismatched OAuth state with 400", async () => {
  mocks.cookie.mockReturnValue(undefined);
  const missing = await GET(new NextRequest("http://localhost:3000/api/integrations/linear/callback?code=x&state=y"));
  expect(missing.status).toBe(400);
  expect(await missing.json()).toEqual({ error: "invalid_oauth_state" });

  mocks.cookie.mockReturnValue({ value: JSON.stringify({ state: STATE, teamId: TEAM_ID }) });
  const mismatched = await GET(
    new NextRequest(`http://localhost:3000/api/integrations/linear/callback?code=x&state=${"b".repeat(32)}`),
  );
  expect(mismatched.status).toBe(400);
  expect(await mismatched.json()).toEqual({ error: "invalid_oauth_state" });
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});

it("stores the Linear connection and redirects using the configured app URL", async () => {
  const tokens = {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: "2026-10-18T12:00:00.000Z",
    scope: "read,write",
  };
  const organization = { id: "org-id", name: "localloop", urlKey: "localloop" };
  mocks.cookie.mockReturnValue({ value: JSON.stringify({ state: STATE, teamId: TEAM_ID }) });
  mocks.membership.mockResolvedValue({
    user: { id: "owner-id" },
    membership: { role: "owner", teamId: TEAM_ID },
  });
  mocks.exchange.mockResolvedValue(tokens);
  mocks.organization.mockResolvedValue(organization);
  mocks.admin.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    }),
  });

  const response = await GET(
    new NextRequest(`http://localhost:3000/api/integrations/linear/callback?code=linear-code&state=${STATE}`),
  );
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    `https://shiproom.example.com/teams/${TEAM_ID}/settings/connections?linear=connected`,
  );
  expect(mocks.exchange).toHaveBeenCalledWith({
    code: "linear-code",
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://shiproom.example.com/api/integrations/linear/callback",
  });
  expect(mocks.save).toHaveBeenCalledWith(expect.anything(), {
    teamId: TEAM_ID,
    userId: "owner-id",
    organization,
    tokens,
  });
});
