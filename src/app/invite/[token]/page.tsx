import { SetupRequired } from "@/components/setup-required";
import { cardClass } from "@/components/styles";
import { getPublicEnv } from "@/lib/env";
import { requireUser } from "@/lib/server/auth";
import { AcceptInvitationForm } from "./accept-invitation-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  if (!getPublicEnv()) return <SetupRequired />;
  const { token } = await params;
  const user = await requireUser(`/invite/${encodeURIComponent(token)}`);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <section className={`${cardClass} space-y-3 p-6 shadow-xs`}>
        <h1 className="text-lg font-semibold tracking-tight">Join a Shiproom team</h1>
        <p className="text-muted">
          The invitation must match your verified GitHub email
          {user.email ? (
            <>
              , <strong className="text-foreground">{user.email}</strong>
            </>
          ) : null}
          .
        </p>
        <AcceptInvitationForm token={token} />
      </section>
    </main>
  );
}
