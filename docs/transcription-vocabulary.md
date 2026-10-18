# Deepgram transcription vocabulary

Deepgram Nova-3 is the chosen transcription provider/model. Use `language=ka` for Georgian and `language=en` for English. Daily remains the recommended meeting transport; its integrated Deepgram route is the first live path to verify. See [Integrations](integrations.md) for connection details and [Architecture](architecture.md) for transcript/evidence handling.

## Reusable catalog

[transcription-vocabulary.json](transcription-vocabulary.json) is the source of truth for reusable hint strings. It is UTF-8 data, ready for an agent or the future app to read. Each top-level field is an array of plain strings:

- `user_supplied`: all 26 hints transcribed from the user's three screenshots, preserving their exact spelling/case and Georgian variants.
- `previous_suggestions`: earlier assistant suggestions that are not already present verbatim in the user list. Capitalized brand variants are retained for provenance; sending both `github` and `GitHub` is unnecessary.
- `additional_candidates`: a small proposed set of developer terms and Georgian transliterations relevant to planning calls. These are candidates to evaluate, not a validated spelling standard or a proven accuracy improvement.

The catalog preserves distinct forms such as `გითჰაბი` / `გიტჰაბი`, `თიქეთი` / `ტიკეტი`, and common endings. Do not spell-correct away the forms people actually pronounce. Add new observed variants here rather than scattering separate vocabularies through prompts, UI code, and provider clients. Screenshots and raw user transcript/audio are not committed.

## Choosing hints for a meeting

Treat the catalog as a candidate pool, not an always-on request payload. Start with roughly 20-40 relevant hints and reserve room for the selected repository/project names and explicitly referenced issue identifiers. Pick one preferred case for equivalent brand strings; deduplicate exact and case-only duplicates. Preserve meaningful Georgian spelling/inflection differences.

For the initial repository-picker demo, prioritize repo/repository variants, GitHub/Linear/Shiproom names, loading/empty state phrases, authentication, reconnect, and ticket variants. Add pull-request/deployment terms only for a conversation that needs them. Broad terms like `state` and `connect` are retained from the user's list but have lower priority than a distinctive phrase like `loading state`.

Use only authorized team/repo/project context when adding meeting-specific names. If context is inferred and unknown before the call, use the small relevant general vocabulary first; do not invent a destination or expose names from another team's workspace. Generic vocabulary alone is enough to start a huddle. Adding vocabulary updates during a live call is optional polish, not a required new agent feature.

## Supplying the hints

The app now loads this catalog in `src/lib/transcription.ts`: authorized context names first, then previous suggestions and user-supplied terms, with case-insensitive deduplication, at most 40 terms, and a conservative 400-byte UTF-8 cap. This is a bounded demo shortlist, not an accuracy-tuned vocabulary or a measured provider token count. Daily room settings and `startTranscription` pass it as `extra.keyterm` with Nova-3 and the saved meeting language. `extra.diarize_model=latest` also requests streaming speaker diarization. The provider remains authoritative about acceptance and limits; transcription errors are visible and browser microphone capture cannot publish issues.

On 2026-10-18 Daily accepted the room settings and direct Deepgram accepted a silent WAV using Georgian, these repeated keyterms, and diarization. This verifies configuration acceptance only. Daily's live forwarding, original speech recognition, speaker separation (especially a shared microphone), and hint efficacy still need the live rehearsal in [Demo checks](demo.md).

In the Deepgram Playground: **Features → Transcription → Keyterm Prompting**. Put each word/phrase in its own field; use **+ More Keyterm Prompting Terms** to add another. Keep Nova-3 and the chosen language fixed when comparing runs. A multiline catalog is not one combined hint.

For the direct API, append a separate `keyterm` query parameter per string, using normal UTF-8 URL encoding. Keep spaces inside a phrase. Do not join the whole list with commas, add weights, or use the legacy `keywords` parameter. For Daily's integrated route, verify the supported forwarding of keyterms and that the intended model/language/hints actually reach Deepgram before claiming parity with direct API tests.

Deepgram's current documented budget is **500 tokens across all keyterms per request**, with a recommendation to focus on 20-50 terms. Georgian text can consume several tokens per word; a count of hints or characters does not establish token-budget compliance. The Playground describes up to 100 terms, which does not override the API token budget. Check the selected model/SDK's current constraints, keep the shortlist conservative, and handle a rejected hint budget explicitly. [Official keyterm documentation](https://developers.deepgram.com/docs/keyterm).

## Evidence and normalization

Hints bias speech recognition; they do not define aliases, translate Georgian words into English, or guarantee every grammatical ending is recognized. Do not put mappings such as `რეპოზიტორია=repository` into hint fields. Preserve original transcript segments as evidence. Any later normalization into task wording must use the meeting's actual context and must not fill in an unintelligible commitment from guesswork.

Validate with the same saved recording: baseline, then English hints, then relevant Georgian/English variants. Change one variable at a time. Review source names, developer terms, owners, commitments/negations, and the resulting issue content; check for extra words introduced by over-biasing too. Test a new conversational sample afterward to avoid tuning solely to the demo script.

Current evidence: the user reported Georgian trials with distorted developer vocabulary; the first was recorded in a very noisy room. Original audio, full request settings, and hint efficacy were not independently checked. Provider choice is settled; Georgian quality and the final hint shortlist still need verification under AC9 in [Product](product.md).
