import { createBrowserClient } from "@supabase/ssr";

export function createClient(supabaseUrl: string, supabasePublishableKey: string) {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
