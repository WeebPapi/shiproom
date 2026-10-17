# Provider setup and skeleton handoff

Checked 2026-10-17. This is the user's requested manual setup checklist. Check off steps only after doing them; unchecked items are not configured. Keep credentials in the ignored `.env.local` or a password manager, never in chat, Git, or this document. [Architecture](architecture.md) owns callback paths and remaining implementation constraints; [Integrations](integrations.md) owns permissions and provider behavior.

Agents: read **Agent-visible status** and [Architecture remaining constraints](architecture.md#remaining-implementation-constraints) before scaffolding. Do not recreate provisioned resources. Do not treat dashboard configuration as a working app.

## Agent-visible status

**GitHub OAuth verified:** sign-in completes on both `http://localhost:3000` and `https://desktop-jjp034u.tail51e7da.ts.net` against developer project `bovjaxluyejvmgulvypz`. After the user saved the matching HTTPS redirect configuration, a fresh signed-out GitHub flow reached the HTTPS callback, returned to the HTTPS app with no localhost requests, and survived refresh. The callback uses relative Location headers so the reverse proxy cannot redirect the browser to its internal localhost address. Keep callback URLs and query strings covered by the allowlist; see [Development](development.md#auth-and-callback-urls). Canonical-project login remains unverified.

| Resource | State | Evidence / remaining |
| --- | --- | --- |
| GitHub repo | **configured** | Public [WeebPapi/shiproom](https://github.com/WeebPapi/shiproom), `master`. |
| Vercel project | **configured, not deployed** | [weebpapis-projects / shiproom](https://vercel.com/weebpapis-projects/shiproom), ID `prj_qQNcfxoVxlZPMtqLYmYoSih9ibRf`. Next.js, Node **24.x**, root `.`. No Git auto-deploy, no production URL. Do not create another project. Do not deploy the docs-only tree. |
| Supabase project | **configured; schema not applied** | `shiproom-dev`, ref `fnrdatkgwdtsqmvstrlp`, org weebpapi's projects, Free, **Tokyo `ap-northeast-1`** (not Frankfurt). GitHub repo linked. Migration is checked in (`supabase/migrations/`) but **not applied**; see [Development](development.md#database-migrations). The Supabase MCP returned "You do not have permission" for this ref on 2026-10-17. MCP login is not app credentials. |
| Developer Supabase project | **schema applied; GitHub auth verified locally** | One developer's personal free project `shiproom-dev`, ref `bovjaxluyejvmgulvypz`, Frankfurt `eu-central-1`, used locally until the team shares a project. Migration `initial_schema` applied 2026-10-17 (object counts match the file); private bucket `shiproom-audio` created with 25 MB and the MIME allowlist below. GitHub provider is enabled with separate **Shiproom Login (dev)** OAuth app, callback `https://bovjaxluyejvmgulvypz.supabase.co/auth/v1/callback`. `SUPABASE_SERVICE_ROLE_KEY` is present. GitHub -> Supabase -> localhost PKCE sign-in and public repo approval were verified on 2026-10-17. Tailscale HTTPS sign-in and authenticated refresh were also verified. Its data is not shared with teammates on `fnrdatkgwdtsqmvstrlp`. |
| Supabase Auth URLs | **configured** | Site URL `http://localhost:3000`. Allowed redirect includes `http://localhost:3000/auth/callback`. |
| GitHub login OAuth | **configured in Supabase** | OAuth App **Shiproom Login**, id `3940221`, owner WeebPapi, homepage `http://localhost:3000`, callback `https://fnrdatkgwdtsqmvstrlp.supabase.co/auth/v1/callback`. GitHub provider enabled. Client secret lives in Supabase, not `.env.local`. The PKCE route exists. Canonical-project login remains unverified; the developer-project flow was verified locally (row above). |
| Storage bucket | **configured; policies checked in, not applied** | `shiproom-audio`: private, 25 MB restrict on, MIME allowlist saved. Ownership policies are in the checked-in migration and take effect only once it is applied. |
| Local `.env.local` | **partial** | Present for local development, values never printed: public Supabase settings, `CREDENTIAL_ENCRYPTION_KEY`, `DAILY_API_KEY`, `DAILY_WEBHOOK_SECRET`, `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, `LINEAR_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. **Missing or empty:** `ANTHROPIC_WORKSPACE_ID` (required for this unscoped Claude key), `OPENAI_API_KEY`, `LINEAR_CLIENT_*`, `INNGEST_*`, `GITHUB_APP_*`. |
| Linear workspace | **not created** | Need dedicated **Shiproom** workspace, team identifier **SHIP**, projects **Shiproom MVP** and **Shiproom Demo**, OAuth app `read,issues:create`, redirect `http://localhost:3000/api/integrations/linear/callback`. Connected Linear MCP still sees **ARCI**. Do not use or modify ARCI. |
| Daily / Deepgram / Inngest | **unauthenticated** | Dashboards hit login/signup. No API keys in `.env.local`. Do not register webhooks until HTTPS routes exist. |
| Private GitHub App | **not created** | Public-repo demo fallback is `WeebPapi/shiproom`. Do not request `repo` write scopes. |
| App scaffold | **implemented, not deployed** | Next.js 16.4 identity-lane skeleton; Node 24 pinned (`.nvmrc`, `engines`). Build/typecheck/lint/tests pass locally. Commands: [Development](development.md#local-setup-and-commands). |

Configured means a dashboard resource exists. Credentials present means the ignored local env has a non-empty value. Verified means a live check passed. GitHub login is **verified on localhost and Tailscale HTTPS on the developer project**. Linear OAuth, Daily transcription, Deepgram upload, OpenAI extraction, and Inngest jobs remain **not verified**.

Supabase MCP (Codex and Cursor) can be `ready` after OAuth. That connection does not fill `.env.local` and does not replace checked-in migrations. Reload the agent session before claiming MCP database access.

## Do now: accounts and credentials

### 1. Supabase project

- [x] Sign into [Supabase](https://supabase.com/dashboard). Project **shiproom-dev** exists in weebpapi's projects on the free plan. Region is **Tokyo (`ap-northeast-1`)**, not Frankfurt; keep using this project. Database password stays in the password manager; the app does not need it in `.env.local`.
- [x] Project URL and publishable key are in ignored `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
- [ ] Copy the legacy `service_role` key to `SUPABASE_SERVICE_ROLE_KEY`. It is server-only and bypasses RLS. Do not substitute the anonymous key for it. Do not paste it into chat or docs.
- [x] **Authentication → URL Configuration**: Site URL `http://localhost:3000`; allowed redirect includes `http://localhost:3000/auth/callback`.
- [x] Bucket `shiproom-audio`: **Public bucket off**, **Restrict file size on** at **25 MB**, **Restrict MIME types on** with:

  ```text
  audio/mpeg, audio/mp4, audio/x-m4a, audio/wav, audio/x-wav, audio/webm, audio/ogg, audio/flac, audio/x-flac, audio/aac
  ```

  This initial allowlist covers common MP3/M4A/WAV/WebM/Ogg/FLAC/AAC audio and common MIME aliases; it is not proof that an uploaded file is valid audio. The upload implementation must validate real format/duration and handle MIME detection consistently. Keep storage private and add ownership-based upload/read policies; do not grant blanket authenticated access. [Supabase upload restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets), [Deepgram formats](https://developers.deepgram.com/docs/supported-audio-formats).
- [ ] **Zero storage policies exist.** Add ownership-based upload/read policies in checked-in migrations with the schema. Do not invent ad-hoc tables in the dashboard.
- [ ] Do not manually invent database tables. The identity-lane scaffold creates checked-in migrations and RLS from [Architecture](architecture.md).

### 2. GitHub login through Supabase

- [x] GitHub OAuth App **Shiproom Login** (id `3940221`, owner WeebPapi). Homepage URL `http://localhost:3000`.
- [x] Authorization callback URL is hosted Supabase auth: `https://fnrdatkgwdtsqmvstrlp.supabase.co/auth/v1/callback`. This is different from the Next.js `/auth/callback` path.
- [x] GitHub provider enabled in Supabase **Authentication → Sign In / Providers → GitHub** with that app's client ID and secret. Those credentials belong in Supabase, not `.env.local`.
- [x] Developer-project GitHub sign-in completes the PKCE exchange on localhost. The browser requests its own origin's callback; allow every exact development origin in Supabase (see [Development](development.md#auth-and-callback-urls)).
- [ ] Verify canonical-project sign-in and an account with a private/missing email. [Official setup](https://supabase.com/docs/guides/auth/social-login/auth-github).

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

Paste the following. Do not expand into media, extraction, or issue publication in the same change.

```text
Read AGENTS.md, README.md, docs/product.md, docs/architecture.md
(especially Remaining implementation constraints and reserved callback
paths), docs/setup.md (Agent-visible status first), docs/development.md,
docs/delivery.md, docs/decisions.md, and docs/integrations.md.

This is the identity-lane skeleton only (delivery lane A). Do not build
Daily calling, Deepgram upload, OpenAI extraction, Inngest publication,
or GitHub writes. Do not deploy. Do not register webhooks. Do not use
or modify the ARCI Linear workspace.

Build the smallest sound Next.js App Router + TypeScript app in this
existing public repo (WeebPapi/shiproom, master). Use npm. Pin Node 24
to match the existing Vercel project prj_qQNcfxoVxlZPMtqLYmYoSih9ibRf
(weebpapis-projects/shiproom). Local Node may still be 22.x; do not
create a second Vercel project.

Reuse provisioned resources from docs/setup.md:
- Supabase shiproom-dev, ref fnrdatkgwdtsqmvstrlp, Tokyo ap-northeast-1
- GitHub login OAuth App "Shiproom Login" already enabled in Supabase
- bucket shiproom-audio (private, 25 MB, MIME allowlist; no policies yet)
- reserved paths /auth/callback,
  /api/integrations/linear/callback, /api/webhooks/daily,
  /api/webhooks/deepgram, /api/inngest
- public-repo fallback WeebPapi/shiproom until a GitHub App exists

Implement: Supabase SSR GitHub authentication (PKCE), explicit
authorized team membership (not "logged in with GitHub" = member),
checked-in SQL migrations + RLS from the architecture minimum
persisted model, ownership policies on shiproom-audio, and an
accessible Linear-inspired shell for team home/calendar, context
selection, meeting placeholder, and participant inbox. Shared
validation schemas in one contracts module. Server-only secrets.

Missing env (service_role, Linear/Daily/Deepgram/OpenAI/Inngest keys)
must produce honest disconnected/not-configured UI, never fake
success. Linear OAuth: request read,issues:create against the
reserved callback; destination workspace is Shiproom / SHIP /
Shiproom Demo once that workspace exists. Handle missing GitHub
email. Preserve ignored .env.local; never print secrets.

Ponytail full mode. Smallest complete change. Update .env.example
and relevant docs in the same change. Replace proposed commands
with tested actual commands. Run build/typecheck and a focused
authorization check. Record implemented vs verified honestly.
```
