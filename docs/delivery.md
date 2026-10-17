# 24-hour delivery plan

Status: planning document; all implementation items are unstarted. H0 means the team's agreed build start, not the timestamp of this document. Four developers can own the lanes below and use coding agents within them. Shared contracts and integration verification are collective responsibilities.

## Demo narrative

**S1, selected-context planning (primary):** open the team home, schedule a short planning call with repo/project context, download its calendar invite, and join from independent devices. Discuss adding loading and empty states to a repository picker, explicitly agree the work, and end the call. Show actual `[shiproom]` issues in Linear with evidence and links in participants' Shiproom inboxes. Open an issue in Linear and edit it there. Show the read-only GitHub context that informed the result.

**S2, inferred-context huddle (second path):** start a huddle with context inference. Use a unique repo/project reference for one run; use an ambiguous reference for the recovery demonstration. The second run must pause, prompt the organizer, and resume publication only after valid context is supplied. This reuses the S1 pipeline rather than introducing a separate agent feature.

Prepare a short synthetic recording of the same discussion as the upload fallback. Live and upload runs create separate clearly labeled meetings. Use a dedicated Linear demo project; never publish demo tasks into a real team's active backlog by accident.

## Ownership lanes

- **A — identity and context:** Next.js scaffold, Supabase schema/auth/RLS, membership/invitations, Linear OAuth and context queries, GitHub identity/repository access. Own shared contracts and migration coordination. Deliver authorized dropdown data early; publish connection/setup notes.
- **B — media and capture:** Daily account spike, private room/tokens, browser calling, organizer end, verified attendance/webhooks, stored transcript finalization. Own upload-to-private-storage and Deepgram normalization too, since both must honor one transcript contract. Expose a fixed normalized transcript to C while live capture is being finished.
- **C — processing and Linear publication:** Inngest setup, context inference, bounded source enrichment with A's provider helpers, schema-constrained extraction, frozen task batch, retry-safe issue publication, inbox persistence. Own evidence/empty/error fixtures and processing recovery.
- **D — product UI and demo integration:** Linear-inspired shell, team home/calendar, shared context dialog, `.ics`, call wrapper, result/context-resolution/inbox screens, permission/loading/error states, deployed end-to-end demo. Consume real server contracts; remove temporary UI fixtures before claiming the flow works.

A and C agree provider helpers and credential boundaries; B and C agree transcript readiness and event dispatch; C and D agree result/inbox states. One person edits a given migration/shared-contract/lockfile at a time. Branches should be short-lived; integrate a usable slice early instead of merging four applications at hour 20.

## Gates and scope cuts

### H0-H2: remove prerequisites and freeze contracts

- Assign lane owners and a deployment owner; confirm credentials for Supabase, Daily, Deepgram, Linear, GitHub, Gemini, and Inngest privately.
- Confirm Daily paid transcription/webhook access in hour 1. If unavailable, declare upload the guaranteed capture path immediately.
- B checks a short Georgian sample in the selected Deepgram Nova-3 model, using the [shared vocabulary reference](transcription-vocabulary.md); obtain native-speaker review. Check Daily model/language/keyterm forwarding separately. Record quality, latency, account access, and selected hints before polishing capture. Provider choice is settled; language-list support alone does not pass the quality gate.
- A scaffolds once, commits the lockfile, records actual commands/environment variables, and creates shared schemas from [Architecture](architecture.md).
- Establish real Linear issue creation with a preallocated UUID and read-only GitHub context retrieval. Smoke-test the selected extraction model with synthetic text.
- D establishes the shell/context dialog using the agreed contract; fixtures are visibly labeled temporary. B proves media independently.

### H2-H6: first complete vertical slice

- A provides auth, one real team membership boundary, connection/configuration, and valid context choices.
- B supplies one normalized transcript from uploaded audio; live room and transcript spikes run alongside it.
- C extracts from the transcript and creates real issues in the demo Linear project, then persists participant inbox entries.
- D shows the real result, issue links, upload entry, and missing-context form. Verify a browser refresh preserves output.

Gate: transcript-to-Linear-to-inbox must work with real APIs by H6. If it does not, stop styling and optional call customization until it does.

### H6-H12: make live calling the primary path

