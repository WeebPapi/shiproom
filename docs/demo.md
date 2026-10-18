# Recording rehearsal

This is the selected-context live slice, not completion of every product acceptance criterion. The user prioritizes Georgian meetings, English output, and live providers wherever possible. Use synthetic discussion only while retention/deletion is unfinished.

## Ready to rehearse

GitHub sign-in, public repo approval, the selected Linear team/project picker, and saved context are verified in the local browser. The prepared meeting is **Repository picker planning** in the app team **Shiproom Demo**, with Georgian selected and `WeebPapi/shiproom` approved. The destination is the Shiproom team in the `localloop` Linear workspace and its dedicated [Shiproom Demo project](https://linear.app/localloop/project/shiproom-demo-c2b57828bc39). ARCI is not used.

Daily accepted the Nova-3/Georgian room settings and vocabulary/diarization options. Direct Deepgram accepted those options on a silent WAV probe. Live Claude extracted English tasks from synthetic Georgian text and did not create a task for rejected private-repository work. These initial capture/configuration checks did not capture microphone speech. A later live edit check created and amended the synthetic demo issue described below. Automated processing tests use provider fakes, not live integration proof.

Browser checks confirmed an inbox recap for a zero-task synthetic meeting, English notes, and an expandable original Georgian transcript with two speaker labels/timestamps. The temporary fixture was removed afterward; the prepared live meeting remains unstarted. Verification: 52 tests, typecheck, lint, production build, and `git diff --check` passed on Node 22.13.1; the Node 24 target was not exercised.

## Seeded past meetings

`node --env-file=.env.local scripts/seed-demo.mjs` adds three completed meetings to the demo app team so Home shows result cards: *Sprint planning: inbox notifications* (SHI-2, SHI-3), *Bug triage: Georgian transcript display* (SHI-4 to SHI-6), and *Design review: audio upload flow* (SHI-7, SHI-8). Each has a synthetic Georgian transcript with three fictional speakers, English notes, and real issues in the Shiproom Demo project, plus unread inbox notifications for the team owner. They were written by hand, not produced by a call or Claude; each Linear issue says so. Use them to show history and results, not as live-capture evidence. Rerunning the script updates the same rows and issues.

## Cursor draft PRs

A newly created Linear issue is delegated to the Cursor agent in the connected workspace. Ordinary meetings tell Cursor backtick-wrapped `` `[repo=]` `` the selected GitHub repository. Scripted `/demo` meetings have no repo, so they use `CURSOR_PR_REPO` ([WeebPapi/acme-repo-picker](https://github.com/WeebPapi/acme-repo-picker)). Issue text also includes backtick-wrapped `` `[model=cursor-grok-4.6-high-fast]` `` so Linear markdown does not escape the tags, and because Linear-triggered Cloud Agents ignore the dashboard default. The meeting result shows assigned/building/needs-input/error/PR from Linear agent sessions and GitHub attachments, and refreshes every ten seconds until a PR URL appears. This takes minutes, not seconds. Shiproom does not open the PR. Cursor must stay installed on the Linear team, Cloud Agents need GitHub access to that repo plus billing, and first use may ask someone to link Cursor↔Linear. Issues created with the server Linear API token do not start a Cloud Agent until a linked human comments from the Linear UI; API @mentions stay pending then stale. Amendments to existing issues are not auto-delegated.

## Human live check

1. Open the prepared meeting. Confirm Georgian, the public repository, and Shiproom Demo project. Accept transcription and click **Start call**. Join Daily with your microphone. Wait for transcription to start; a partial-microphone fallback is not a passed capture check.
2. Have two speakers participate, preferably each using a separate device/headset and authenticated team membership. Each must accept transcription. Discuss the following synthetic commitments naturally in Georgian, with English developer terms as you normally use them:

   > შევთანხმდით, რომ repository picker-ს დავამატოთ loading და empty state. სანამ რეპოზიტორიები იტვირთება, ვაჩვენოთ loading indicator. თუ რეპოზიტორიები არ არის, ვაჩვენოთ ცარიელი მდგომარეობის შეტყობინება. Private repository ამ ეტაპზე არ გვჭირდება და ამაზე თიქეთი არ შევქმნათ.

3. Organizer clicks **End and send to Linear**. Keep the page open during this synchronous processing request. It creates or updates real issues in the dedicated demo project. If Daily's file is still finalizing, **Retry processing** retrieves it again; partial captions or local microphone capture never create issues.
4. Verify the original Georgian transcript, speaker labels, and timestamps. Review negation and technical terms as a native speaker. English notes must contain the summary, decisions, and open questions; English tickets must match only agreed work and link to original evidence.
5. Follow each Linear link: verify the team/project, `[shiproom]` prefix, acceptance criteria, Georgian evidence, source repo, and authenticated meeting link. Open **Inbox** as each participant, including an early leaver: a meeting recap links to notes/transcript/issues, and created tasks have separate unread notifications. Refresh the result to check persistence. A visible inbox refreshes every ten seconds.

## Still unverified or missing

The live call has **not been completed**. Georgian speech accuracy, Daily forwarding of hints/diarization during actual capture, stored speaker separation, publication from an actual call, and multi-user delivery remain rehearsal gates. A single speaker cannot verify diarization. Daily's stored WebVTT may preserve participant labels rather than multiple acoustic voices sharing one microphone; verify that case explicitly before claiming it.

Attendance is currently recorded when a call token is issued. Recaps persist through the underlying meeting/participant records but have no separate read state. Processing is synchronous; background completion, action batches and partial publication can be retried without rerunning the model; concurrency leases and durable notification recovery remain unfinished. Inferred-context recovery, upload fallback, `.ics`/calendar, private GitHub access, webhooks, retention cleanup, and deployment remain separate steps. Do not demonstrate these as live capabilities yet.

## Existing-ticket edit demonstration

The synthetic [SHI-1 seed](https://linear.app/localloop/issue/SHI-1/shiproom-demo-seed-repository-picker-loading-state) already contains loading/empty-state requirements and an exact empty-message requirement. A live Claude extraction from synthetic Georgian selected that existing ticket, Linear appended the agreed English amendment with Georgian evidence, and a repeated request added no duplicate amendment. Its original text and title were preserved. This was a provider integration check, not a recorded call; the issue says so.

For the live rehearsal, discuss a **new** refinement instead of repeating already-tracked requirements. For example:

> ???????????, ??? SHI-1 ?????? ????????? ????????: ??????? ???? ???????????? ???? ????????? ?????? Refresh repositories. ???????? ?????????? ???????????? ?? ????? ?????? ?? ????????. Private repository ?? ?????? ?? ?????????.

After processing, expect **Updated** beside SHI-1 and an inbox link to that same issue, plus notes/transcript. A mere mention of SHI-1, an already-tracked requirement, or an ambiguous target should not produce a new ticket. The first slice adds requirements/acceptance criteria; title/status/assignee changes are not implemented. OAuth connections need `read,write` and must reconnect if they previously granted only issue creation. Avoid editing the issue simultaneously while the meeting update runs: Linear has no atomic description append/CAS.

Checks for this slice: 62 automated tests, typecheck and lint passed. Provider checks used the personal key bound to the dedicated demo app team; OAuth onboarding and the live microphone call remain unverified.

Production build and whitespace checks also passed. The final browser automation check was blocked by preview snapshot/evaluate timeouts; the alternate browser surface was unavailable. The local app returned HTTP 200. The Created/Updated result label has code/type coverage but was not visually verified in this round.

## Scripted filming demo (`/demo`)

`/demo` is a recording shortcut, separate from live transcription quality. It starts a real Daily huddle, then saves the same synthetic Georgian transcript and publishes the same two fixed tasks regardless of speech (including silence). It never calls speech recognition, Deepgram, or Claude. Page notices and Linear descriptions disclose the scripted input. It does not pass the Georgian acceptance gate AC9.

### Before recording

1. Apply `supabase/migrations/20261018090000_scripted_demo.sql` to the app's database after the earlier migrations. This adds a server-owned meeting demo flag and the `demo` transcript source. Existing meetings default to normal mode. Browser roles cannot insert or update the flag.
2. Use the existing server configuration: Supabase public configuration, a working `SUPABASE_SERVICE_ROLE_KEY`, `DAILY_API_KEY`, and `LINEAR_API_KEY`. No transcription/model key is needed. Normal sign-in, membership checks, and organizer-only publication still apply. The take publishes through the chosen app team's own Linear access, so choose **Shiproom Demo** (the `LINEAR_DEMO_TEAM_ID` team) or a team with Linear OAuth; that access must see exactly one Shiproom-named project, or one Shiproom team. Use a dedicated Shiproom demo destination; ambiguous destinations block creation. Do not use the unrelated connected Linear MCP workspace for this flow.
3. Sign in, open `/demo`, choose your Shiproom team, and click **Prepare demo huddle** before filming. Save the resulting `/demo?teamId=…&meetingId=…` URL for the take. Preparation creates the meeting; ending it creates real issues.
4. Check the consent box. Keep the camera/microphone ready and rehearse once. API latency and media permissions can extend the take beyond 30 seconds; the demo does not fake provider success.

### Thirty-second filming script

| Time | Action and optional narration |
| --- | --- |
| 0–5s | Click **Start huddle**. “We start a quick planning huddle in Shiproom.” |
| 5–18s | Say anything, or: “რეპოზიტორიის არჩევას ჩატვირთვის და ცარიელი მდგომარეობები დავამატოთ. ძებნა მოგვიანებით განვიხილოთ.” |
| 18–24s | Click **End and create tasks**. “Shiproom turns our agreed work into Linear issues.” |
| 24–30s | Show the Georgian transcript, then open a returned Linear issue. “Each task includes the original conversation as evidence.” |

The full fixed 30-second dialogue, summary, and tasks live in [`src/lib/demo.ts`](../src/lib/demo.ts). Scripted speakers Aleksandre (ალექსანდრე, turns 1 and 3) and Nika (ნიკა, turns 2 and 4) agree a loading indicator with disabled selection while loading, plus an empty state directing the owner to Connections. Names are fixed demo labels, not verified speaker identities. Start a new take to persist these labels; existing saved transcripts are not rewritten. Search is explicitly deferred. Exactly these two issues are generated:

- `[shiproom] Add repository picker loading state`
- `[shiproom] Add repository picker empty state`

### Repeat takes and failures

Refresh preserves the demo mode, transcript, and issue links. The fixed transcript is shown above the notes; the regular stored-transcript section is hidden for demo meetings to avoid showing it twice. Live Cursor PR badges also appear on a completed take once Linear reports agent/PR state. **Retry this take** resumes incomplete publication with saved task UUIDs; an already published task is reused. Failed transcript or task-identity persistence blocks the corresponding external writes. Use the same meeting URL to recover after a timeout. **New take** creates a separate meeting and, when ended, another pair of real issues; clean up unwanted rehearsal issues manually in Linear. Nothing is deleted automatically.

This shortcut does not add background jobs, context inference, or Georgian speech recognition. Normal meetings continue through the existing capture/extraction path. Live media, provider latency, and real Linear publication require a rehearsal in the configured app; mocked tests do not verify them.
