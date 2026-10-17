import { describe, expect, it } from "vitest";
import { authCallbackUrl, safeNextPath } from "./redirect";
import {
  contextModeFor,
  extractionResultSchema,
  githubRepositoryNameSchema,
  meetingInputSchema,
  transcriptSchema,
  validateExtractionAgainstTranscript,
} from "./contracts";

const meetingId = "11111111-1111-4111-8111-111111111111";
const transcript = transcriptSchema.parse({
  meetingId,
  revision: 1,
  source: "upload",
  complete: true,
  language: "en",
  segments: [{ id: "seg-0001", startMs: 0, endMs: 1200, speakerUserId: null, speakerLabel: "Speaker 1", text: "Add an empty state." }],
});

describe("shared contracts", () => {
  it("rejects malformed transcript segments", () => {
    const bad = { ...transcript, segments: [{ ...transcript.segments[0], startMs: 5, endMs: 1 }] };
    expect(transcriptSchema.safeParse(bad).success).toBe(false);
    const duplicate = { ...transcript, segments: [transcript.segments[0], transcript.segments[0]] };
    expect(transcriptSchema.safeParse(duplicate).success).toBe(false);
  });

  it("flags extraction evidence that is not in the transcript", () => {
    const result = extractionResultSchema.parse({
      summary: "",
      decisions: [],
      openQuestions: [],
      tasks: [{ title: "Add empty state", description: "d", acceptanceCriteria: [], evidenceSegmentIds: ["seg-9999"] }],
    });
    expect(validateExtractionAgainstTranscript(result, transcript)).toEqual(["Task 1 cites unknown segment seg-9999."]);
    expect(
      extractionResultSchema.safeParse({ ...result, tasks: [{ ...result.tasks[0], title: "[shiproom] x" }] }).success,
    ).toBe(false);
  });

  it("defaults meetings to English and requires schedule only for scheduled calls", () => {
    const base = {
      teamId: meetingId,
      kind: "huddle",
      title: "Huddle",
      context: { githubRepositoryId: null, linearTeamId: null, linearProjectId: null },
      schedule: null,
    };
    expect(meetingInputSchema.parse(base).language).toBe("en");
    expect(meetingInputSchema.safeParse({ ...base, kind: "scheduled" }).success).toBe(false);
    expect(contextModeFor(base.context)).toBe("infer");
    expect(contextModeFor({ githubRepositoryId: "1", linearTeamId: null, linearProjectId: null })).toBe("mixed");
  });

  it("normalizes GitHub repository names", () => {
    expect(githubRepositoryNameSchema.parse("https://github.com/WeebPapi/shiproom.git")).toBe("WeebPapi/shiproom");
    expect(githubRepositoryNameSchema.safeParse("../etc").success).toBe(false);
    expect(githubRepositoryNameSchema.safeParse("owner/..").success).toBe(false);
  });

  it("only allows same-origin redirect paths", () => {
    expect(safeNextPath("/teams/x?tab=1")).toBe("/teams/x?tab=1");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });

  it("keeps PKCE callbacks on the initiating origin and preserves a safe destination", () => {
    for (const origin of ["http://localhost:3000", "https://demo.example.com"]) {
      expect(authCallbackUrl(origin, "/invite/abc?from=team")).toBe(`${origin}/auth/callback?next=%2Finvite%2Fabc%3Ffrom%3Dteam`);
      expect(authCallbackUrl(origin, "//evil.example")).toBe(`${origin}/auth/callback?next=%2F`);
    }
  });
});
