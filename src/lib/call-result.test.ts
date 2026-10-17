import { describe, expect, it } from "vitest";
import { issueDescription, parseWebVtt, selectShiproomDestination, shiproomTitle, toTranscript, isTranscript } from "./call-result";

const meetingId = "11111111-1111-4111-8111-111111111111";

describe("Daily transcript and Linear destination", () => {
  it("parses a stored WebVTT cue", () => {
    const cues = parseWebVtt(`WEBVTT

00:00:01.200 --> 00:00:04.600
<v Speaker 1>Let's add an empty state.
`);
    expect(cues).toEqual([{ speakerLabel: "Speaker 1", text: "Let's add an empty state.", startMs: 1200, endMs: 4600 }]);
  });

  it("refuses teams that are not named Shiproom", () => {
    const choice = selectShiproomDestination([
      { id: "arci", name: "ARCI", projects: [{ id: "p1", name: "Platform" }] },
      { id: "local", name: "Localloop", projects: [{ id: "p2", name: "Georgia MVP — Pilot Launch" }] },
    ]);
    expect(choice.ok).toBe(false);
    if (!choice.ok) expect(choice.names).toEqual(["ARCI / Platform", "Localloop / Georgia MVP — Pilot Launch"]);
  });

  it("selects the single Shiproom project and prefixes the title once", () => {
    const choice = selectShiproomDestination([
      { id: "arci", name: "ARCI", projects: [] },
      { id: "ship", name: "Other", projects: [{ id: "demo", name: "Shiproom Demo" }] },
    ]);
    expect(choice).toMatchObject({ ok: true, teamId: "ship", projectId: "demo" });
    expect(shiproomTitle("[shiproom] Add empty state")).toBe("[shiproom] Add empty state");
  });

  it("builds an English transcript and cites its evidence", () => {
    const transcript = toTranscript({
      meetingId,
      source: "daily",
      complete: true,
      cues: [{ speakerLabel: "Ada", text: "We will add the empty state.", startMs: 0, endMs: 1500 }],
    });
    expect(isTranscript(transcript)).toBe(true);
    if (!isTranscript(transcript)) return;
    expect(issueDescription({
      meetingId,
      meetingUrl: "http://localhost:3000/teams/t/meetings/m",
      ordinal: 1,
      sourceNote: "Transcript source: Daily stored transcript.",
      task: { description: "Add the empty state.", acceptanceCriteria: ["The picker shows it."], evidenceSegmentIds: ["seg-0001"] },
      transcript,
    })).toContain("shiproom-task:11111111-1111-4111-8111-111111111111:1");
  });
});
