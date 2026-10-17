import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SetupRequired } from "@/components/setup-required";
import { cardClass } from "@/components/styles";
import { signOut } from "@/lib/actions/session";
import { getPublicEnv } from "@/lib/env";
import { listMemberships, requireUser } from "@/lib/server/auth";
import { CreateTeamForm } from "./create-team-form";

export default async function HomePage() {
  await connection();
  if (!getPublicEnv()) return <SetupRequired />;
  const user = await requireUser("/");
  const memberships = await listMemberships();
  if (memberships.length > 0) redirect(`/teams/${memberships[0].teamId}`);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Welcome, {user.displayName}</h1>
        <p className="text-muted">You aren&apos;t in a Shiproom team yet.</p>
      </div>

      <section className={`${cardClass} space-y-3 p-4`} aria-labelledby="create-team">
        <h2 id="create-team" className="font-medium">
          Create a team
        </h2>
        <p className="text-muted">You become its owner and can invite teammates and connect Linear and GitHub.</p>
        <CreateTeamForm />
      </section>

      <section className={`${cardClass} space-y-2 p-4`} aria-labelledby="join-team">
        <h2 id="join-team" className="font-medium">
          Join an existing team
        </h2>
        <p className="text-muted">
          Ask a team owner for an invitation link sent to{" "}
          {user.email ? <strong className="text-foreground">{user.email}</strong> : "your verified email"}.
        </p>
        {!user.emailVerified && (
          <p className="text-warning">
            This account has no verified email, so invitations can&apos;t be matched to you. Open the sign-in link from your email, then try again.
          </p>
        )}
      </section>

      <form action={signOut}>
        <button type="submit" className="text-muted underline-offset-2 hover:underline">
          Sign out
        </button>
      </form>
    </main>
  );
}
