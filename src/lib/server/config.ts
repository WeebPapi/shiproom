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
};

export type IntegrationStatus = "configured" | "not_configured";

/** Non-secret readiness flags that are safe to render. */
export function integrationReadiness() {
  const has = (...names: string[]): IntegrationStatus => (names.every((n) => read(n)) ? "configured" : "not_configured");
  return {
    serverDatabase: has("SUPABASE_SERVICE_ROLE_KEY"),
    linearOAuth: has("LINEAR_CLIENT_ID", "LINEAR_CLIENT_SECRET", "CREDENTIAL_ENCRYPTION_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    githubApp: has("GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"),
    daily: has("DAILY_API_KEY", "DAILY_WEBHOOK_SECRET"),
    deepgram: has("DEEPGRAM_API_KEY"),
    openai: has("OPENAI_API_KEY"),
    inngest: has("INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"),
  };
}
