# Recording rehearsal

This is the selected-context live slice, not completion of every product acceptance criterion. The user prioritizes Georgian meetings, English output, and live providers wherever possible. Use synthetic discussion only while retention/deletion is unfinished.

## Ready to rehearse

GitHub sign-in, public repo approval, the selected Linear team/project picker, and saved context are verified in the local browser. The prepared meeting is **Repository picker planning** in the app team **Shiproom Demo**, with Georgian selected and `WeebPapi/shiproom` approved. The destination is the Shiproom team in the `localloop` Linear workspace and its dedicated [Shiproom Demo project](https://linear.app/localloop/project/shiproom-demo-c2b57828bc39). ARCI is not used.

Daily accepted the Nova-3/Georgian room settings and vocabulary/diarization options. Direct Deepgram accepted those options on a silent WAV probe. Live Claude extracted English tasks from synthetic Georgian text and did not create a task for rejected private-repository work. These initial capture/configuration checks did not capture microphone speech. A later live edit check created and amended the synthetic demo issue described below. Automated processing tests use provider fakes, not live integration proof.

Browser checks confirmed an inbox recap for a zero-task synthetic meeting, English notes, and an expandable original Georgian transcript with two speaker labels/timestamps. The temporary fixture was removed afterward; the prepared live meeting remains unstarted. Verification: 52 tests, typecheck, lint, production build, and `git diff --check` passed on Node 22.13.1; the Node 24 target was not exercised.

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
