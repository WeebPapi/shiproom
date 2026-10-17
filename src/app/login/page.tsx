import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SetupRequired } from "@/components/setup-required";
import { getPublicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/redirect";
import { getCurrentUser } from "@/lib/server/auth";
import { GitHubSignInButton } from "./github-sign-in-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const env = getPublicEnv();
  if (!env) return <SetupRequired />;
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  if (await getCurrentUser()) redirect(next);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Sign in to Shiproom</h1>
        <p className="text-muted">
          Meetings that turn agreed work into Linear issues. Signing in does not add you to a team; an owner has to invite you.
        </p>
      </div>
      {params.error === "signin_failed" && (
        <p role="alert" className="text-danger">
          Sign-in didn&apos;t complete. Try again.
        </p>
      )}
      <GitHubSignInButton supabaseUrl={env.supabaseUrl} supabasePublishableKey={env.supabasePublishableKey} appUrl={env.appUrl} next={next} />
    </main>
  );
}
