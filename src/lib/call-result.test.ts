import { describe, expect, it } from "vitest";
import { issueDescription, parseWebVtt, selectedLinearDestination, shiproomTitle, toTranscript, isTranscript } from "./call-result";

const meetingId = "11111111-1111-4111-8111-111111111111";

describe("Daily transcript and Linear destination", () => {
  it("parses a stored WebVTT cue", () => {
    const cues = parseWebVtt(`WEBVTT

00:00:01.200 --> 00:00:04.600
<v Speaker 1>Let's add an empty state.
`);
    expect(cues).toEqual([{ speakerLabel: "Speaker 1", text: "Let's add an empty state.", startMs: 1200, endMs: 4600 }]);
  });

  it("uses the explicitly selected destination when several projects are available", () => {
    const teams = [{ id: "ship", name: "Shiproom", projects: [{ id: "mvp", name: "Shiproom MVP" }, { id: "demo", name: "Shiproom Demo" }] }];
    expect(selectedLinearDestination(teams, "ship", "demo")).toMatchObject({ ok: true, teamId: "ship", projectId: "demo" });
    expect(shiproomTitle("[shiproom] Add empty state")).toBe("[shiproom] Add empty state");
  });

  it("does not guess missing context or accept a project from another team", () => {
    const teams = [{ id: "ship", name: "Shiproom", projects: [{ id: "demo", name: "Demo" }] }];
    expect(selectedLinearDestination(teams, null, null).ok).toBe(false);
    expect(selectedLinearDestination(teams, "other-team", "demo").ok).toBe(false);
    expect(selectedLinearDestination(teams, "ship", "other-project").ok).toBe(false);
    expect(selectedLinearDestination(teams, "ship", null)).toMatchObject({ ok: true, projectId: null });
  });

  it("builds an English transcript and cites its evidence", () => {
    const transcript = toTranscript({
      meetingId,
      source: "daily",
      language: "en",
      complete: true,
      cues: [{ speakerLabel: "Ada", text: "We will add the empty state.", startMs: 0, endMs: 1500 }],
    });
    expect(isTranscript(transcript)).toBe(true);
    if (!isTranscript(transcript)) return;
    const description = issueDescription({
      meetingId,
      meetingUrl: "http://localhost:3000/teams/t/meetings/m",
      ordinal: 1,
      sourceNote: "Transcript source: Daily stored transcript.",
      task: { description: "Add the empty state.", acceptanceCriteria: ["The picker shows it."], evidenceSegmentIds: ["seg-0001"] },
      transcript,
      cursorRepo: "WeebPapi/acme-repo-picker",
    });
    expect(description).toContain("shiproom-task:11111111-1111-4111-8111-111111111111:1");
    expect(description).toContain("[repo=WeebPapi/acme-repo-picker]");
  });
});
