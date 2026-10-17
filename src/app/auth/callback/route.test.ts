import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const exchange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/redirect", () => import("../../../lib/redirect"));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { exchangeCodeForSession: exchange } }) }));

beforeEach(() => exchange.mockReset());

it("returns to the requested path after a successful code exchange", async () => {
  exchange.mockResolvedValue({ error: null });
  const response = await GET(new NextRequest("http://localhost:3000/auth/callback?code=example&next=%2Finvite%2Fabc"));
  expect(new URL(response.headers.get("location")!, "http://localhost:3000").href).toBe("http://localhost:3000/invite/abc");
});

it("retains the invitation destination when authorization is cancelled", async () => {
  const response = await GET(new NextRequest("http://localhost:3000/auth/callback?error=access_denied&next=%2Finvite%2Fabc"));
  const destination = new URL(response.headers.get("location")!, "http://localhost:3000");
  expect(destination.pathname).toBe("/login");
  expect(destination.searchParams.get("error")).toBe("signin_failed");
  expect(destination.searchParams.get("next")).toBe("/invite/abc");
});

it.each(["code=example", "error=access_denied"])("keeps %s redirects on the browser origin behind a reverse proxy", async (query) => {
  exchange.mockResolvedValue({ error: null });
  const response = await GET(new NextRequest(`https://localhost:3000/auth/callback?${query}&next=%2Finvite%2Fabc`));
  const destination = new URL(response.headers.get("location")!, "https://shiproom.example.com/auth/callback");
  expect(destination.origin).toBe("https://shiproom.example.com");
});
