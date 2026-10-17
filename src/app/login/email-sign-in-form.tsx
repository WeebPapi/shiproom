"use client";

import { useState } from "react";
import { buttonClass, inputClass, labelClass } from "@/components/styles";
import { createClient } from "@/lib/supabase/browser";
import { authCallbackUrl } from "@/lib/redirect";

export function EmailSignInForm(props: { supabaseUrl: string; supabasePublishableKey: string; next: string }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient(props.supabaseUrl, props.supabasePublishableKey);
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authCallbackUrl(window.location.origin, props.next), shouldCreateUser: true },
    });
    setPending(false);
    if (signInError) setError("The sign-in email could not be sent. Check the address and try again.");
    else setSent(true);
  }

  if (sent)
    return (
      <p role="status" className="rounded-md border border-border bg-surface px-3 py-2.5 text-center">
        Check your email for a sign-in link. It brings you back to Shiproom.
      </p>
    );

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="email" className={labelClass}>
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
          placeholder="you@company.com"
          className={`${inputClass} h-9`}
        />
      </div>
      <button type="submit" className={`${buttonClass.primary} h-9 w-full`} disabled={pending}>
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
