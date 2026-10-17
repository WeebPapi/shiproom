# Architecture and shared contracts

Status: proposed implementation contract. No schema, routes, or services described here exist yet. [Product](product.md) owns behavior; this file owns the technical boundaries. Change shared contracts here and in code together.

## System boundaries

Use one Next.js App Router application in TypeScript. Server route handlers/actions own authentication, provider secrets, validation, and integration calls. Browser code owns UI and the Daily call connection; it never receives a provider API key or a database service-role credential.

Supabase supplies Postgres, Auth, and private media storage. GitHub sign-in establishes personal identity. Linear OAuth connects a workspace to a Shiproom team; Shiproom membership remains explicit. Use a GitHub App with selected-repository read permissions for shared private repository access. Public demo repositories can be a documented early fallback.

Daily carries audio/video/screen share. Deepgram Nova-3 is the selected transcription model for live calls and uploaded audio; Daily's integrated Deepgram route is the first live path to verify, while uploads use Deepgram directly. Both normalize into the same transcript contract. Read the shared [vocabulary catalog and usage guide](transcription-vocabulary.md) when constructing provider requests; choose a relevant bounded subset and confirm live hint forwarding instead of hardcoding separate lists. A bounded OpenAI Responses API extraction step produces schema-constrained JSON; deterministic server code validates it and calls Linear. A model does not receive arbitrary tool authority.

Inngest runs durable post-call steps through Next.js routes. No always-on media bot, custom WebRTC server, or separate agent runtime is required. Its retries still require duplicate-safe external writes. See [Integrations](integrations.md) for official references and prerequisites.

## Callback paths to implement

These paths are reserved for provider configuration; no route exists yet. Register exact origins/paths, and update this contract and provider settings together if changed:

- `/auth/callback`: Next.js Supabase PKCE session exchange. GitHub's OAuth callback instead points to `https://<project-ref>.supabase.co/auth/v1/callback`.
- `/api/integrations/linear/callback`: server Linear OAuth code exchange and state verification.
- `/api/webhooks/daily`: signed Daily handshake and event ingestion.
- `/api/webhooks/deepgram`: upload result ingestion with persisted per-attempt authentication/correlation.
- `/api/inngest`: SDK serve endpoint for durable functions; use the SDK's supported methods and signing verification.

See [Setup](setup.md) for local and deployed registration order. Endpoints must reject invalid input/authorization; do not implement placeholder successful webhook responses.

## Remaining implementation constraints

Binding for the first scaffold and later lanes. Provisioning facts live in [Setup](setup.md); do not treat that checklist as implemented product behavior.

