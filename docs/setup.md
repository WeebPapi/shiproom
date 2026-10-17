# Provider setup and skeleton handoff

Checked 2026-10-17. This is the user's requested manual setup checklist. Check off steps only after doing them; unchecked items are not configured. Keep credentials in the ignored `.env.local` or a password manager, never in chat, Git, or this document. [Architecture](architecture.md) owns callback paths; [Integrations](integrations.md) owns permissions and provider behavior.

## Already prepared

- Public repository: [WeebPapi/shiproom](https://github.com/WeebPapi/shiproom), branch `master`.
- Vercel: [weebpapis-projects / shiproom](https://vercel.com/weebpapis-projects/shiproom), project ID `prj_qQNcfxoVxlZPMtqLYmYoSih9ibRf`. Created, linked to this local checkout, framework **Next.js**, Node **24.x**, root directory `.`. No deployment or Git auto-deployment connection has been made.
- Committed `.env.example` defines the configuration names. `.gitignore` excludes `.env.local`, `.vercel/`, and private-key `.pem` files. Local preparation creates an ignored `.env.local` with independent random encryption and Daily webhook secrets; provider credentials remain blank. Other clones must copy the example and generate their own development secrets.
- The connected Linear agent tool currently sees **ARCI projects (ARC)**. It has not been modified. Shiproom needs a separate new workspace; that workspace has not been created.
- Supabase target project reference: `fnrdatkgwdtsqmvstrlp`, dashboard project **shiproom-dev**. Local Codex has an enabled HTTP MCP server named `supabase`, scoped to that project. Browser OAuth completed: the CLI reported successful login and `codex mcp list --json` reports `auth_status: o_auth`. The already-running agent session has not loaded the new server (`unknown MCP server 'supabase'`); restart/reload the Codex session and verify a read-only project query before claiming working database access. This agent connection does not populate the app's `.env.local` credentials.

No live integration, billing setup, database, OAuth app, or production hostname is verified. Do not assume `shiproom.vercel.app` belongs to this project.

## Do now: accounts and credentials

### 1. Supabase project

- [ ] Sign into [Supabase](https://supabase.com/dashboard). Create a project named **shiproom-dev** in your organization. Choose the free plan and a nearby European region such as Frankfurt if available. Store the database password in your password manager; the app does not need it in `.env.local`.
- [ ] Wait for provisioning. From the project Connect dialog/settings, copy the project URL to `NEXT_PUBLIC_SUPABASE_URL`. In **Settings → API Keys**, copy the publishable key to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the legacy `service_role` key to `SUPABASE_SERVICE_ROLE_KEY`. The latter is server-only and bypasses RLS. Do not substitute the anonymous key for it.
- [ ] In **Authentication → URL Configuration**, initially set Site URL to `http://localhost:3000`; add `http://localhost:3000/auth/callback` to allowed redirect URLs.
- [ ] In **Storage**, use the bucket named `shiproom-audio` (the name shown in the user's setup screenshot). Keep **Public bucket off**. Turn **Restrict file size on** and set **25 MB**. Turn **Restrict MIME types on**, paste the following comma-separated list, then **Save**:

  ```text
  audio/mpeg, audio/mp4, audio/x-m4a, audio/wav, audio/x-wav, audio/webm, audio/ogg, audio/flac, audio/x-flac, audio/aac
  ```

  This initial allowlist covers common MP3/M4A/WAV/WebM/Ogg/FLAC/AAC audio and common MIME aliases; it is not proof that an uploaded file is valid audio. The upload implementation must validate real format/duration and handle MIME detection consistently. Keep storage private and add ownership-based upload/read policies; do not grant blanket authenticated access. [Supabase upload restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets), [Deepgram formats](https://developers.deepgram.com/docs/supported-audio-formats).
- [ ] Do not manually invent database tables. The agent will create checked-in migrations and RLS policies from [Architecture](architecture.md).

### 2. GitHub login through Supabase

- [ ] Open [GitHub OAuth Apps](https://github.com/settings/developers), then **New OAuth App**. Name it **Shiproom Login**; Homepage URL can be `http://localhost:3000` for this development app.
- [ ] Set **Authorization callback URL** to the callback shown by Supabase's GitHub provider, normally `https://<project-ref>.supabase.co/auth/v1/callback`. This is different from the Next.js `/auth/callback` path.
- [ ] Generate the OAuth client secret. In Supabase **Authentication → Sign In / Providers → GitHub**, enable GitHub and enter this client ID and secret; save. These credentials belong in Supabase, not the Next.js environment file.
- [ ] Keep GitHub email privacy in mind: the app must handle a missing email. Test sign-in once the skeleton implements the PKCE callback. [Official setup](https://supabase.com/docs/guides/auth/social-login/auth-github).

### 3. Dedicated Linear workspace

- [ ] In [Linear](https://linear.app), open the workspace switcher → **Switch workspace → Create or join workspace**. Create **Shiproom**. Do not select or modify ARCI projects. Linear creates a default team with a new workspace. [Workspace guide](https://linear.app/docs/workspaces).
- [ ] Use that single **Shiproom** team. In its team settings, set its issue identifier to **SHIP**, if available. Create two projects in that team: **Shiproom MVP** for the actual build and **Shiproom Demo** for generated demo issues.
- [ ] If wanted, invite your other three developers yourself. Do not make team access public to avoid handling invitations.
- [ ] In workspace settings, locate **API → OAuth applications**, and create **Shiproom**. Use the repository URL as the app/homepage URL while there is no deployment. Register redirect URI `http://localhost:3000/api/integrations/linear/callback`. Save its client ID/secret as `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET` in `.env.local`.
- [ ] The app's authorization request must ask for `read,issues:create`. Creating the OAuth application alone does not connect the workspace; the skeleton must implement the authorization flow and validate the returned organization/team/project. [OAuth guide](https://linear.app/developers/oauth-2-0-authentication).
- [ ] Record the non-secret workspace URL and two project URLs in your handoff; let the app discover IDs through OAuth. If agents will manage this workspace through the Linear connector, reconnect that connector to **Shiproom**. Its current ARCI connection is separate from the app's OAuth credentials.

### 4. Daily: calls and live transcription

- [ ] Create/sign into a [Daily account](https://dashboard.daily.co/). Choose a domain based on `shiproom` (use a suffix if taken).
- [ ] In billing, add a payment method and enable the account access required for live transcription/webhooks. Standard usage is pay-as-you-go; confirm the rates shown in your account. Call-minute free allowances do not include integrated transcription. Daily bills its integrated Deepgram transcription; your Deepgram credits do not pay that bill. [Pricing and estimate](integrations.md).
- [ ] Copy the Daily API key from the dashboard's developer/API-key section to `DAILY_API_KEY` in `.env.local`.
- [ ] Keep `DAILY_WEBHOOK_SECRET` as the independently generated local base64 secret. The agent will supply it when registering the webhook after an HTTPS endpoint exists. Do not register a URL that cannot respond to Daily's signed verification handshake.
- [ ] Do not enable recording or create a public demo room. App code will create private rooms, short-lived tokens, and transcript storage. The first media spike must verify stored Nova-3 Georgian (`ka`) transcription, both speakers, and hint forwarding. The account checklist alone does not prove those features work.

### 5. Deepgram: uploaded-audio fallback

- [ ] Sign into [Deepgram Console](https://console.deepgram.com/). Create/select a **Shiproom** project and create an API key with the minimum permissions needed for speech transcription. Save it as `DEEPGRAM_API_KEY`.
- [ ] Confirm that the project has trial credit or a usable paid balance. Eligibility and remaining credit must be checked in your account; neither is assumed.
- [ ] Use Nova-3 with Georgian selected for a quiet-room sample; compare the same saved audio with/without a relevant subset from the [vocabulary catalog](transcription-vocabulary.md). Direct upload billing is separate from Daily. Streaming directly to Deepgram is a fallback engineering path, not required account setup for Daily's integrated transcription.

### 6. Existing OpenAI API account

- [ ] Put your existing API key in `.env.local` as `OPENAI_API_KEY`, or create a dedicated project key in [OpenAI API settings](https://platform.openai.com/api-keys). Check API billing/credit and available model access; ChatGPT subscriptions do not supply API usage.
- [ ] Keep `OPENAI_MODEL=gpt-5-mini` initially. The extraction agent must verify access and strict Structured Outputs with a synthetic planning fixture before relying on the model. If access fails, record the replacement model and update the default before building further. [Model reference](https://developers.openai.com/api/docs/models/gpt-5-mini).
- [ ] Set a suitable project usage alert/budget. No Gemini or Google AI Studio account is needed.

### 7. Inngest account

- [ ] Sign into [Inngest](https://app.inngest.com/) using GitHub if convenient. Use a Shiproom app/workspace as the dashboard allows.
- [ ] In the intended cloud environment, create/copy an event key and copy the signing key to `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`. Keep development/production environments consistent. Use the SDK-supported local dev-server mode for local execution; production keys are not a replacement for that setup.
- [ ] Wait for the scaffold before syncing an app. `/api/inngest` must exist and expose the actual functions first. [Next.js integration](https://www.inngest.com/docs/getting-started/nextjs-quick-start).

### 8. Private GitHub context, if needed for the demo

Public-only demo context can begin with the real `WeebPapi/shiproom` repository and an explicit allowlist. Private repo onboarding remains incomplete until the following is implemented:

- [ ] In [GitHub App settings](https://github.com/settings/apps), create a separate **GitHub App**, with an available name such as **Shiproom Context** and the public repository URL as Homepage URL. Disable its webhook if no GitHub event subscriptions are needed. This is separate from the login OAuth App.
- [ ] Set repository permissions **Contents, Issues, Pull requests: read-only**; Metadata is read-only automatically. Do not request repository writes or organization administration. Restrict installation to your account for the initial team demo.
- [ ] Generate/download its private key. Put the App ID in `GITHUB_APP_ID`; store the PEM text in `GITHUB_APP_PRIVATE_KEY` using an environment-file quoted multiline value, or enter it directly as a multiline Vercel environment value. Never paste it in a terminal command. Keep the downloaded `.pem` outside tracked files.
- [ ] Install the App on **selected repositories**, initially `WeebPapi/shiproom`. The implementation must validate installation/repository ownership and bind the allowed installation to the authorized Shiproom team before reading private content. For self-service installation, add the actual setup URL/return handling when that flow exists. [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/setting-up-a-github-app/choosing-permissions-for-a-github-app).

## After the skeleton: deployment and activation

Use the existing [Vercel project](https://vercel.com/weebpapis-projects/shiproom); do not create a duplicate import. The skeleton owner does these steps after the application builds:

1. Implement the [callback routes](architecture.md), database migrations/RLS, and server-side configuration validation. Install only dependencies actually needed. Align local Node with the project's 24.x runtime.
2. Add the required environment values in Vercel project **Settings → Environment Variables** for the intended environments. Set `NEXT_PUBLIC_APP_URL` to the actual stable deployment origin. Server secrets must never receive a `NEXT_PUBLIC_` prefix. Changing build-time public configuration requires a new build.
3. Connect `WeebPapi/shiproom` under Vercel **Settings → Git**, using `master` as production branch. Make the first deployment only once the scaffold is buildable. Record the actual production URL from Vercel.
4. Update Supabase Site URL to that stable production origin; keep the local allowlist entry and add `https://<actual-host>/auth/callback`. GitHub's provider callback stays on hosted Supabase. Add `https://<actual-host>/api/integrations/linear/callback` to Linear's OAuth redirects. Use a stable origin for the demo; do not broadly allow every preview URL.
5. Register Daily's webhook at `https://<actual-host>/api/webhooks/daily`, supplying `DAILY_WEBHOOK_SECRET`. Verify its signed handshake and subscribe only to the needed supported events. Ensure provider endpoints can be reached through any deployment protection without weakening their authentication.
6. Sync `https://<actual-host>/api/inngest` to the matching Inngest environment, or configure the documented Vercel integration. Verify signature settings and a real harmless function run. [Vercel deployment guide](https://www.inngest.com/docs/durable-execution/deploying-functions/platforms/vercel).
7. Exercise GitHub sign-in, Linear OAuth into **Shiproom**, and destination **SHIP / Shiproom Demo**, then the two-device Daily transcript test and an upload fallback. Check duplicate-safe issue publication on the isolated demo project before running a real planning meeting. Update [Decisions](decisions.md) with verified results.

Do not commit filled env files, Vercel link state, real recordings/transcripts, or OAuth tokens. Share team credentials through your password manager. Each developer needs their own ignored local file; the shared encryption key must match if using the same database of encrypted provider tokens.

## Prompt for the skeleton agent

```text
Read AGENTS.md, README.md, docs/product.md, docs/architecture.md,
docs/setup.md, docs/development.md, docs/delivery.md, and docs/decisions.md.
Build the smallest sound Next.js App Router + TypeScript skeleton in this
existing repository. Use npm and Node 24, Supabase SSR GitHub authentication,
explicit authorized team membership, and an accessible Linear-inspired shell
for the calendar, team/context selection, meeting, and participant inbox.
Implement the identity lane and shared contracts needed by the other lanes.
Keep provider secrets server-only, preserve the ignored .env.local without
printing it, and use the existing Vercel project. Do not overwrite these docs
or create another repository. Use the reserved callback paths. Validate input
and authorization; don't return fake successful integration results.
Daily + integrated Deepgram is the live path, direct Deepgram the upload path,
OpenAI Responses strict JSON the extraction path, and Inngest durable execution.
The dedicated Linear workspace is Shiproom; never use ARCI projects.
Do not implement all four lanes in the skeleton. Add only the shared pieces
and working identity flow, with clear states for integrations still pending.
Update .env.example and relevant docs in the same change. Replace proposed
commands with tested actual commands and run meaningful build/type checks
and focused checks for authorization. Record implemented versus verified
behavior honestly, with remaining setup and handoff details for all four devs.
```
