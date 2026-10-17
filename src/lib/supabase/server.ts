import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";
import { serverConfig } from "@/lib/server/config";

export class ConfigurationError extends Error {}

/** Per-request client acting as the signed-in user; RLS applies. */
export async function createClient() {
  const env = getPublicEnv();
  if (!env) throw new ConfigurationError("Supabase public configuration is missing.");
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; src/proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Bypasses RLS. Callers must perform an explicit membership/role check first.
 * Returns null when the service-role key is not configured.
 */
export function createAdminClient() {
  const env = getPublicEnv();
  const key = serverConfig.supabaseServiceRoleKey();
  if (!env || !key) return null;
  return createSupabaseClient(env.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
