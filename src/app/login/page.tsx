import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SetupRequired } from "@/components/setup-required";
import { getPublicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/redirect";
import { getCurrentUser } from "@/lib/server/auth";
import { EmailSignInForm } from "./email-sign-in-form";
import { GitHubSignInButton } from "./github-sign-in-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const env = getPublicEnv();
  if (!env) return <SetupRequired />;
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  if (await getCurrentUser()) redirect(next);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="space-y-3 text-center">
        <span aria-hidden className="mx-auto flex size-9 items-center justify-center rounded-lg bg-accent text-base font-semibold text-accent-foreground">
          S
        </span>
        <h1 className="text-xl font-semibold tracking-tight">Sign in to Shiproom</h1>
        <p className="text-muted">Meetings that turn agreed work into Linear issues. Joining an existing team requires an owner’s invitation.</p>
      </div>
      {params.error === "signin_failed" && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">
          Sign-in didn&apos;t complete. Try again.
        </p>
      )}
      <GitHubSignInButton supabaseUrl={env.supabaseUrl} supabasePublishableKey={env.supabasePublishableKey} next={next} />
      <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <EmailSignInForm supabaseUrl={env.supabaseUrl} supabasePublishableKey={env.supabasePublishableKey} next={next} />
    </main>
  );
}
