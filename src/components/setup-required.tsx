import { missingPublicEnv } from "@/lib/env";

export function SetupRequired() {
  const missing = missingPublicEnv();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 p-6">
      <h1 className="text-lg font-semibold">Shiproom isn&apos;t configured yet</h1>
      <p className="text-muted">The server is missing its Supabase connection settings, so sign-in is unavailable.</p>
      {process.env.NODE_ENV !== "production" && missing.length > 0 && (
        <p className="text-muted">
          Add these to <code>.env.local</code> and restart: {missing.map((name) => <code key={name} className="mr-1">{name}</code>)}
        </p>
      )}
    </main>
  );
}
