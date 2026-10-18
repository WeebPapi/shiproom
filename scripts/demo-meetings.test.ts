import { describe, expect, it } from "vitest";
import { extractionResultSchema, transcriptSchema, validateExtractionAgainstTranscript } from "@/lib/contracts";
import data from "./demo-meetings.json";

describe("demo seed meetings", () => {
  it.each(data.meetings)("$title satisfies the transcript and extraction contracts", (meeting) => {
    const transcript = transcriptSchema.parse({ meetingId: meeting.id, revision: 1, source: "daily", complete: true, language: "ka", segments: meeting.segments });
    const result = extractionResultSchema.parse({
      summary: meeting.summary,
      decisions: meeting.decisions,
      openQuestions: meeting.openQuestions,
      tasks: meeting.tasks,
    });
    expect(validateExtractionAgainstTranscript(result, transcript)).toEqual([]);
    expect(meeting.segments.every((s) => /[Ⴀ-ჿ]/.test(s.text))).toBe(true);
  });

  it("uses unique fixed IDs so reruns update instead of duplicating", () => {
    const ids = data.meetings.flatMap((m) => [m.id, ...m.tasks.map((t) => t.linearIssueUuid)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
