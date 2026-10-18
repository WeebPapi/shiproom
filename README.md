<img src="assets/icon.svg" width="64" height="64" alt="">

# Shiproom

Browser-based meetings that turn developer conversations into project work.

Meetings can also add agreed requirements and acceptance criteria to a clearly identified existing Linear issue in the selected project, preserving its current content and linking the update to transcript evidence. See the [existing-ticket demo](docs/demo.md#existing-ticket-edit-demonstration) for the verified synthetic example and current limits.

Shiproom brings a simple, Linear-inspired meeting experience together with Linear project context and GitHub repository context. Teams schedule a planning call or start a huddle, talk normally, and receive links to automatically created `[shiproom]` Linear issues. Each issue explains the agreed work and cites the conversation behind it.

**Status: hackathon slice on Vercel at [https://shiproom-weebpapis-projects.vercel.app](https://shiproom-weebpapis-projects.vercel.app); `master` auto-deploys.** GitHub/email sign-in, public repository approval, selected Linear destinations, Daily capture, Claude extraction, and issue publication are implemented. New issues are delegated to Cursor for draft PRs on the meeting’s selected GitHub repo (`/demo` falls back to [acme-repo-picker](https://github.com/WeebPapi/acme-repo-picker)); the meeting page tracks that agent/PR state. Georgian is the default speech language, with vocabulary hints and requested diarization; notes and tickets are generated in English, preserving the original transcript as evidence. Participants find notes, transcript, and issue links in-app. The personal-key demo is restricted to one configured Shiproom team. Production sign-in still needs the deployment origin on the Supabase allowlist. Live speech and end-to-end issue delivery still need rehearsal; see [Demo checks](docs/demo.md). Run it locally with `npm install && npm run dev`; full commands are in [Development](docs/development.md).

## Start here

1. Read [AGENTS.md](AGENTS.md) for contributor and coding-agent instructions.
2. Read [Product](docs/product.md) for the vision, demo scope, UX, and acceptance criteria.
3. Read [Architecture](docs/architecture.md) for shared data and workflow contracts.
4. Use [Delivery](docs/delivery.md) to divide the 24-hour build across four developers.
5. Follow the [provider setup checklist and skeleton handoff](docs/setup.md), then [Development](docs/development.md) for implementation and verification.

[Integrations](docs/integrations.md) records provider choices, costs, permissions, and the REA assessment. [Transcription vocabulary](docs/transcription-vocabulary.md) explains the reusable English/Georgian [hint catalog](docs/transcription-vocabulary.json). [Decisions and status](docs/decisions.md) separates user requirements, engineering defaults, open prerequisites, and actual progress.

## The hackathon demo

For a predictable video take, use the authenticated [`/demo` filming flow](docs/demo.md): a real huddle, a fixed synthetic Georgian transcript, and two real Linear issues. Apply its migration before use; it bypasses transcription and AI extraction and is visibly labeled scripted.

- **Planning call:** choose a Linear team/project and GitHub repo, schedule or start a real browser call, discuss a feature, and receive actionable Linear issues with source evidence.
- **Context-free huddle:** start quickly, let the agent resolve project/repo from the conversation, and prompt the organizer after the call if the destination is ambiguous.

Both paths use the same processing pipeline. Audio upload is the fallback if live calling or transcript capture misses the delivery gate. Calendar booking uses an in-app calendar and downloadable `.ics` invites. Ticket delivery is in-app only.

Deepgram Nova-3 is the chosen transcription provider. The current developer slice uses Next.js, Supabase, Daily's integrated transcription, and Claude. The user now prioritizes a Georgian meeting with English output. Upload, inference recovery, and durable Inngest processing remain unfinished; see [Integrations](docs/integrations.md) and [Demo checks](docs/demo.md).

## Living documentation

Update affected docs in the same change whenever behavior, scope, contracts, setup, or a relevant technical decision changes. Keep target behavior distinct from implemented and verified behavior. Both [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) require this; no automated documentation enforcement is configured.
