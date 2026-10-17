# Development and documentation workflow

## Current repository

This repository contains documentation and setup files, including `.env.example` and `.gitignore`. There is no `package.json`, application scaffold, database migration, test suite, CI pipeline, or deployed web app. `npm install`, `npm run dev`, and application checks are therefore not valid instructions yet. Follow [provider setup](setup.md) for the account checklist and prepared Vercel project.

Read [AGENTS.md](../AGENTS.md) before editing. The authoritative scope is [Product](product.md); implementation boundaries are in [Architecture](architecture.md). The local project path is not a portable setup requirement.

## First scaffold handoff

The identity lane creates one Next.js App Router TypeScript scaffold. The prepared Vercel project uses Node.js 24.x; align local development and pin the actual supported Node version in the scaffold. Setup found local Node.js 22.13.1; no global runtime was changed. Use npm initially and commit its lockfile; if the team chooses another package manager, update this document and the decision log at the same time.

Add Tailwind and an accessible component set only as needed. Use provider components for media before recreating them. Keep provider secrets and database administration in server-only modules. Do not add multiple auth systems or ORMs for hypothetical future needs; Supabase's client and SQL migrations suffice for this initial design.

The scaffold change must replace this section with **tested, exact instructions** for installing dependencies, starting the app and local Inngest server, applying schema/RLS migrations, callback/webhook URLs, and running build/typecheck/lint/focused tests. Maintain the existing placeholder-only `.env.example` and `.gitignore`; preserve any ignored `.env.local`. Implement the callback paths in [Architecture](architecture.md). Document working script names from `package.json`; do not merely retain aspirational commands.

## Configuration inventory to implement

Names below are proposed, not consumed by current code. The scaffold owner must reconcile them with the SDK versions actually installed and update this inventory. Public-prefixed values are deliberately public; every other value must remain server-side.

- `NEXT_PUBLIC_APP_URL`: canonical app origin and callback/link base; use an explicit local origin for development.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: browser Supabase project connection. RLS protects access; the public key is not a team authorization mechanism.
- `SUPABASE_SERVICE_ROLE_KEY`: privileged server access only. Configure the GitHub login OAuth app/client credentials through the Supabase dashboard, with its required auth callback.
- `CREDENTIAL_ENCRYPTION_KEY`: base64-encoded 32 random bytes for authenticated encryption of stored provider tokens; document the encryption envelope and rotation when implemented.
- `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`: OAuth app credentials; registered callback must match the implemented server route exactly. Per-team access/refresh tokens belong in encrypted connection storage, not public env variables.
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`: selected-repository installation access for private context. Store installation/team mappings in the database. Public-only context fallback must be visible in status; do not request broad write scopes to save setup time.
- `DAILY_API_KEY`, `DAILY_WEBHOOK_SECRET`: server room/transcript operations and base64 webhook HMAC secret. The browser receives only short-lived room tokens.
- `DEEPGRAM_API_KEY`: server upload transcription; document callback authentication/correlation secrets if that mode is used.
- Vocabulary is checked-in UTF-8 data in [transcription-vocabulary.json](transcription-vocabulary.json), with [usage guidance](transcription-vocabulary.md). The future integration should load a relevant subset and add authorized meeting context; do not introduce a second hand-maintained hint list.
- `OPENAI_API_KEY`, `OPENAI_MODEL`: server extraction through the Responses API; initial model is `gpt-5-mini`, pending account-access and structured-output smoke tests. See [Integrations](integrations.md).
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`: durable workflow transport and verification; local SDK/dev-server configuration must match the selected version. Record deployment synchronization instructions.

Verify the intended hosting plan's request durations, upload limits, scheduled jobs, and billing allowances. Register HTTPS OAuth/webhook endpoints for deployment and a supported local tunnel if needed. Never paste tokens into docs, tickets, example URLs, fixtures, terminal recordings, or screenshots. Product setup UI should ask for authorization through OAuth rather than displaying environment variable names to end users.

The Vercel project is created and linked locally. Supabase, GitHub login, and the audio bucket are configured as recorded in [Setup](setup.md); Linear, Daily, Deepgram, Inngest, OpenAI, and `service_role` credentials are still missing. No application integration has been exercised. Do not invent `npm` scripts until the scaffold exists.

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
