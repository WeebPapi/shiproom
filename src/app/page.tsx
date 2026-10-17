import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { PageBody, PageHeader, SectionTitle } from "@/components/page-parts";
import { SetupRequired } from "@/components/setup-required";
import { cardClass } from "@/components/styles";
import { getPublicEnv } from "@/lib/env";
import { listMemberships, requireUser } from "@/lib/server/auth";
import { CreateTeamForm } from "./create-team-form";

const NEXT_STEPS = [
  ["Connect Linear", "Pick the workspace where agreed tasks become issues."],
  ["Add repositories", "Give meetings read-only GitHub context."],
  ["Start a huddle", "Talk it through; Shiproom files the agreed work."],
] as const;

export default async function HomePage() {
  await connection();
  if (!getPublicEnv()) return <SetupRequired />;
  const user = await requireUser("/");
  const memberships = await listMemberships();
  if (memberships.length > 0) redirect(`/teams/${memberships[0].teamId}`);

  return (
    <AppShell user={user} memberships={memberships}>
      <PageHeader title="Home" />
      <PageBody className="max-w-2xl">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Welcome, {user.displayName}</h2>
          <p className="text-muted">Create a team to start turning planning calls into Linear issues, or join one with an invitation.</p>
        </div>

        <section className={`${cardClass} p-5`} aria-labelledby="create-team">
          <h3 id="create-team" className="font-medium">
            Create a team
          </h3>
          <p className="mt-1 mb-4 text-muted">You become its owner and can invite teammates and connect Linear and GitHub.</p>
          <CreateTeamForm />
        </section>

        <section aria-labelledby="next-steps">
          <SectionTitle id="next-steps">Then</SectionTitle>
          <ol className={`${cardClass} divide-y divide-border`}>
            {NEXT_STEPS.map(([title, body], index) => (
              <li key={title} className="flex items-start gap-3 px-4 py-3 text-muted">
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-xs tabular-nums">{index + 2}</span>
                <span>
                  <span className="block text-foreground">{title}</span>
                  {body}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="join-team">
          <SectionTitle id="join-team">Joining an existing team?</SectionTitle>
          <p className="text-muted">
            Ask a team owner for an invitation link sent to{" "}
            {user.email ? <strong className="font-medium text-foreground">{user.email}</strong> : "your verified email"}.
          </p>
          {!user.emailVerified && (
            <p className="mt-2 text-warning">
              This account has no verified email, so invitations can&apos;t be matched to you. Open the sign-in link from your email, then try again.
            </p>
          )}
        </section>
      </PageBody>
    </AppShell>
  );
}
