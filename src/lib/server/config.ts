import "server-only";

const read = (name: string) => process.env[name]?.trim() || null;

/** Server-only provider configuration. Each getter returns null when not configured. */
export const serverConfig = {
  supabaseServiceRoleKey: () => read("SUPABASE_SERVICE_ROLE_KEY"),
  credentialEncryptionKey: () => read("CREDENTIAL_ENCRYPTION_KEY"),
  linear: () => {
    const clientId = read("LINEAR_CLIENT_ID");
    const clientSecret = read("LINEAR_CLIENT_SECRET");
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  },
  dailyApiKey: () => read("DAILY_API_KEY"),
  linearApiKey: () => read("LINEAR_API_KEY"),
  linearDemoTeamId: () => read("LINEAR_DEMO_TEAM_ID"),
  cursorPrRepo: () => read("CURSOR_PR_REPO"),
  anthropicApiKey: () => read("ANTHROPIC_API_KEY"),
  anthropicWorkspaceId: () => read("ANTHROPIC_WORKSPACE_ID"),
  anthropicModel: () => read("ANTHROPIC_MODEL") || "claude-sonnet-4-5",
};

export type IntegrationStatus = "configured" | "not_configured";

/** Non-secret readiness flags that are safe to render. */
export function integrationReadiness() {
  const has = (...names: string[]): IntegrationStatus => (names.every((n) => read(n)) ? "configured" : "not_configured");
  return {
    serverDatabase: has("SUPABASE_SERVICE_ROLE_KEY"),
    linearOAuth: has("LINEAR_CLIENT_ID", "LINEAR_CLIENT_SECRET", "CREDENTIAL_ENCRYPTION_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    githubApp: has("GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"),
    daily: has("DAILY_API_KEY"),
    deepgram: has("DEEPGRAM_API_KEY"),
    openai: has("OPENAI_API_KEY"),
    linearPersonal: has("LINEAR_API_KEY"),
    anthropic: has("ANTHROPIC_API_KEY"),
    inngest: has("INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"),
  };
}
