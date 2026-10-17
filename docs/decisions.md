# Decisions and implementation status

Last updated: 2026-10-17. Update this file for relevant decisions and verified progress, not every mechanical edit. Product scope remains in [Product](product.md); technical contracts remain in [Architecture](architecture.md).

## Confirmed user requirements

- **D1 — product:** browser-only, straightforward Linear-inspired UI for developer meetings; team formation with linked GitHub identities/email and Linear context.
- **D2 — primary scenario:** planning conversation becomes actionable Linear issues informed by read-only GitHub context. No code/PR generation in this build.
- **D3 — context:** modal before scheduling or starting a huddle offers connected repo/team/project choices and inference. Unresolved context prompts the organizer after the call.
- **D4 — media:** real calls are preferred, with an easy audio-upload fallback. Common meeting controls remain part of the target app.
- **D5 — automation:** automatically create issues with `[shiproom]` in the title and immediately distribute links to call participants. Users review/edit afterward in Linear; no mandatory approval-before-create step.
- **D6 — calendar:** in-app booking/calendar and downloadable `.ics` are sufficient. Google/Outlook sync is deferred.
- **D7 — notifications:** in-app only. Email addresses support identity/team membership; no outgoing ticket email is required.
- **D8 — delivery:** four developers, heavy coding-agent usage, 24 hours, TypeScript/Next.js preference, web deployment.
- **D9 — living docs:** maintain the vision and final intended scope, with relevant updates required in both agent instruction entry points. No automated enforcement requested.
- **D10 — publication:** create a new public `WeebPapi/shiproom` GitHub repository for this checkout and its documentation.
- **D11 — Georgian:** transcription should preferably support Georgian alongside English. HappyScribe was suggested for evaluation, not mandated as the provider. Language support and practical developer-conversation accuracy both need verification.
- **D12 — transcription choice and vocabulary:** use Deepgram Nova-3. Preserve the user's screenshot hints, previous suggestions, and useful additions in a reusable English/Georgian catalog for implementation. Provider choice is settled; this does not assert that Georgian quality or hint effectiveness passed verification.
- **D13 — call provider:** use Daily alongside Deepgram, with integrated transcription billed separately from free call allowances. Start with Daily Prebuilt.
- **D14 — Linear setup:** create a dedicated **Shiproom** workspace, not the connected ARCI projects workspace/team. Proposed destinations are **Shiproom MVP** for build work and **Shiproom Demo** for generated demo issues.
- **D15 — account setup:** the user wants an exact manual checklist, has Supabase/Vercel accounts and an OpenAI API key, and no AI Studio account. Use the existing OpenAI API account for extraction; no Gemini signup is required.

## Initial engineering defaults

These are scoped implementation recommendations, chosen to make the request concrete. They can change with evidence; record changes here and update dependent contracts before implementation diverges.

- **E1 — team anchor:** one Linear workspace per Shiproom team; explicit app memberships/invitations. Choose one eligible Linear team/project and one GitHub repo per call.
- **E2 — capture:** Daily Prebuilt for call transport, integrated Deepgram Nova-3 as the first live transcription route, and direct Deepgram for uploads. Share the normalized transcript contract and [vocabulary reference](transcription-vocabulary.md). Account eligibility, live model/language/hint forwarding, and two-device capture are early gates, not assumptions of working media.
- **E3 — backend:** one Next.js app, Supabase Auth/Postgres/private storage, Inngest durable processing. No custom media servers or general agent framework.
- **E4 — extraction:** OpenAI Responses API strict JSON Schema with local semantic checks and transcript/source evidence. Initial model `gpt-5-mini`, pending account-access and extraction checks. One model/provider initially.
- **E5 — GitHub:** separate identity login from selected-repo read access; prefer a read-only GitHub App. Public-repo-only context is an explicit fallback, not completion of private repo onboarding.
- **E6 — reliability:** freeze one task batch, preallocate UUID v4 issue IDs, reconcile external timeouts by that ID, persist participant notifications. Context ambiguity blocks writes. No automatic re-publication after a completed batch.
- **E7 — demo bounds:** four authenticated users, desktop Chrome/Edge, English and preferably Georgian speech with explicit language selection; uploads up to 25 MB/15 minutes, up to ten grounded tasks, bounded context reads. Georgian has an early quality gate; broader languages and unrestricted code-switching need later verification.
- **E8 — deployment:** Vercel web app, hosted Supabase, Inngest Cloud, hosted Daily. Confirm account/hosting limits during setup; do not turn a docs recommendation into an unapproved paid signup.
- **E9 — REA:** optional future investigation tool, not the app base or runtime. Document/manifest assessment only; see [Integrations](integrations.md).

