<img src="assets/icon.svg" width="64" height="64" alt="">

# Shiproom

Browser-based meetings that turn developer conversations into project work.

Shiproom brings a simple, Linear-inspired meeting experience together with Linear project context and GitHub repository context. Teams schedule a planning call or start a huddle, talk normally, and receive links to automatically created `[shiproom]` Linear issues. Each issue explains the agreed work and cites the conversation behind it.

**Status: specification and setup preparation.** This repository contains documentation, a starter icon, and an environment template. The Vercel project is created and linked locally, with Next.js selected. There is no application, install command, deployed demo, or working integration yet. Requirements below describe the intended product; they are not claims of implemented behavior.

## Start here

1. Read [AGENTS.md](AGENTS.md) for contributor and coding-agent instructions.
2. Read [Product](docs/product.md) for the vision, demo scope, UX, and acceptance criteria.
3. Read [Architecture](docs/architecture.md) for shared data and workflow contracts.
4. Use [Delivery](docs/delivery.md) to divide the 24-hour build across four developers.
5. Follow the [provider setup checklist and skeleton handoff](docs/setup.md), then [Development](docs/development.md) for implementation and verification.

[Integrations](docs/integrations.md) records provider choices, costs, permissions, and the REA assessment. [Transcription vocabulary](docs/transcription-vocabulary.md) explains the reusable English/Georgian [hint catalog](docs/transcription-vocabulary.json). [Decisions and status](docs/decisions.md) separates user requirements, engineering defaults, open prerequisites, and actual progress.

## The hackathon demo

- **Planning call:** choose a Linear team/project and GitHub repo, schedule or start a real browser call, discuss a feature, and receive actionable Linear issues with source evidence.
- **Context-free huddle:** start quickly, let the agent resolve project/repo from the conversation, and prompt the organizer after the call if the destination is ambiguous.

Both paths use the same processing pipeline. Audio upload is the fallback if live calling or transcript capture misses the delivery gate. Calendar booking uses an in-app calendar and downloadable `.ics` invites. Ticket delivery is in-app only.

Deepgram Nova-3 is the chosen transcription provider for live calls and uploaded audio. Use Next.js + TypeScript, Supabase, Daily for calls with its integrated Deepgram transcription as the first live path, OpenAI structured extraction using the user's existing API account, and Inngest for durable processing. English and Georgian transcription are targets; Georgian quality, vocabulary hints, and the live provider configuration require a sample check. Provider accounts and an end-to-end smoke test are still required; see [Integrations](docs/integrations.md).

## Living documentation

Update affected docs in the same change whenever behavior, scope, contracts, setup, or a relevant technical decision changes. Keep target behavior distinct from implemented and verified behavior. Both [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) require this; no automated documentation enforcement is configured.
