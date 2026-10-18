# Product specification

Status: target behavior, not implemented. User requirements were clarified on 2026-10-17. Engineering limits and defaults are identified in [Decisions](decisions.md).

**2026-10-18 demo clarification:** Georgian speech is now the recording priority, with vocabulary hints and speaker diarization. Generate notes and tickets in English, keep the original Georgian transcript and evidence, and deliver notes/transcript alongside issue links in-app. This supersedes the English-first priority below (D16); the original broader acceptance criteria still apply. Implementation and live verification are tracked separately in [Demo checks](demo.md).

## Vision

Shiproom is an AI-native meeting space for developer teams, available in a browser with no download. A calm, straightforward interface inspired by Linear connects conversation to the project's lifecycle. Developers can form a team, connect GitHub identities and email addresses, connect Linear, schedule a call, or start a huddle. Calls have useful project context and familiar microphone, camera, and screen-sharing controls.

The core value is moving agreed work into the team's existing tools with its reasoning intact. A summary alone is insufficient. The initial app reads GitHub, creates Linear issues, and gives participants links to review and edit in Linear.

Linear is the central project/work connector. Shiproom still owns membership, meeting access, transcripts, and delivery state. Neither a shared email domain nor the ability to log in with GitHub grants team membership.

## Scope for 24 hours

**Filming-only exception (D19):** authenticated `/demo` meetings deliberately use a fixed synthetic Georgian transcript and task batch regardless of speech, then create real Linear issues. The route and resulting issue descriptions disclose this. Ordinary calls retain their existing behavior; scripted recordings do not satisfy live transcription or AC9. See the [filming runbook](demo.md).

Deliver one planning workflow with two entry paths, S1 and S2 below. The live-call path is preferred; upload is a deliberately supported fallback. Target desktop Chrome/Edge first, four authenticated participants, English and preferably Georgian speech, one Linear workspace per Shiproom team, and one GitHub repo plus one Linear team/project per meeting. **Georgian demo priority** (2026-10-18 clarification): Georgian is the default transcription language; English remains selectable. Generated notes and tickets use English while source transcript/evidence stays in its original language. Verify speaker separation and Georgian quality before recording. Other limits are engineering defaults, not permanent product limits.

Required scope:

- GitHub sign-in, a verified/contactable email identity, team creation, and joining by an owner-authorized invitation. Link Linear and restrict context choices to authorized sources.
- Team home with upcoming calls, quick huddle, meeting history, and inbox. Shared context modal before both scheduling and starting a huddle.
- In-app calendar, date/time/timezone booking, shareable authenticated join link, and downloadable `.ics` invite. A schedule does not require every participant to stay online.
- Live calls with mic/camera toggles, device selection, screen sharing, participant list, leave, and organizer end-for-everyone. Visible transcription status and consent before capture.
- Durable transcript, context resolution, extraction of agreed action items, automatic `[shiproom]` Linear issue creation, and in-app delivery to actual participants.
- Uploading audio into the same workflow; useful error/empty/partial-success states; retries that do not create duplicate issues.
- After a new Linear issue is created, delegate it to the Cursor Linear agent and show live PR progress on the meeting result. Cursor targets the meeting’s selected GitHub repository, or `CURSOR_PR_REPO` when none is selected (scripted `/demo`). Shiproom does not call GitHub's PR API.

Deferred: Google/Outlook calendar sync, email delivery, guest/anonymous access, recurring meetings, mobile polish, global code indexing, Shiproom-owned GitHub writes or code generation, manual two-way issue editing/synchronization in Shiproom (meeting-driven amendments are included), a speaking voice agent, and Meet internals reconstruction. Do not build these during the hackathon. Cursor Cloud Agent PRs are in scope (D20).

## S1: planning with selected context

1. Organizer opens **Schedule call** or **Start huddle**.
2. A shared modal offers title/agenda, attendees, transcription language (Georgian by default, or English), Linear team, project filtered by team, and GitHub repository from connected sources. Scheduling also asks for start/end and timezone. Show loading, disconnected, empty, and permission-denied states in selectors.
3. Organizer selects context or explicitly chooses **Let Shiproom figure it out** for either missing field. Show that agreed tasks will create issues automatically after the call and that participants receive in-app links.
4. Participants authenticate, accept transcription notice, and join. Present selected context and links alongside the call; GitHub information is read-only.
5. Team agrees concrete work. Organizer ends the call; processing continues even if every browser closes.
6. Shiproom saves the final transcript, loads bounded project/repo context, extracts grounded action items, and creates issues. No pre-publication review gate.
7. English meeting notes, decisions, open questions, the original speaker-labelled transcript, and successful issue links appear in the meeting result. Each participant can open the recap from their inbox, including when there are zero tasks. Participants follow issue links and edit in Linear. Display partial failures without hiding successful issues.

## S2: huddle with inferred context

