# Product specification

Status: target behavior, not implemented. User requirements were clarified on 2026-10-17. Engineering limits and defaults are identified in [Decisions](decisions.md).

## Vision

Shiproom is an AI-native meeting space for developer teams, available in a browser with no download. A calm, straightforward interface inspired by Linear connects conversation to the project's lifecycle. Developers can form a team, connect GitHub identities and email addresses, connect Linear, schedule a call, or start a huddle. Calls have useful project context and familiar microphone, camera, and screen-sharing controls.

The core value is moving agreed work into the team's existing tools with its reasoning intact. A summary alone is insufficient. The initial app reads GitHub, creates Linear issues, and gives participants links to review and edit in Linear.

Linear is the central project/work connector. Shiproom still owns membership, meeting access, transcripts, and delivery state. Neither a shared email domain nor the ability to log in with GitHub grants team membership.

## Scope for 24 hours

Deliver one planning workflow with two entry paths, S1 and S2 below. The live-call path is preferred; upload is a deliberately supported fallback. Target desktop Chrome/Edge first, four authenticated participants, English demo speech, one Linear workspace per Shiproom team, and one GitHub repo plus one Linear team/project per meeting. These are engineering limits, not permanent product limits.

Required scope:

- GitHub sign-in, a verified/contactable email identity, team creation, and joining by an owner-authorized invitation. Link Linear and restrict context choices to authorized sources.
- Team home with upcoming calls, quick huddle, meeting history, and inbox. Shared context modal before both scheduling and starting a huddle.
- In-app calendar, date/time/timezone booking, shareable authenticated join link, and downloadable `.ics` invite. A schedule does not require every participant to stay online.
- Live calls with mic/camera toggles, device selection, screen sharing, participant list, leave, and organizer end-for-everyone. Visible transcription status and consent before capture.
- Durable transcript, context resolution, extraction of agreed action items, automatic `[shiproom]` Linear issue creation, and in-app delivery to actual participants.
- Uploading audio into the same workflow; useful error/empty/partial-success states; retries that do not create duplicate issues.

Deferred: Google/Outlook calendar sync, email delivery, guest/anonymous access, recurring meetings, mobile polish, global code indexing, autonomous code/PR creation, GitHub writes, two-way issue editing in Shiproom, a speaking voice agent, and Meet internals reconstruction. Do not build these during the hackathon.

## S1: planning with selected context

1. Organizer opens **Schedule call** or **Start huddle**.
2. A shared modal offers title/agenda, attendees, Linear team, project filtered by team, and GitHub repository from connected sources. Scheduling also asks for start/end and timezone. Show loading, disconnected, empty, and permission-denied states in selectors.
3. Organizer selects context or explicitly chooses **Let Shiproom figure it out** for either missing field. Show that agreed tasks will create issues automatically after the call and that participants receive in-app links.
4. Participants authenticate, accept transcription notice, and join. Present selected context and links alongside the call; GitHub information is read-only.
5. Team agrees concrete work. Organizer ends the call; processing continues even if every browser closes.
6. Shiproom saves the final transcript, loads bounded project/repo context, extracts grounded action items, and creates issues. No pre-publication review gate.
7. Each successful issue appears in the meeting result and every actual participant's inbox. Participants follow links and edit in Linear. Display partial failures without hiding successful issues.

## S2: huddle with inferred context

1. Organizer starts a huddle with inference enabled. Missing context does not prevent the call.
2. Agent resolves explicit references in the conversation against the team's allowed repositories and Linear teams/projects. User-selected values take precedence.
3. Resolve only a unique, evidence-backed destination. Similar names, conflicting references, unauthorized destinations, and an insufficiently specific conversation remain unresolved; a model confidence score is not authorization.
4. After the call, organizer receives **Choose meeting context** in the result page and inbox. Show any resolved fields; require only missing/ambiguous values. If offline, keep the task pending until they return.
5. On valid submission, processing resumes from the saved transcript, fetches the selected context, creates issues, and distributes links. Do not rerun transcription or publish into a guessed project.

## UI requirements

Use a restrained Linear-inspired shell: compact sidebar, clear typography, consistent spacing, limited accent color, keyboard-accessible dialogs, and visible focus. Favor a clear primary action per screen. Do not copy Linear branding or proprietary assets.

- **Home/calendar:** upcoming calls in calendar/list view, start huddle, recent meetings, unread inbox.
- **Connections/team:** connected status, chosen Linear workspace/team, available repos, members and invitations. Explain reconnect/permission failures.
- **Call:** meeting title, repo/project chips and deep links, agenda, participants, share-first layout, mic/camera/device/share controls, transcription indicator and optional transcript panel. Use provider call controls first; custom controls must preserve their behavior and accessibility.
- **Result:** processing stage, context prompt, decisions, open questions, task evidence, issue URLs, per-task errors, and safe resume action.
- **Upload:** explicitly labeled alternative to live capture, file validation, selected meeting/context/attendees, progress, and result.

Do not show technical provider/job details in the normal product flow. Display an actionable error plus a support/debug identifier when needed.

## Issue and notification behavior

Issue titles begin with the exact prefix `[shiproom] `. Descriptions contain the agreed task, acceptance criteria supported by discussion, repo/project links, transcript segment references with timestamps, and an authenticated meeting-result link. Existing issues may be referenced; do not create a duplicate for work already tracked. Brainstorming, rejected ideas, open questions, and statements such as “maybe later” are not commitments.

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

See [Delivery](delivery.md) for the verification procedure and explicit fallback gates. These checks define the reliability bar for the demo.
