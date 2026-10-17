import { Icon } from "@/components/icons";
import { PageBody, PageHeader, SectionTitle } from "@/components/page-parts";
import { badgeClass, buttonClass, cardClass } from "@/components/styles";
import { disconnectLinear, startLinearConnection } from "@/lib/actions/team";
import { requireMembership } from "@/lib/server/auth";
import { integrationReadiness } from "@/lib/server/config";
import { listTeamRepositories } from "@/lib/server/connections";
import { createClient } from "@/lib/supabase/server";
import { listPublicRepositories } from "@/lib/server/github";
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
  const { membership, user } = await requireMembership(teamId);
  const isOwner = membership.role === "owner";
  const readiness = integrationReadiness();

  const supabase = await createClient();
  const [{ data: linear }, repositories, githubRepos] = await Promise.all([
    supabase
      .from("connections")
      .select("external_account_name, external_account_url, status")
      .eq("team_id", teamId)
      .eq("provider", "linear")
      .maybeSingle<{ external_account_name: string | null; external_account_url: string | null; status: "active" | "reconnect_required" }>(),
    listTeamRepositories(teamId),
    isOwner && user.githubLogin ? listPublicRepositories(user.githubLogin) : null,
  ]);
  const result = typeof linearResult === "string" ? LINEAR_RESULT[linearResult] : undefined;

  return (
    <>
      <PageHeader title="Connections" />
      <PageBody>
        {result && (
          <p
            role={result.tone === "danger" ? "alert" : "status"}
            className={`rounded-md border px-3 py-2 ${result.tone === "danger" ? "border-danger/30 bg-danger/5 text-danger" : "border-success/30 bg-success/5 text-success"}`}
          >
            {result.text}
          </p>
        )}

        <section className={cardClass} aria-labelledby="linear-heading">
          <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
            <h2 id="linear-heading" className="font-medium">
              Linear
            </h2>
            <span className={badgeClass}>
              <span aria-hidden className={`size-1.5 rounded-full ${linear?.status === "active" ? "bg-success" : linear ? "bg-warning" : "bg-muted/50"}`} />
              {!linear ? "Not connected" : linear.status === "active" ? "Connected" : "Reconnect required"}
            </span>
          </div>
          <div className="space-y-3 p-4">
            <p className="text-muted">
              {linear ? (
                <>
                  Workspace:{" "}
                  {linear.external_account_url ? (
                    <a href={linear.external_account_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
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
                  OAuth isn&apos;t configured. This hackathon path creates issues with the server&apos;s Linear personal key, and only when a team or project
                  name contains Shiproom.
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
          </div>
        </section>

        <section className={cardClass} aria-labelledby="github-heading">
          <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
            <h2 id="github-heading" className="flex items-center gap-2 font-medium">
              <Icon name="github" />
              GitHub repositories
            </h2>
            <span className={badgeClass}>Read-only</span>
          </div>
          <div className="space-y-3 p-4">
            <p className="text-muted">
              {user.githubLogin ? `Signed in with GitHub as @${user.githubLogin}. ` : "Signed in with email. Team owners can add public repositories by owner/name. "}
              Public repositories can be added now; private repositories need the Shiproom GitHub App, which isn&apos;t set up yet.
            </p>
            {repositories.length > 0 ? (
              <ul className="divide-y divide-border rounded-md border border-border">
                {repositories.map((r) => (
                  <li key={r.id} className="flex h-10 items-center gap-3 px-3">
                    <a href={r.htmlUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-xs hover:underline">
                      {r.fullName}
                    </a>
                    <span className={badgeClass}>{r.access === "public" ? "Public" : "GitHub App"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-muted">No repositories approved yet.</p>
            )}
            {isOwner &&
              (readiness.serverDatabase === "configured" ? (
                <>
                  {githubRepos && githubRepos.status !== "ready" && (
                    <p role="status" className="text-warning">
                      {githubRepos.status === "rate_limited"
                        ? "GitHub is rate-limiting repository suggestions. Try again later or enter owner/name."
                        : "Repository suggestions couldn't load. Try again or enter owner/name."}
                    </p>
                  )}
                  {githubRepos?.status === "ready" && (
                    <p className="text-muted">
                      {githubRepos.repositories.length
                        ? "Choose from your recently updated public repositories or enter any public owner/name. Adding a repository makes it available to this team’s meetings."
                        : "No public repositories found on your GitHub account. Enter a public owner/name to add one."}
                    </p>
                  )}
                  <AddRepositoryForm teamId={teamId} suggestions={githubRepos?.status === "ready" ? githubRepos.repositories.map((repo) => repo.full_name) : []} />
                </>
              ) : (
                <p className="text-warning">Adding repositories needs server database access, which isn&apos;t configured yet.</p>
              ))}
          </div>
        </section>

        {isOwner && (
          <section aria-labelledby="setup-heading">
            <SectionTitle id="setup-heading">Server setup</SectionTitle>
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
                <li key={label} className="flex h-10 items-center justify-between px-4">
                  <span>{label}</span>
                  <span className={`inline-flex items-center gap-1.5 text-xs ${status === "configured" ? "text-foreground" : "text-muted"}`}>
                    <span aria-hidden className={`size-1.5 rounded-full ${status === "configured" ? "bg-success" : "bg-muted/40"}`} />
                    {status === "configured" ? "Configured" : "Not configured"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">“Configured” means credentials are present, not that the integration has been verified end to end.</p>
          </section>
        )}
      </PageBody>
    </>
  );
}