1. Organizer starts a huddle with inference enabled. Missing context does not prevent the call.
2. Agent resolves explicit references in the conversation against the team's allowed repositories and Linear teams/projects. User-selected values take precedence.
3. Resolve only a unique, evidence-backed destination. Similar names, conflicting references, unauthorized destinations, and an insufficiently specific conversation remain unresolved; a model confidence score is not authorization.
4. After the call, organizer receives **Choose meeting context** in the result page and inbox. Show any resolved fields; require only missing/ambiguous values. If offline, keep the task pending until they return.
5. On valid submission, processing resumes from the saved transcript, fetches the selected context, creates issues, and distributes links. Do not rerun transcription or publish into a guessed project.

## UI requirements

Use a restrained Linear-inspired shell: compact sidebar, clear typography, consistent spacing, limited accent color, keyboard-accessible dialogs, and visible focus. Favor a clear primary action per screen. Do not copy Linear branding or proprietary assets.

- **Home/calendar:** upcoming calls in calendar/list view, start huddle, recent meetings as cards (status, date, summary, created Linear issue IDs) that open the meeting's notes, tickets, and transcript, unread inbox. Signed-in users without a team land on the same app shell with an inline create-team form and invitation guidance, not a separate setup page; teams can also be created and switched from the sidebar team menu.
- **Connections/team:** connected status, chosen Linear workspace/team, available repos, members and invitations. Explain reconnect/permission failures.
- **Call:** meeting title, repo/project chips and deep links, agenda, participants, share-first layout, mic/camera/device/share controls, transcription indicator and optional transcript panel. Use provider call controls first; custom controls must preserve their behavior and accessibility.
- **Result:** processing stage, context prompt, decisions, open questions, task evidence, issue URLs, per-task errors, and safe resume action.
- **Upload:** explicitly labeled alternative to live capture, file validation, selected meeting/context/attendees, progress, and result.

Do not show technical provider/job details in the normal product flow. Display an actionable error plus a support/debug identifier when needed.

## Issue and notification behavior

New issue titles begin with the exact prefix `[shiproom] `. Descriptions contain the agreed task, acceptance criteria supported by discussion, repo/project links, transcript segment references with timestamps, and an authenticated meeting-result link. Agreed refinements to one unambiguous existing issue append English requirements/acceptance criteria and evidence while preserving its current text/title/status/assignee. Result rows distinguish **Created** and **Updated**, and both actions send participant inbox links. Existing issues merely mentioned or already-tracked work do not require another action. Ambiguous matches and unsupported field changes become open questions, never substitute tickets. Brainstorming, rejected ideas, open questions, and statements such as “maybe later” are not commitments.

Assign only when the discussion explicitly names an owner and the server can map that person to an eligible Linear member. Otherwise leave unassigned. Never invent deadlines, estimates, owners, or technical implementation details. A call can legitimately produce zero tasks.

Persist one inbox entry per participant per created task immediately after the successful external write is recorded. Include title, Linear URL, meeting link, and unread state. Polling while the app is open is sufficient for the demo; offline participants see persisted notifications on return. “Immediate” means after successful processing, not at the moment speech ends. Invitees who never joined do not receive call results automatically.

## Acceptance criteria

- **AC1:** four authenticated teammates can join one web call; two independent devices prove bidirectional audio, camera, mute, screen share, leave, and organizer end.
- **AC2:** selected context comes from real connections, persists through refresh, and is used for issue destination and source context. Cross-team IDs and invalid team/project combinations are rejected server-side.
- **AC3:** scheduling stores an absolute time and displays the intended timezone. The `.ics` imports with the correct time and Shiproom link; huddles skip scheduling.
- **AC4:** S1 creates real `[shiproom]` Linear issues with transcript evidence and no GitHub mutations. Every actual participant, including early leavers, gets in-app links.
- **AC5:** S2 either resolves an authorized unique destination or blocks all issue creation and prompts the organizer. Supplying missing context resumes the same pipeline.
- **AC6:** uploaded audio reaches the same extraction/publication behavior as live capture. Capture failure never becomes a fabricated or silently incomplete transcript.
- **AC7:** refreshing results, duplicate events, and retrying after an external timeout do not duplicate issues or notifications. Partial success remains visible and recoverable.
- **AC8:** empty/no-action conversations create no tickets; invalid model output creates none; rejected ideas are not published. Unauthorized users cannot read meetings, media, source context, or inbox entries.
- **AC9 (Georgian recording gate):** a native-speaker-reviewed Georgian planning sample, including English developer terms and a rejected idea, preserves agreed work, negation, names, repo/project references, and source timestamps through transcription and issue extraction. Check live and upload separately; passing upload does not prove live support. Preserve original Georgian transcript/evidence. Disclose any Georgian limitation if its gate fails; UI localization and unrestricted bilingual code-switching are not implied.

See [Delivery](delivery.md) for the verification procedure and explicit fallback gates. These checks define the reliability bar for the demo.