- **No schema yet.** There are no tables, RLS policies, or storage policies. Identity lane writes checked-in migrations from the model below. Do not invent dashboard tables or grant blanket authenticated storage access. Bucket `shiproom-audio` exists with size/MIME limits only.
- **Reserved routes must fail closed.** Implement the callback paths as real handlers that reject invalid input and unauthorized callers. Do not register Daily, Deepgram, or Inngest webhooks, and do not acknowledge provider events as success, until signature verification exists on an HTTPS origin.
- **GitHub login ≠ repository access.** Login OAuth is already configured in Supabase. `GITHUB_APP_*` is unset; the documented demo fallback is public `WeebPapi/shiproom`. Do not request the broad `repo` scope.
- **Linear destination is not ARCI.** App OAuth (`read,issues:create`) and the dedicated **Shiproom** workspace do not exist yet. The connected Linear MCP/workspace is ARCI and must not be used for issues, teams, or projects.
- **Uniqueness is not write-safety.** A database unique constraint does not make Linear issue creation idempotent. Persist UUID v4 issue IDs before the external write; reconcile on retry. See [External-write safety](#external-write-safety).
- **Service role bypasses RLS.** Every team, meeting, context, upload, and notification operation still needs an explicit server-side authorization check. Browser code never receives provider API keys or `service_role`.
- **Do not deploy docs-only.** Use the existing Vercel project after the scaffold is buildable. Do not create a second Vercel or Supabase project. Region is already Tokyo; do not recreate the project to chase Frankfurt.
- **Live/upload/extraction/Inngest are later lanes.** The skeleton owns identity, membership, shared contracts, and honest pending states. Media, transcription, extraction, and issue publication are out of skeleton scope.

## Suggested code layout

Create only the directories used by the first slice:

```text
src/app/                 pages, route handlers, server actions
src/components/          app shell, context dialog, meeting/result UI
src/lib/contracts.ts     shared validation schemas and derived TS types
src/lib/server/          auth, database and provider operations (server-only)
src/inngest/             client and meeting-processing function
supabase/migrations/     checked-in SQL schema, constraints and access policies
```

Keep one validation schema per boundary and infer its TypeScript type. Do not duplicate hand-written API types in four workstreams or add a generic provider/plugin framework.

## Minimum persisted model

Use provider IDs in their native string form; app row IDs and preallocated Linear issue IDs are UUIDs. Every team-owned row includes `teamId` or is reachable through an enforced team foreign key. Timestamps are UTC instants; scheduling also retains the IANA display timezone.

- **Profile:** auth user ID, GitHub numeric user ID/login, display name, verified email where available. Ask for email verification if the provider supplies no verified email.
- **Team / Membership / Invitation:** team name, connected Linear organization ID; user role (`owner` or `member`); invitation token hash, intended verified email, expiry, accepted/revoked status. Owner can invite members or revoke access. Never use email-domain auto-join.
- **Connection:** team/provider, authorized external workspace or installation, encrypted credentials and refresh metadata where required, owner-approved repo/team allowlist, connection health. Provider secrets are server-readable only.
- **Meeting:** organizer, kind (`scheduled`, `huddle`, `upload`), title/agenda, invited member IDs, schedule/timezone, selected transcription language (`en` or `ka`), context and its revision, provider room/session IDs, capture status, processing status, summary/decisions/open questions, errors.
- **MeetingParticipant:** meeting/user, consent time, first joined/last left, provider participant mapping. One logical participant survives rejoin; use verified provider join events, not a client-supplied attendee list. For upload, organizer explicitly records eligible team attendees; mark provenance as organizer-supplied.
- **Transcript:** meeting/revision, source, storage reference/provider transcript ID, normalized segment JSON, completeness, content hash. Retain revisions; publication references a fixed revision.
- **Task:** app task ID, meeting/transcript revision, ordinal, extraction payload/evidence, preallocated Linear UUID, publication status/error, returned issue identifier/URL. Unique `(meetingId, transcriptRevision, ordinal)` and unique Linear UUID.
- **Notification:** recipient, meeting, kind (`task_ready` or `context_required`), nullable task/Linear URL, title, read timestamp. Unique `(recipientId, taskId)` for task links and `(recipientId, meetingId, kind)` for the organizer context prompt; recipient access only. Resolve the prompt when valid context is supplied.
- **ProcessingRequest / ProviderEvent:** durable run/version and dispatch state, error/stage; deduplication keys and minimal verified webhook payloads. These can be simple tables, not a new queue framework.

Enforce tenant and relationship constraints in migrations. Apply row-level security to browser-accessible data and private storage; keep connection credentials out of exposed schemas. Server service-role operations must perform explicit membership checks because they bypass RLS. Jobs recheck the team's connection and authorization before reading sources or writing issues.

Initial access policy: current members may see and join their team's meetings and read their results; there are no private-within-team meetings in this version. Invitations identify expected attendees; actual attendance determines result notifications. Only the organizer can end-for-everyone, change meeting context, or resume processing. Team owners manage memberships/connections. Membership revocation blocks future reads and token issuance; also remove active room access when revoking a participant. Results and source context are shared only within the owner's explicitly approved team/repository boundary.

## Context contract

Each meeting stores a `contextMode` (`selected`, `infer`, or `mixed`) and nullable `githubRepositoryId`, `linearTeamId`, `linearProjectId`, with field-level provenance (`user` or `inferred`) and supporting transcript segment IDs for inferred fields. GitHub repository ID must resolve to the allowlist's current owner/name. Project must belong to the connected workspace and be associated with the chosen Linear team; do not assume a project belongs to only one team.

Before publication all three destination fields must resolve. If repository context is intentionally irrelevant, that needs a product decision; do not silently drop it. A manually chosen destination wins over inference. Inference candidates come only from server-fetched authorized lists; the model cannot introduce IDs or URLs. Fetch deeper context only after resolution. Conflicting or ambiguous references produce `needs_context` and a persisted organizer inbox prompt. Completing this prompt is not an approval of generated tickets.

Freeze resolved context and transcript revision when publication begins. A later correction does not silently move or overwrite created issues. The first version supports one immutable publication batch per meeting; reanalysis after publication is deferred to avoid republishing the same work under new task IDs.

## Transcript contract

```json
{
  "meetingId": "app-meeting-uuid",
  "revision": 1,
  "source": "daily",
  "complete": true,
  "language": "en",
  "segments": [
    {
      "id": "seg-0001",
      "startMs": 1200,
      "endMs": 4600,
      "speakerUserId": null,
      "speakerLabel": "Speaker 1",
      "text": "Let's add a loading state and an empty state to the repository picker."
    }
  ]
}
```

`source` is `daily` or `upload`. IDs and example speech above are illustrative. Segment times are finite, nonnegative milliseconds with `endMs >= startMs`; segment IDs are stable within a revision. Unknown speakers stay unknown; diarization labels do not prove user identity. Only finalized text enters extraction. Validate content size, duration, nonempty speech, and completeness before proceeding. Zero speech is a visible no-action result. Known capture gaps block automatic publication and offer a replacement upload rather than implying a complete record.

The example's `en` is not a fixed language: persist the actual selected/recognized language and retain Georgian text as UTF-8. Configure the provider explicitly for Georgian (`ka` for Deepgram Nova-3); do not silently use its English default or assume multilingual auto-detection includes Georgian. Preserve the original transcript/evidence even if an issue description is translated. Georgian-English developer speech needs its own sample check. Provider language rejection is a visible recoverable failure, not a reason to relabel English output as Georgian.

Daily live transcript events are optional captions, not the authoritative artifact. Enable provider transcript storage, verify the final artifact via the server, and normalize it once. End-of-call and transcript-ready can arrive out of order. Wait with bounded backoff for the finished artifact; timeout leaves a recoverable capture error. Never lose remote participants' speech by recording only the organizer microphone as a supposed fallback.

## Extraction contract and source grounding

Persist one validated extraction result before any issue writes. It contains `summary`, `decisions`, `openQuestions`, and `tasks`. Each task contains `title` (without prefix), `description`, `acceptanceCriteria` (array), `evidenceSegmentIds` (nonempty array), optional `assigneeUserId`, optional `existingLinearIssueId`, and validated source references. Arrays can be empty except task evidence. Limit the demo to ten tasks per meeting; exceeding the limit blocks publication with a visible recoverable error rather than silently discarding work.

The server must verify every evidence ID exists, every cited URL/issue/file came from fetched source data, and every assignee belongs to the chosen Linear team. A format-valid answer can still be semantically wrong: the prompt and validation must distinguish commitments from proposals/rejections and detect duplicate tasks. Do not invent acceptance criteria from plausible implementation ideas. Store unsupported or ambiguous work as an open question. Existing tracked work is linked in results, not recreated.

Source loading is intentionally bounded: selected repo metadata/README, up to 20 recent PR summaries, up to 20 open GitHub issue summaries, and up to 30 relevant Linear project issues. Explicitly referenced files may be read with a small size cap. Enforce a combined text budget (initial default 60,000 characters excluding transcript), disclose truncation in processing metadata, and never clone/index an entire repo for the demo. Pin file references to fetched commit SHAs when citing code. Do not fetch arbitrary URLs from transcripts or model output.

Treat transcript/repository/issue text as untrusted data, including instructions embedded in it. The extraction prompt defines the task outside these data blocks. Only allowlisted deterministic code can fetch context or publish issues. Validate/escape rendered Markdown and permit safe external URL schemes.

## Workflow and lifecycle

Capture and processing have separate states so a call ending does not imply a transcript is ready:

```text
capture: pending -> live -> finalizing -> ready | failed
upload:  pending -> uploading -> transcribing -> ready | failed

processing: waiting_transcript -> resolving_context -> enriching -> extracting
                        resolving_context -> needs_context -> resolving_context
extracting -> publishing -> complete | partial_failure
extracting -> complete (zero actions)
any processing step -> failed (with stored stage and safe resume path)
```

1. Authorize and validate meeting creation, record context/attendees, provision a private room, and issue short-lived room-scoped tokens only to admitted members who consented. Provider owner/admin rights belong only to the organizer.
2. Verify webhook signatures and replay age. Persist/deduplicate real events before acknowledging them; handle the provider's signed verification handshake promptly. Map provider room/session to the stored meeting. An event cannot nominate an arbitrary team.
3. A verified meeting end/transcript-ready event or authorized upload completion persists a processing request before dispatch to Inngest. Give dispatch a stable event ID. A small scheduled recovery sweep redispatches pending requests after transient enqueue failures; a resume button is a second recovery path. Do not fire-and-forget work in a serverless handler.
4. Fetch and normalize the authoritative transcript, resolve context, enrich, and extract in bounded durable steps. When context is missing, persist `needs_context` and finish that run; organizer submission dispatches a new run for the same transcript revision. Do not keep an HTTP request open waiting for the organizer.
5. Under per-meeting concurrency protection, persist the frozen task batch and each random UUID v4 intended for Linear before starting publication. Retries load that batch; they do not regenerate model output or task IDs.
6. Publish each task independently; persist success and notification entries. A failed task does not roll back/delete successful external issues. Result state is complete only when all intended effects are settled; retry incomplete effects only.

Use atomic state transitions/unique constraints to prevent overlapping runs. Recovery of expired work leases must reuse the existing batch. Reopening a result page is read-only and must not start a new extraction/publication batch.

## External-write safety

Linear's issue-create input accepts a caller-supplied UUID v4; see the [current SDK schema](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql). Send each task's persisted Linear UUID on every attempt. After a timeout or duplicate-ID error, read that exact issue ID and reconcile its team, project, and Shiproom task marker before recording success. If the read is inconclusive, retain an unresolved status; never allocate another ID to “fix” the retry. Verify this behavior with the real demo workspace before relying on it.

Descriptions include a stable Shiproom task marker in addition to human-readable source links. Prefix titles server-side exactly once. Database notification inserts use upsert/uniqueness. If issue creation succeeds but notification persistence fails, resume notification delivery from the stored issue or reconciled ID without recreating it. Retry rate limits using provider retry guidance; surface revoked credentials as reconnect-required, not infinite retries.

## Route/action ownership

Exact file paths become authoritative once implemented; keep these operation boundaries:

- Auth callback/session, team create/invite/accept/revoke, connect/disconnect Linear/GitHub: identity lane.
- Authorized context-option reads and meeting create/schedule/context-update/read: identity lane provides shared schemas; UI consumes them.
- Room token/end, upload authorization/completion, Daily webhook: media lane.
- Processing dispatch/resume and `/api/inngest`: workflow lane. Publicly reachable job routes still verify provider signatures; resume is organizer-only.
- Meeting result and inbox reads/read-state updates: UI lane; server filters by membership/participation/recipient.

Require CSRF/origin protections for cookie-authenticated mutations, OAuth state verification, explicit redirect allowlists, server-side input schemas, and bounded provider timeouts. Validate file identity/ownership/type/size server-side and upload directly to private storage using short-lived scoped authorization. Do not proxy large files through Next.js request bodies.

Default upload bound: 25 MB and 15 minutes, supported audio types only; no arbitrary URL import. Use the private Supabase bucket `shiproom-audio`; the initial MIME allowlist is in [Setup](setup.md). Check actual media metadata, not just browser hints. Keep raw media private, show capture/transcription consent, support deleting meeting artifacts, and delete temporary upload objects after successful normalization. Provider artifact retention/deletion must also be addressed in implementation. Until cleanup exists, use synthetic demo data only and record the limitation visibly.
