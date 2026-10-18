# Development and documentation workflow

## Current repository

The identity-lane skeleton exists: a Next.js 16.4 App Router app (TypeScript, Tailwind 4, npm, Node 24), Supabase SSR auth, one checked-in schema migration with RLS, and focused tests. Media, transcription, extraction, Inngest, and issue publication are not built. No CI pipeline or deployment exists. Read [AGENTS.md](../AGENTS.md) before editing; scope is [Product](product.md), boundaries are [Architecture](architecture.md).

This Next.js version differs from older training data. Read the relevant guide in `node_modules/next/dist/docs/` before using a Next.js API (for example, `middleware` is now `src/proxy.ts`). `next dev` appends a Next.js agent-rules block to `AGENTS.md`; keep it committed.

## Local setup and commands

Tested on 2026-10-17 with Node 24.21.0 and npm 11.19.0.

```bash
nvm use            # .nvmrc pins Node 24; package.json engines is 24.x
npm install
cp .env.example .env.local   # only if you don't have one; fill values privately
npm run dev        # http://localhost:3000
```

| Script | What it does | Last result |
| --- | --- | --- |
| `npm run dev` | Next.js dev server | Smoke-tested: signed-out redirects, `/login`, callbacks |
| `npm run build` | Production build (works without `.env.local`; pages render a setup notice) | Passed |
| `npm run typecheck` | `tsc --noEmit` | Passed |
| `npm run lint` | ESLint (Next.js config) | Passed |
| `npm test` | Vitest: contracts, OAuth callback handling, public GitHub API failures, crypto, timezone conversion, and RLS against the migrations in PGlite | 37 passed |

Without `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` the app shows "Shiproom isn't configured yet" instead of crashing. Missing server keys produce explicit "not configured" states (Connections page → Server setup), never fake success. There is no local Inngest server yet; the workflow lane adds it with `/api/inngest`.

The GitHub OAuth change also passed build, typecheck, lint, and all 37 tests on Node 22.13.1 (the current shell); Node 24 remains the project target. Stale generated route types were refreshed with `npx next typegen` before typecheck.

## Database migrations

The scripted `/demo` flow requires `20261018090000_scripted_demo.sql` after the earlier migrations. Its setup and filming script are in [Demo](demo.md). Apply it before running this code against an existing database: meeting reads include the new `is_demo` column. The connected Supabase MCP project was checked on 2026-10-18 and differs from this checkout's configured project; no remote migration was applied through it.

Schema, constraints, RLS, RPCs, and `shiproom-audio` storage policies live in `supabase/migrations/`. **They are not applied to any hosted project yet.** Apply them to the team's canonical Supabase project with either:

