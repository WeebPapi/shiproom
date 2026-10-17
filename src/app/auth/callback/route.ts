import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

// Supabase PKCE exchange. GitHub's own OAuth callback is on hosted Supabase, not here.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.error("Supabase code exchange failed", error.message);
  }
  const login = new URL("/login", origin);
  login.searchParams.set("error", "signin_failed");
  return NextResponse.redirect(login);
}
