"use client";

import { useState } from "react";
import { buttonClass, inputClass } from "@/components/styles";
import { createClient } from "@/lib/supabase/browser";

export function EmailSignInForm(props: { supabaseUrl: string; supabasePublishableKey: string; appUrl: string; next: string }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient(props.supabaseUrl, props.supabasePublishableKey);
    const redirectTo = new URL("/auth/callback", props.appUrl);
    redirectTo.searchParams.set("next", props.next);
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo.toString(), shouldCreateUser: true },
    });
    setPending(false);
    if (signInError) setError("The sign-in email could not be sent. Check the address and try again.");
    else setSent(true);
  }

  if (sent) return <p role="status">Check your email for a sign-in link. It brings you back to Shiproom.</p>;

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="email" className="mb-1 block font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClass}
        />
      </div>
      <button type="submit" className={`${buttonClass.primary} w-full py-2`} disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
