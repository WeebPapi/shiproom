import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

// Supabase PKCE exchange. GitHub's own OAuth callback is on hosted Supabase, not here.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code && !searchParams.has("error")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Relative locations preserve the browser origin when a proxy forwards to localhost.
    if (!error) return new NextResponse(null, { status: 307, headers: { Location: next } });
    console.error("Supabase code exchange failed", error.message);
  }
  const login = new URL("/login", origin);
  login.searchParams.set("error", "signin_failed");
  login.searchParams.set("next", next);
  return new NextResponse(null, { status: 307, headers: { Location: login.pathname + login.search } });
}