- B connects real call end to authoritative stored transcript retrieval and the shared durable workflow. Prove processing continues with browsers closed.
- D adds scheduling/calendar/`.ics`, participant controls, and links into the shared context.
- A completes actual invitation acceptance and OAuth paths; C completes inference/organizer prompt and safe per-task retry.

Gate: by H8, two devices must produce a complete transcript containing both speakers. If capture is unreliable, lock upload as the demo path and label live capture incomplete. Keep a functioning call if useful, but do not pretend its audio is transcribed. By H12, run S1 end-to-end on the deployment.

### H12-H18: reliability and second path

Verify S2, early leavers, stale/missing context, refresh, duplicate webhook delivery, transient provider errors, lost issue-create response, partial failure, and revoked access. Fix the shared cause of failures. Add focused regression checks for behavior that would break the demo or expose team data. Run the full deployment flow with four real participants.

### H18-H24: freeze and rehearse

Freeze new features. Run the acceptance checks below against the deployed build; fix blockers, record remaining limits, and rehearse both a live and upload presentation. Keep a synthetic backup recording and a clean demo Linear project ready. Update [Decisions/status](decisions.md) with commit/deployment evidence. Do not mark a failed integration complete because its mocked version works.

Cut order: custom call layout and animated polish first, extra in-call tools second, automatic inference polish third (keep the explicit organizer recovery), then live capture if its gate fails. Keep upload, real GitHub reads, real Linear writes, in-app delivery, authorization, and duplicate safety. If self-service OAuth/onboarding remains incomplete, document a preconfigured demo-team limitation rather than claiming arbitrary teams can onboard.

## Verification checklist

These are checks to implement/run once code exists, not a claim of current test coverage. Use one small check per distinct risk rather than tests that repeat implementation details.

- [ ] **Access:** team A cannot read/change team B's meetings/context/media; a participant cannot read another recipient's inbox; an expired/wrong-email invite fails; revocation blocks future access.
- [ ] **Context:** selected valid IDs pass, mismatched team/project and unapproved repo IDs fail; unique inference resolves; two similarly named projects prompt the organizer; supplying context resumes the same transcript revision.
- [ ] **Extraction:** agreed picker work yields grounded tasks; “maybe”, “don't do this”, and existing tracked work do not create new issues; no-action speech yields zero; invalid JSON/evidence/owner is rejected.
- [ ] **Publication retry:** persist issue ID, simulate provider success with lost response, retry, and prove one remote issue. Repeated webhook/event/result refresh also leaves one issue and one inbox entry per participant/task. Verify the UUID mechanism in the real demo Linear workspace as well as in a focused simulated-failure check.
- [ ] **Partial failure:** first issue succeeds, second fails, and later retry preserves the first and finishes only incomplete effects. Notification-write failure resumes without recreating issues.
- [ ] **Media:** independent devices exchange audio/video, mute/camera/device/share work, all speech reaches the final transcript, organizer end disconnects everyone, early leaver still receives results. Browser-close recovery uses provider events/artifacts rather than a client upload assumption.
- [ ] **Upload:** valid synthetic audio passes; unsupported/oversized/unowned uploads fail; storage is private; duration is checked; the resulting tasks use the same publication pipeline.
- [ ] **Calendar/UI:** create a scheduled call in a non-UTC timezone, refresh, import `.ics`, and verify time/link; huddle bypasses schedule; dialogs work by keyboard; errors and processing/empty states are understandable.
- [ ] **Deployment:** actual build/typecheck/lint and focused tests pass; OAuth redirects, HTTPS media permissions, webhook signatures, background processing, and provider quotas work on the demo URL. Secrets and private data are absent from browser bundles and Git.
- [ ] **Delivery:** every actual participant gets task links in-app, including early leavers; an offline organizer sees the context prompt on return; no email is sent.
- [ ] **Georgian (AC9):** native-speaker review checks a Georgian planning clip with English code/repo terms, commitments and negations; transcript evidence and resulting tasks retain the meaning. Check upload and live separately, preserve Georgian text, and disclose unverified code-switching or failed paths.

For an upload-only demo, mark live-call checks explicitly incomplete and state the fallback in the demo introduction. A failed check changes the completion claim, not the acceptance criterion.
