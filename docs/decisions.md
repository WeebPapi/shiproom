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

## Initial engineering defaults

These are scoped implementation recommendations, chosen to make the request concrete. They can change with evidence; record changes here and update dependent contracts before implementation diverges.

- **E1 — team anchor:** one Linear workspace per Shiproom team; explicit app memberships/invitations. Choose one eligible Linear team/project and one GitHub repo per call.
- **E2 — capture:** Daily Prebuilt + paid live transcription first; Deepgram upload fallback. Shared normalized transcript contract. Account eligibility and two-device capture are early gates, not assumptions of working media.
- **E3 — backend:** one Next.js app, Supabase Auth/Postgres/private storage, Inngest durable processing. No custom media servers or general agent framework.
- **E4 — extraction:** schema-constrained Gemini Flash JSON with local semantic checks and transcript/source evidence. One model/provider initially, with a real extraction smoke test before freezing the scaffold model ID.
- **E5 — GitHub:** separate identity login from selected-repo read access; prefer a read-only GitHub App. Public-repo-only context is an explicit fallback, not completion of private repo onboarding.
- **E6 — reliability:** freeze one task batch, preallocate UUID v4 issue IDs, reconcile external timeouts by that ID, persist participant notifications. Context ambiguity blocks writes. No automatic re-publication after a completed batch.
- **E7 — demo bounds:** four authenticated users, desktop Chrome/Edge, English speech; uploads up to 25 MB/15 minutes, up to ten grounded tasks, bounded context reads. Broader support needs a later decision and verification.
- **E8 — deployment:** Vercel web app, hosted Supabase, Inngest Cloud, hosted Daily. Confirm account/hosting limits during setup; do not turn a docs recommendation into an unapproved paid signup.
- **E9 — REA:** optional future investigation tool, not the app base or runtime. Document/manifest assessment only; see [Integrations](integrations.md).

## Implementation ledger

- Documentation foundation: written and validated; published in the public [WeebPapi/shiproom repository](https://github.com/WeebPapi/shiproom) on `master`.
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

Assign the four developer lane owners and H0 start time. Provision provider accounts/credentials privately, verify Daily paid transcription/webhook access, choose a real demo Linear team/project and allowlisted GitHub repository, confirm the model/account/data-use configuration, and establish the deployment URL. None of these block publication of the base specification; they block claims of a working app.

If billing or setup blocks a provider, use the relevant documented fallback and record the change. Unfinished self-service onboarding must be disclosed if the demo relies on a preconfigured team. Do not cut authorization, evidence, or duplicate safety to claim the full scope is complete.

## Change and verification log

- **2026-10-17 — documentation baseline:** captured user clarifications, two planning demo paths, agent doc-maintenance rules, architecture contracts, provider comparison/REA assessment, and four-developer delivery gates. Application functionality is still unimplemented. Provider documentation was reviewed; no provider integration was exercised.
- **2026-10-17 — documentation checks:** nine Markdown files and 35 local links checked; JSON example parsed and code fences balanced. Reviewed scope consistency against calendar + `.ics`, in-app-only delivery, automatic issue creation, and live/upload parity. Application tests are not applicable before scaffolding.
- **2026-10-17 — GitHub publication:** created the public repository and pushed the documentation baseline (`e82523b`); verified public visibility, default branch `master`, and matching remote commit. No app or live integration is deployed.