## Implementation ledger

- Documentation foundation: written and validated; published in the public [WeebPapi/shiproom repository](https://github.com/WeebPapi/shiproom) on `master`.
- Setup preparation: [manual checklist and skeleton handoff](setup.md), `.env.example`, and secret/build ignore rules written. Vercel `weebpapis-projects/shiproom` created, linked locally, and verified as Next.js / Node 24.x. No Git auto-deployment connection or app deployment yet. Supabase `shiproom-dev` (`fnrdatkgwdtsqmvstrlp`, Tokyo), GitHub login OAuth, and private `shiproom-audio` bucket settings are configured; Linear/Daily/Deepgram/Inngest/OpenAI keys and the app scaffold are not. ARCI has not been modified.
- App scaffold / local commands: not started.
- Auth, team membership, invitations: not started.
- Linear OAuth/context and GitHub repository connection: not started.
- Calendar/huddles/context UI: not started.
- Live calls and durable transcription: not started.
- Upload fallback and normalization: not started.
- Inference/extraction and durable workflow: not started.
- Retry-safe issue creation and in-app inbox: not started.
- Deployment, automated checks, and live acceptance verification: not started.

Mark an item implemented when code exists; mark it verified only with a check result. A mock, fixture, or documented API is not evidence of a live integration.

## Prerequisites still open

Assign the four developer lane owners and H0 start time. These block claims of a working app; they do not block starting the identity-lane skeleton. Live status: [Setup](setup.md#agent-visible-status). Architecture constraints the scaffold must honor: [Architecture](architecture.md#remaining-implementation-constraints).

Still required before claiming integrations:

- Put `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` in ignored `.env.local` (user has an OpenAI key). Do not paste them into chat.
- Create dedicated Linear workspace **Shiproom** (team **SHIP**, projects **Shiproom MVP** / **Shiproom Demo**) and the OAuth app. Do not use ARCI.
- Sign into Daily, Deepgram, and Inngest; copy keys locally. Confirm Daily paid transcription/webhook eligibility. Do not register webhook URLs yet.
- Private GitHub App remains optional; public `WeebPapi/shiproom` is the documented fallback.
- Confirm OpenAI `gpt-5-mini` Structured Outputs access with a synthetic fixture after the extraction lane exists.
- Establish a deployment URL only after the scaffold is buildable; do not deploy docs-only.

If billing or setup blocks a provider, use the relevant documented fallback and record the change. Unfinished self-service onboarding must be disclosed if the demo relies on a preconfigured team. Do not cut authorization, evidence, or duplicate safety to claim the full scope is complete.

## Change and verification log

- **2026-10-17 — dashboard setup recorded, skeleton unblocked:** GitHub login OAuth App **Shiproom Login** (`3940221`) is enabled in Supabase; Auth redirects include `http://localhost:3000/auth/callback`; `shiproom-audio` is private with 25 MB and the documented MIME allowlist (still zero storage policies). Public Supabase URL and publishable key are in ignored `.env.local`; `service_role` and remaining provider keys are not. Project region is Tokyo, not Frankfurt. Linear/Daily/Deepgram/Inngest remain behind login. Remaining implementation constraints were added to [Architecture](architecture.md); [Setup](setup.md) now has an agent-visible status table. No app scaffold, deploy, webhook registration, or schema.

- **2026-10-17 — Supabase OAuth verified:** completed authorization using the signed-in preview browser. `codex mcp login supabase` exited successfully and the CLI reports `auth_status: o_auth`. The existing session has no Supabase tools loaded and its resource lookup reports an unknown server; a session reload and actual read-only project query remain necessary. No database/schema changes or application integration were performed.

- **2026-10-17 — Supabase agent connection initiated:** added the user's project-scoped Supabase HTTP MCP server to local Codex configuration and verified its enabled URL with `codex mcp get supabase`. The add command automatically started browser OAuth; user sign-in/authorization and live tool access remain pending. No database changes were made and no optional agent-skill package was installed.

- **2026-10-17 — storage setup guidance:** user's Supabase screenshot shows bucket `shiproom-audio`, private visibility, size restriction disabled, and MIME restriction enabled with no list entered. Adopted that bucket name in the setup/architecture contracts and documented a 25 MB cap plus initial audio MIME allowlist. Saving settings, access policies, and actual uploads remain unverified.

- **2026-10-17 — setup preparation:** verified GitHub and Vercel CLI identity; created and locally linked Vercel project `shiproom` under `weebpapis-projects`, then configured and inspected Next.js / Node 24.x. Recorded dedicated Linear workspace and manual onboarding decisions, switched the active extraction recommendation to the existing OpenAI account, added configuration templates/ignores and exact callback contracts. Current Linear connector sees only ARCI; no workspace was changed. No app, provider integration, billing signup, or model request was executed.
- **2026-10-17 — setup checks:** validated 11 Markdown files, 66 local links, balanced code fences, Unicode text, vocabulary JSON, unique environment-template keys, and generated secret lengths without printing values. Verified `.env.local` and `.vercel/project.json` are ignored while `.env.example` is eligible for tracking. Application checks remain inapplicable before scaffolding.

- **2026-10-17 — documentation baseline:** captured user clarifications, two planning demo paths, agent doc-maintenance rules, architecture contracts, provider comparison/REA assessment, and four-developer delivery gates. Application functionality is still unimplemented. Provider documentation was reviewed; no provider integration was exercised.
- **2026-10-17 — documentation checks:** nine Markdown files and 35 local links checked; JSON example parsed and code fences balanced. Reviewed scope consistency against calendar + `.ics`, in-app-only delivery, automatic issue creation, and live/upload parity. Application tests are not applicable before scaffolding.
- **2026-10-17 — GitHub publication:** created the public repository and pushed the documentation baseline (`e82523b`); verified public visibility, default branch `master`, and matching remote commit. No app or live integration is deployed.
- **2026-10-17 — Georgian/HappyScribe clarification:** replaced the English-only demo assumption with a Georgian target, selected-language contract, and AC9 quality gate. Current Deepgram Nova-3 docs list Georgian; Daily exposes model/language options. HappyScribe's developer docs also list Georgian and a batch Orders API. Retained Daily/Deepgram as the initial recommendation pending real samples/account access; documented HappyScribe as an alternative. No provider or Georgian audio test has run.
- **2026-10-17 — preliminary user test:** user supplied Nova-3 transcript text and reported a very noisy recording environment. Against the intended script, owners/broad task structure survived while important source names and developer terms were distorted. Original audio/settings and downstream extraction were not checked. AC9 remains unverified; repeat in quiet conditions, then test documented keyterm hints on the same saved audio before choosing a provider. No raw user transcript was added to the repository.
- **2026-10-17 — Deepgram selected and vocabulary cataloged:** user settled on Deepgram and supplied three screenshots of vocabulary hints after further Georgianized-English recognition issues. Added all 26 supplied strings, earlier suggestions, and additional candidates to a source-attributed JSON catalog, with selection/budget/normalization guidance for agents. Kept Daily as the proposed media transport and removed provider comparison as a build prerequisite. No new audio test or application code was run.