- Dashboard: **SQL Editor → New query**, paste `supabase/migrations/20261017130000_initial_schema.sql`, run once.
- CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push` (needs the database password; not tested here).

Run it once per project; it is not idempotent. Afterward, confirm with a signed-in request or the Table Editor that `public.teams` exists. `npm test` loads every migration into PGlite with stub Supabase roles (`anon`, `authenticated`, `service_role`) and `auth`/`storage` schemas. Add new migrations as new timestamped files; never edit an applied one. Generated Supabase TypeScript types are not set up; query results are typed at the call site.

## Auth and callback URLs

- Browser GitHub and email sign-in return to `/auth/callback` on the origin where sign-in began. Allow each development origin (including localhost and the exact Tailscale HTTPS hostname) in Supabase; `NEXT_PUBLIC_APP_URL` remains the canonical base for shared links, not the sign-in callback. Keep the same origin through the PKCE exchange. For Tailscale development, allow `https://desktop-jjp034u.tail51e7da.ts.net/**` to cover `/auth/callback?next=...`; an HTTP entry with `:3000` does not match this HTTPS origin. Supabase matches allowlist patterns against the URL including its query string ([provider source](https://github.com/supabase/auth/blob/master/internal/utilities/request.go)).
- Supabase Auth → URL Configuration must allow `<origin>/auth/callback`. GitHub's OAuth app callback stays `https://<project-ref>.supabase.co/auth/v1/callback`, and the GitHub provider must be enabled on the **same** project as `NEXT_PUBLIC_SUPABASE_URL`.
- Linear OAuth app redirect: `<origin>/api/integrations/linear/callback`, scopes `read,issues:create`. Connect requires `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- `/api/webhooks/daily`, `/api/webhooks/deepgram`, and `/api/inngest` are not implemented (they 404). The media and workflow lanes own them; `src/proxy.ts` already excludes them from session handling.

## Configuration inventory to implement

The app reads `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`src/lib/env.ts`), and `SUPABASE_SERVICE_ROLE_KEY`, `CREDENTIAL_ENCRYPTION_KEY`, `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, `DAILY_API_KEY`, `LINEAR_API_KEY`, `ANTHROPIC_API_KEY`, optional `ANTHROPIC_WORKSPACE_ID`, and optional `ANTHROPIC_MODEL` (`src/lib/server/config.ts`). Other names are only checked for presence on the Connections page until their lane consumes them. Public-prefixed values are deliberately public; every other value must remain server-side.

- `NEXT_PUBLIC_APP_URL`: canonical app origin and callback/link base; use an explicit local origin for development.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: browser Supabase project connection. RLS protects access; the public key is not a team authorization mechanism.
- `SUPABASE_SERVICE_ROLE_KEY`: privileged server access only. Configure the GitHub login OAuth app/client credentials through the Supabase dashboard, with its required auth callback.
- `CREDENTIAL_ENCRYPTION_KEY`: base64-encoded 32 random bytes. Provider tokens are stored as `v1.<iv>.<tag>.<ciphertext>` (AES-256-GCM, associated data `<teamId>:<provider>`) in `private.connection_secrets`, reachable only through `service_role` RPCs. No key rotation yet; changing the key invalidates stored tokens (reconnect Linear).
- `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`: OAuth app credentials; registered callback must match the implemented server route exactly. Per-team access/refresh tokens belong in encrypted connection storage, not public env variables.
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`: selected-repository installation access for private context. Store installation/team mappings in the database. Public-only context fallback must be visible in status; do not request broad write scopes to save setup time.
- `DAILY_API_KEY`, `DAILY_WEBHOOK_SECRET`: server room/transcript operations and base64 webhook HMAC secret. The browser receives only short-lived room tokens.
- `DEEPGRAM_API_KEY`: server upload transcription; document callback authentication/correlation secrets if that mode is used.
- Vocabulary is checked-in UTF-8 data in [transcription-vocabulary.json](transcription-vocabulary.json), with [usage guidance](transcription-vocabulary.md). The future integration should load a relevant subset and add authorized meeting context; do not introduce a second hand-maintained hint list.
- `OPENAI_API_KEY`, `OPENAI_MODEL`: server extraction through the Responses API; initial model is `gpt-5-mini`, pending account-access and structured-output smoke tests. See [Integrations](integrations.md).
- `ANTHROPIC_API_KEY`: server-only; this developer's extraction path uses Anthropic Claude (see [Decisions](decisions.md)).
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`: durable workflow transport and verification; local SDK/dev-server configuration must match the selected version. Record deployment synchronization instructions.

Verify the intended hosting plan's request durations, upload limits, scheduled jobs, and billing allowances. Register HTTPS OAuth/webhook endpoints for deployment and a supported local tunnel if needed. Never paste tokens into docs, tickets, example URLs, fixtures, terminal recordings, or screenshots. Product setup UI should ask for authorization through OAuth rather than displaying environment variable names to end users.

Provider status is in [Setup](setup.md#agent-visible-status). Daily room creation was smoke-tested without printing the key (private room, meeting token, delete). A live transcript, Claude extraction, and Linear issue creation have not been verified end to end.

## Contribution workflow

1. Check the current working tree and read the code/documents touched by the task. Identify the owning lane and shared contracts before editing.
2. Implement a small complete slice, including authorization and failure handling. Preserve other developers' uncommitted work.
3. Update affected docs in the same change. Keep behavior and setup facts next to their source of truth; use links elsewhere. Update implemented/verified status only with evidence.
4. Run relevant checks. New non-trivial logic needs a meaningful focused test/self-check; low-impact documentation edits need link/consistency review, not a new test harness.
5. Commit the related code and docs together. In the handoff state behavior, checks, limitations, and whether docs changed or why they did not need to.

Documentation guidance lives in both [AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md). There is no automatic doc-update service, mandatory docs CI gate, or scheduled agent job. Developers and their agents are responsible for relevant updates.

## Evidence and demo data

Use invented participant names and synthetic audio/transcripts in committed fixtures. Reference acceptance IDs AC1-AC9 from [Product](product.md) in verification notes, including native-speaker review for the Georgian target. Keep real-workspace smoke-test evidence brief: date, commit, provider behavior checked, result, and any limit; do not copy sensitive payloads into the repo.

The public demo must disclose preconfigured connections, public-only GitHub context, upload-only capture, or any other scope reduction that remains. The spec describes the intended product; status documents what the current build can actually do.
