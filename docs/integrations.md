# Integrations and provider choices

Checked against official documentation on 2026-10-17. Prices, model IDs, limits, and eligibility can change; confirm in the actual accounts before implementation. These are engineering recommendations, not accounts already provisioned or integrations already tested.

## Recommendation

Use **Daily Prebuilt inside a Shiproom shell, with Daily live transcription**, for the first working call. Use **Deepgram Nova-3 for uploaded audio**. This minimizes the media work while preserving one downstream transcript contract. Spend hackathon time on context, useful tickets, and a clear result UI. A custom Daily React call surface is a polish step after the core passes.

Provider comparison:

- **Daily:** complete embeddable call UI and integrated live transcription/storage. First 10,000 call participant-minutes/month are free; live transcription is separately billed at $0.0059 per unmuted participant-minute. Transcription requires a paid account; webhooks require a card on file. Best fit for the shortest live-call implementation. [Pricing](https://www.daily.co/pricing/video-sdk/), [transcription](https://docs.daily.co/docs/guides/features/transcription), [webhooks](https://docs.daily.co/reference/rest-api/webhooks).
- **Deepgram:** direct file transcription and a JavaScript SDK; Nova-3 monolingual prerecorded speech is listed at $0.0043/audio-minute, plus any enabled add-ons. Pricing advertises $200 introductory credit without a credit card. Best upload fallback because Daily already uses Deepgram for transcription. This is a separate account/credit balance. [Pricing](https://deepgram.com/pricing), [file guide](https://developers.deepgram.com/docs/pre-recorded-audio).
- **LiveKit:** good alternative when custom call UI or a real participant agent becomes central. Its free Build allowances include 5,000 WebRTC participant-minutes and 60 transcode minutes; inference and agent usage have separate limits. For this demo, integrating a custom media/agent path adds work compared with an embedded call. This is a scope judgment, not a performance benchmark. [Quotas and included usage](https://docs.livekit.io/deploy/admin/quotas-and-limits/).
- **AssemblyAI:** credible upload-first alternative; prerecorded Universal-2 is listed at $0.15/hour and Universal-3.5 Pro at $0.21/hour before add-ons. Lower raw STT cost does not remove call transport/capture work. Keep it an alternative rather than implementing two interchangeable upload providers. [Pricing](https://www.assemblyai.com/pricing).

Cost example, an estimate rather than a bill: a four-person 15-minute call consumes 60 call participant-minutes. If all four remain unmuted throughout, Daily live transcription is about **$0.354**, excluding extras and with call transport covered by the unused free allowance. A separate 15-minute monolingual Deepgram upload is about **$0.0645** before add-ons/credits. Transcription is not included in Daily's free call minutes. These figures follow the pricing units above; do not compare meeting minutes with participant-minutes as if they were equivalent.

If a card/paid transcription cannot be enabled in hour 1, keep Daily for calling if useful and ship the explicit upload demo. Do not spend the day building a custom multi-speaker audio capture bridge to save cents. Never present the upload path as successful live transcription.

## Daily: live media

Create private rooms on the server and mint expiring room-scoped meeting tokens. Tie provider `user_id` to the authenticated app user and store the room/session mapping. Limit administrative/transcription privileges to the organizer. The app decides admission; knowing a room URL is insufficient.

Enable `enable_transcription_storage`. Live events can render captions, but they are ephemeral without storage. Use the server [transcript API](https://docs.daily.co/reference/rest-api/transcripts) to retrieve the finished artifact; map its session to the meeting. Verify finalization after end-of-call and retain the raw artifact privately until normalized.

Register only needed webhook events after checking their current names in the provider docs. Supply your own generated base64 HMAC secret during registration so the initial signed verification request can also be checked. Verify signature/timestamp, deduplicate deliveries, and handle out-of-order participant/end/transcript events. Do not trust browser callbacks as proof of attendance or capture completeness. [Webhook contract](https://docs.daily.co/reference/rest-api/webhooks), [meeting tokens](https://docs.daily.co/reference/rest-api/meeting-tokens).

First spike: two devices, speech from both sides, stored final transcript, close the organizer browser, then successful server retrieval. This must pass before custom call controls are attempted.

## Deepgram: upload transcription

Server submits the app-owned audio object using a narrowly scoped expiring download URL or server-side binary transfer. Do not accept arbitrary remote URLs from users. Specify Nova-3, the demo language, formatting, utterance/timestamp output, and diarization where supported; map the response into [the transcript contract](architecture.md). Feature availability and extra pricing must be checked for the selected model.

Use Deepgram's asynchronous callback mode rather than holding a hosting request open. Persist a transcription attempt before submission, protect its HTTPS callback with a random per-attempt Basic Auth credential, and correlate the returned provider request ID before accepting output. Handle callbacks racing the submission response and duplicate deliveries. Do not rely solely on the optional `dg-token` header. Persist the response before acknowledging completion. Unknown speakers remain anonymous labels. Redact callback credentials from URLs/logs. [File transcription](https://developers.deepgram.com/docs/pre-recorded-audio), [callback authentication and delivery](https://developers.deepgram.com/docs/callback).

## Linear: central workspace and issue destination

Use OAuth for the actual team connection. Request `read` and `issues:create` initially; avoid broad `write` when creating issues is the only mutation. Verify OAuth state and exact callback URLs, encrypt tokens, store expiry/refresh metadata, and serialize refresh rotation. Link the returned organization ID to the Shiproom team and fetch eligible teams, projects, and members server-side. [OAuth and scopes](https://linear.app/developers/oauth-2-0-authentication).

Use the official TypeScript SDK or typed GraphQL calls. Validate selected team/project association and current connection before publishing. GraphQL HTTP 200 can include errors; check operation success and returned issue data. [API guide](https://linear.app/developers/graphql).

Create issues with the exact `[shiproom] ` title prefix, selected team/project, grounded description, and the task's preallocated UUID v4. The [current SDK schema](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql) exposes caller-supplied issue IDs. Duplicate/timeout reconciliation is specified in [Architecture](architecture.md); verify it with a real call before depending on retry behavior. Use the team's normal default issue state, not an invented workflow state.

A team-restricted personal API key may unblock the first private developer smoke test. If used, isolate it server-side to an explicitly authorized demo team and document the deviation. It does not count as completed OAuth onboarding. Do not paste keys into this public repo or a browser.

## GitHub: identity and read-only source context

Use Supabase's GitHub sign-in for identity; verify email availability and handle users who keep email private. Do not assume identity OAuth gives repository access. [Supabase GitHub login](https://supabase.com/docs/guides/auth/social-login/auth-github).

For private repository context, prefer a GitHub App installed on selected repositories with **Metadata, Contents, Issues, and Pull requests: read-only** permissions. The owner explicitly grants the app's repo allowlist to a Shiproom team; scope it on every request. Keep installation tokens server-side and short-lived. Individual linked GitHub identities are not a reason to expose all repositories they can access. [Permission guide](https://docs.github.com/en/apps/creating-github-apps/setting-up-a-github-app/choosing-permissions-for-a-github-app).

The first demo may use a small allowlist of public repositories with real API reads. Mark private repo connection incomplete if so. Avoid the broad OAuth `repo` scope for this read-only requirement; it includes write access. [OAuth scope documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).

Linear's existing GitHub integration may provide useful links; do not assume it grants Shiproom GitHub API access or reliably maps every Linear project to one repo. Context is explicitly selected/inferred and validated. No GitHub writes, branch creation, code execution, or global code search is needed.

## Structured extraction, persistence, and execution

Engineering default: **Gemini Flash via the official Google GenAI TypeScript SDK**, with JSON Schema output and local validation. Current researched model ID is `gemini-3.8-flash`; verify availability with one extraction before pinning it in the scaffold. This chooses an economical schema-capable model, not a claim that it has been benchmarked best for this task. Keep one model ID in server configuration; do not build a model picker. [Structured output](https://ai.google.dev/gemini-api/docs/structured-output).

Use synthetic/public content for any free-tier experiment. Google's pricing distinguishes free-tier content use for product improvement from paid-tier handling; use a suitable paid configuration for private team transcripts/code. Extraction quality still needs the fixtures in [Delivery](delivery.md). [Pricing/data-use distinctions](https://ai.google.dev/gemini-api/docs/pricing).

Supabase owns sessions, relational state, and private uploads. Direct-to-storage uploads avoid application request-body limits. Enforce file limits and use a supported resumable/signed upload mechanism when appropriate. [Storage upload guide](https://supabase.com/docs/guides/storage/uploads/standard-uploads).

Use Inngest's Next.js integration for durable post-call processing. Keep secret-bearing job payloads/logs minimal: pass meeting/request IDs, load credentials server-side, and return record IDs from steps rather than full transcripts. Its retry semantics do not guarantee exactly-once external effects; use persisted IDs and reconciliation. [Next.js guide](https://www.inngest.com/docs/getting-started/nextjs-quick-start), [step execution and side effects](https://www.inngest.com/docs/durable-execution/primitives/step-run).

Default web deployment: Next.js on Vercel, Supabase hosted project, Inngest Cloud, and Daily hosted media. Verify the actual hosting duration/body limits and configure job step timeouts accordingly before demo deployment. No paid subscriptions or provider accounts have been created by writing these docs.

## Calendar and delivery

Shiproom owns its meeting calendar. Generate `.ics` events with stable UID, UTC start/end, organizer-selected display timezone, escaped text, and an authenticated Shiproom join URL. Calendar-provider OAuth, availability search, automatic invitation email, and Google/Outlook sync are deferred.

Ticket delivery is **in-app only**, per the user's explicit clarification. Persist results and recipient inbox entries; polling while open is sufficient. Email addresses support identity/invitations, not outgoing email notifications. No email API/provider is required for this demo.

## REA assessment

[morluto/rea](https://github.com/morluto/rea) is an agent-oriented reverse-engineering CLI/MCP tool for inspecting applications, websites, JavaScript/Electron packages, and native binaries. Its own documentation describes analysis and agent-guided reconstruction, not a ready-to-fork conferencing platform. Its main package is an analysis tool rather than a Next.js meeting product. [README](https://github.com/morluto/rea#readme), [package manifest](https://github.com/morluto/rea/blob/main/package.json).

Decision: **do not use REA as Shiproom's base or runtime dependency**. The clarified need is a straightforward developer meeting UI and project workflow, for which documented media APIs are a shorter path. REA could be optional development tooling for one specific authorized behavior investigation later. It does not supply the app's calls, transcription pipeline, membership model, or Linear workflow. This assessment is based on documentation and manifest inspection, not installation or hands-on testing. No Meet binaries or private protocols were examined.
