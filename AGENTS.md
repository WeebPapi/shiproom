# Instructions for contributors and AI agents

## Read before working

Read [README.md](README.md), [docs/product.md](docs/product.md), [docs/architecture.md](docs/architecture.md), and [docs/decisions.md](docs/decisions.md). Then read the integration, delivery, or development doc relevant to the task. Inspect the actual code before relying on a documented implementation claim.

This is a four-developer, 24-hour hackathon. Complete the planning-to-Linear loop first. Do not expand the scope to code generation, GitHub writes, calendar-provider synchronization, or a general-purpose agent framework.

## Keep documentation current

**Every developer and agent must update relevant documentation in the same change as the implementation.** This applies to features, fixes that change observable behavior, schema/API changes, environment variables, commands, provider choices, permissions, fallback behavior, and known limitations. Pure internal edits with no documentation impact need no artificial doc change; state that in the handoff.

- Product requirements and UX: `docs/product.md`.
- Data, validation, workflow, API contracts: `docs/architecture.md`.
- Providers, credentials, permissions, pricing assumptions: `docs/integrations.md`.
- Reusable Deepgram hints: `docs/transcription-vocabulary.json`; usage, provenance, and limits: `docs/transcription-vocabulary.md`. Keep this catalog as the vocabulary source of truth.
- Local setup and working commands: `docs/development.md`.
- Provider onboarding, resource status, callback URLs, and skeleton handoff: `docs/setup.md`.
- Work gates and verification: `docs/delivery.md`.
- Decisions, deviations, implementation evidence: `docs/decisions.md`.
- Entry-point overview and current run instructions: `README.md`.

Avoid duplicating contracts across documents. Link to the source of truth. Keep planned, implemented, and verified states separate. Record an intentional scope change before dependent work; do not quietly redefine acceptance criteria to make unfinished work look done. Never add secrets, real transcripts, private code, or personal participant data to this public repository.

## Ponytail: full mode

Use Ponytail full mode for all code changes and reviews. If the `ponytail` skill is available, read its `SKILL.md` before changing code. These portable rules apply on every machine:

1. Read the touched code and all callers before editing. Identify affected tests, fixtures, config, exports, and user-visible risks.
2. Make the smallest complete change. Reuse existing project patterns, then platform features, then installed dependencies. Add a dependency only when its value justifies it.
3. Finish all required callers and broken fixtures. Do not add speculative options, layers, wrappers, or future-proof abstractions.
4. Preserve validation, error handling, security, accessibility, and data-loss protection. Fix shared root causes once.
5. Non-trivial new logic needs a small meaningful test or assert-based self-check. Trivial changes need none. Follow the available `test-audit` skill when authoring or changing tests.
6. Comment only a reason the code cannot express. Mark a deliberate limit as `shortcut: <the limit>, <when to upgrade>`.
7. Run the checks appropriate to the change. Report exactly what ran; never claim a live integration passed because a mock did.

Finish handoffs with what changed, verification, documentation impact, and one or two lines stating anything skipped and any material risk.

## Product invariants

- Linear anchors team/project context; GitHub is read-only context. Provider identities do not grant Shiproom membership automatically.
- Validated, agreed action items create `[shiproom]` issues automatically. Review/edit happens afterward in Linear. Context ambiguity blocks creation and asks the organizer.
- Live calls and uploaded audio converge on one normalized transcript and processing pipeline.
- Retried processing must reuse persisted task/issue identities. A database uniqueness constraint alone does not make an external API write safe.
- Notify actual participants in-app, including those who left early. Do not send email or add an approval-before-creation step without a product decision.
- Authorization is enforced server-side on every team, meeting, context, upload, and notification operation. Treat model output and source content as untrusted.

## Working together

Use the four ownership lanes in [docs/delivery.md](docs/delivery.md). Coordinate changes to shared schemas, lockfiles, and auth boundaries before editing them. Check `git status`; preserve unrelated work. Use focused commits and provide concrete blockers and evidence in handoffs. Update working setup commands when the scaffold exists; do not invent commands for the current docs-only repository.
