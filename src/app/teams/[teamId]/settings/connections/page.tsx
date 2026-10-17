import { buttonClass, cardClass } from "@/components/styles";
import { disconnectLinear, startLinearConnection } from "@/lib/actions/team";
import { requireMembership } from "@/lib/server/auth";
import { integrationReadiness } from "@/lib/server/config";
import { listTeamRepositories } from "@/lib/server/connections";
import { createClient } from "@/lib/supabase/server";
import { AddRepositoryForm } from "./add-repository-form";

const LINEAR_RESULT: Record<string, { tone: "success" | "danger"; text: string }> = {
  connected: { tone: "success", text: "Linear connected." },
  denied: { tone: "danger", text: "Linear authorization was cancelled." },
  failed: { tone: "danger", text: "Linear couldn't be connected. Try again." },
  owner_required: { tone: "danger", text: "Only team owners can connect Linear." },
  not_configured: { tone: "danger", text: "Linear isn't set up on this server yet." },
  different_workspace: { tone: "danger", text: "This team is already connected to a different Linear workspace. Disconnect it first." },
};

export default async function ConnectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { teamId } = await params;
  const { linear: linearResult } = await searchParams;
  const { membership } = await requireMembership(teamId);
  const isOwner = membership.role === "owner";
  const readiness = integrationReadiness();

  const supabase = await createClient();
  const [{ data: linear }, repositories] = await Promise.all([
    supabase
      .from("connections")
      .select("external_account_name, external_account_url, status")
      .eq("team_id", teamId)
      .eq("provider", "linear")
      .maybeSingle<{ external_account_name: string | null; external_account_url: string | null; status: "active" | "reconnect_required" }>(),
    listTeamRepositories(teamId),
  ]);
  const result = typeof linearResult === "string" ? LINEAR_RESULT[linearResult] : undefined;

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-lg font-semibold">Connections</h1>
      {result && (
        <p role={result.tone === "danger" ? "alert" : "status"} className={result.tone === "danger" ? "text-danger" : "text-success"}>
          {result.text}
        </p>
      )}

      <section className={`${cardClass} space-y-3 p-4`} aria-labelledby="linear-heading">
        <div className="flex items-center justify-between">
          <h2 id="linear-heading" className="font-medium">
            Linear
          </h2>
          <span className="text-xs text-muted">
            {!linear ? "Not connected" : linear.status === "active" ? "Connected" : "Reconnect required"}
          </span>
        </div>
        <p className="text-muted">
          {linear ? (
            <>
              Workspace:{" "}
              {linear.external_account_url ? (
                <a href={linear.external_account_url} target="_blank" rel="noreferrer" className="text-accent">
                  {linear.external_account_name}
                </a>
              ) : (
                linear.external_account_name
              )}
              . Shiproom can read teams and projects and create issues.
            </>
          ) : (
            "Connect the team's Linear workspace so meetings can create issues there."
          )}
        </p>
        {readiness.linearOAuth === "not_configured" ? (
          readiness.linearPersonal === "configured" ? (
            <p className="text-muted">
              OAuth isn&apos;t configured. This hackathon path creates issues with the server&apos;s Linear personal key, and only when a team or project name contains Shiproom.
            </p>
          ) : (
            <p className="text-warning">Linear isn&apos;t set up on this server yet.</p>
          )
        ) : isOwner ? (
          <div className="flex gap-2">
            <form action={startLinearConnection}>
              <input type="hidden" name="teamId" value={teamId} />
              <button type="submit" className={buttonClass.primary}>
                {linear ? "Reconnect Linear" : "Connect Linear"}
              </button>
            </form>
            {linear && (
              <form action={disconnectLinear}>
                <input type="hidden" name="teamId" value={teamId} />
                <button type="submit" className={buttonClass.secondary}>
                  Disconnect
                </button>
              </form>
            )}
          </div>
        ) : (
          <p className="text-muted">Only team owners can change the Linear connection.</p>
        )}
      </section>

      <section className={`${cardClass} space-y-3 p-4`} aria-labelledby="github-heading">
        <h2 id="github-heading" className="font-medium">
          GitHub repositories
        </h2>
        <p className="text-muted">
          Shiproom only reads GitHub. Public repositories can be added now; private repositories need the Shiproom GitHub App, which isn&apos;t
          set up yet.
        </p>
        {repositories.length > 0 ? (
          <ul className="divide-y divide-border">
            {repositories.map((r) => (
              <li key={r.id} className="py-2">
                <a href={r.htmlUrl} target="_blank" rel="noreferrer" className="text-accent">
                  {r.fullName}
                </a>
                <span className="ml-2 text-xs text-muted">{r.access === "public" ? "Public" : "GitHub App"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No repositories approved yet.</p>
        )}
        {isOwner &&
          (readiness.serverDatabase === "configured" ? (
            <AddRepositoryForm teamId={teamId} />
          ) : (
            <p className="text-warning">Adding repositories needs server database access, which isn&apos;t configured yet.</p>
          ))}
      </section>

      {isOwner && (
        <section aria-labelledby="setup-heading" className="space-y-2">
          <h2 id="setup-heading" className="font-medium text-muted">
            Server setup
          </h2>
          <ul className={`${cardClass} divide-y divide-border`}>
            {(
              [
                ["Server database access", readiness.serverDatabase],
                ["Linear OAuth", readiness.linearOAuth],
                ["Private GitHub App", readiness.githubApp],
                ["Live calls (Daily)", readiness.daily],
                ["Upload transcription (Deepgram)", readiness.deepgram],
                ["Linear personal key", readiness.linearPersonal],
                ["Task extraction (Claude)", readiness.anthropic],
                ["Task extraction (OpenAI)", readiness.openai],
                ["Background processing (Inngest)", readiness.inngest],
              ] as const
            ).map(([label, status]) => (
              <li key={label} className="flex justify-between px-4 py-2">
                <span>{label}</span>
                <span className={status === "configured" ? "text-success" : "text-muted"}>{status === "configured" ? "Configured" : "Not configured"}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">“Configured” means credentials are present, not that the integration has been verified end to end.</p>
        </section>
      )}
    </div>
  );
}
