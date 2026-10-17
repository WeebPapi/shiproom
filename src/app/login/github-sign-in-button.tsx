"use client";

import { useState } from "react";
import { buttonClass } from "@/components/styles";
import { createClient } from "@/lib/supabase/browser";

export function GitHubSignInButton(props: { supabaseUrl: string; supabasePublishableKey: string; appUrl: string; next: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const supabase = createClient(props.supabaseUrl, props.supabasePublishableKey);
    const redirectTo = new URL("/auth/callback", props.appUrl);
    redirectTo.searchParams.set("next", props.next);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo: redirectTo.toString() } });
    if (error) {
      setError("GitHub sign-in couldn't start. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={signIn} disabled={pending} className={`${buttonClass.primary} w-full py-2`}>
        {pending ? "Redirecting to GitHub…" : "Continue with GitHub"}
      </button>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
