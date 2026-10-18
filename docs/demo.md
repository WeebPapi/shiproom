# Scripted filming demo

`/demo` is a recording shortcut, separate from live transcription quality. It starts a real Daily huddle, then saves the same synthetic Georgian transcript and publishes the same two fixed tasks regardless of speech (including silence). It never calls speech recognition, Deepgram, or Claude. Page notices and Linear descriptions disclose the scripted input. It does not pass the Georgian acceptance gate AC9.

## Before recording

1. Apply `supabase/migrations/20261018090000_scripted_demo.sql` to the app's database after the earlier migrations. This adds a server-owned meeting demo flag and the `demo` transcript source. Existing meetings default to normal mode. Browser roles cannot insert or update the flag.
2. Use the existing server configuration: Supabase public configuration, a working `SUPABASE_SERVICE_ROLE_KEY`, `DAILY_API_KEY`, and `LINEAR_API_KEY`. No transcription/model key is needed. Normal sign-in, membership checks, organizer-only publication, and the existing unique Shiproom-name destination restriction still apply. Use a dedicated Shiproom demo destination; ambiguous destinations block creation. Do not use the unrelated connected Linear MCP workspace for this flow.
3. Sign in, open `/demo`, choose your Shiproom team, and click **Prepare demo huddle** before filming. Save the resulting `/demo?teamId=…&meetingId=…` URL for the take. Preparation creates the meeting; ending it creates real issues.
4. Check the consent box. Keep the camera/microphone ready and rehearse once. API latency and media permissions can extend the take beyond 30 seconds; the demo does not fake provider success.

## Thirty-second filming script

| Time | Action and optional narration |
| --- | --- |
| 0–5s | Click **Start huddle**. “We start a quick planning huddle in Shiproom.” |
| 5–18s | Say anything, or: “რეპოზიტორიის არჩევას ჩატვირთვის და ცარიელი მდგომარეობები დავამატოთ. ძებნა მოგვიანებით განვიხილოთ.” |
| 18–24s | Click **End and create tasks**. “Shiproom turns our agreed work into Linear issues.” |
| 24–30s | Show the Georgian transcript, then open a returned Linear issue. “Each task includes the original conversation as evidence.” |

The full fixed 30-second dialogue, summary, and tasks live in [`src/lib/demo.ts`](../src/lib/demo.ts). Invented speakers Nino and Luka agree a loading indicator with disabled selection while loading, plus an empty state directing the owner to Connections. Search is explicitly deferred. Exactly these two issues are generated:

- `[shiproom] Add repository picker loading state`
- `[shiproom] Add repository picker empty state`

## Repeat takes and failures

Refresh preserves the demo mode, transcript, and issue links. **Retry this take** resumes incomplete publication with saved task UUIDs; an already published task is reused. Failed transcript or task-identity persistence blocks the corresponding external writes. Use the same meeting URL to recover after a timeout. **New take** creates a separate meeting and, when ended, another pair of real issues; clean up unwanted rehearsal issues manually in Linear. Nothing is deleted automatically.

This shortcut does not add background jobs, context inference, or Georgian speech recognition. Normal meetings continue through the existing capture/extraction path. Live media, provider latency, and real Linear publication require a rehearsal in the configured app; mocked tests do not verify them.
