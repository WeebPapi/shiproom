import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

const publicSchema = z.object({
  appUrl: z.url(),
  supabaseUrl: z.url(),
  supabasePublishableKey: nonEmpty,
});

export type PublicEnv = z.infer<typeof publicSchema>;

// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them in browser bundles.
export function getPublicEnv(): PublicEnv | null {
  const parsed = publicSchema.safeParse({
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return parsed.success ? parsed.data : null;
}

export function missingPublicEnv(): string[] {
  return (
    [
      ["NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL],
      ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
      ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY],
    ] as const
  )
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
}
