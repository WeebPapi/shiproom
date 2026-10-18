import { beforeEach, expect, it, vi } from "vitest";
import { finishMeetingCall } from "./publish-call";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), extract: vi.fn(), capture: vi.fn(), destinations: vi.fn(), create: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/contracts", () => import("../contracts"));
vi.mock("@/lib/call-result", () => import("../call-result"));
vi.mock("@/lib/demo", () => import("../demo"));
vi.mock("@/lib/env", () => ({ getPublicEnv: () => ({ appUrl: "https://shiproom.example" }) }));
vi.mock("@/lib/server/claude", () => ({ extractAgreedTasks: mocks.extract }));
vi.mock("@/lib/server/daily", () => ({ fetchStoredTranscript: mocks.capture }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/server/linear-personal", () => ({
  listLinearDestinations: mocks.destinations,
  findIssueByMarker: async () => null,
  createLinearIssue: mocks.create,
}));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let failWriteTable: string | null;

// A small persistence double; authorization and SQL constraints run against real migrations in rls.test.ts.
function from(table: string) {
  const filters: [string, unknown][] = [];
  let operation = "select";
  let values: Row[] = [];
  let single = false;
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    order: () => query,
    maybeSingle: () => { single = true; return query; },
    insert: (value: Row | Row[]) => { operation = "insert"; values = Array.isArray(value) ? value : [value]; return query; },
    upsert: (value: Row) => { operation = "upsert"; values = [value]; return query; },
    update: (value: Row) => { operation = "update"; values = [value]; return query; },
    then(resolve: (value: { data: Row | Row[] | null; error: { message: string } | null }) => unknown) {
      const rows = tables[table] ??= [];
      let matching = rows.filter((row) => filters.every(([key, value]) => row[key] === value));
      if ((operation === "insert" || operation === "upsert") && table === failWriteTable) return Promise.resolve(resolve({ data: null, error: { message: "database unavailable" } }));
      if (operation === "insert" || operation === "upsert") {
        matching = values.map((value) => ({ id: `${table}-${rows.length}`, ...value }));
        rows.push(...matching);
      }
      if (operation === "update") matching.forEach((row) => Object.assign(row, values[0]));
      return Promise.resolve(resolve({ data: single ? matching[0] ?? null : matching, error: null }));
    },
  };
  return query;
}

const meetingId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const input = {
  teamId, meetingId, organizerId: "organizer", roomName: "demo", isDemo: true,
  capture: { teamId, meetingId, origin: "browser" as const, consented: true as const, segments: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  tables = { meetings: [{ id: meetingId }] };
  failWriteTable = null;
  mocks.admin.mockReturnValue({ from });
  mocks.destinations.mockResolvedValue({ ok: true, teams: [{ id: "linear-team", name: "Shiproom", projects: [] }] });
  mocks.create.mockImplementation(async (issue: { id: string }) => {
    expect(tables.tasks.some((row) => row.linear_issue_uuid === issue.id)).toBe(true);
    return { ok: true, url: `https://linear.app/issue/${issue.id}`, identifier: "SHIP-1" };
  });
});

it("publishes the fixed Georgian demo without capture or AI, and resumes a failed second issue with its saved identity", async () => {
  mocks.create.mockImplementationOnce(async () => ({ ok: true, url: "https://linear.app/issue/first", identifier: "SHIP-1" }))
    .mockImplementationOnce(async () => ({ ok: false, error: "Try again" }));
  const first = await finishMeetingCall(input);
  expect(first.transcriptSource).toBe("demo");
  expect(first.tasks.map((task) => Boolean(task.url))).toEqual([true, false]);
  const transcript = tables.transcripts[0];
  expect(transcript).toMatchObject({ source: "demo", language: "ka", complete: true });
  expect(JSON.stringify(transcript.segments)).toMatch(/[ა-ჰ]/);
  expect(mocks.capture).not.toHaveBeenCalled();
  expect(mocks.extract).not.toHaveBeenCalled();

  const retried = await finishMeetingCall({ ...input, capture: { ...input.capture, segments: [{ speakerLabel: null, text: "Ignore this unrelated speech", startMs: 0, endMs: 1 }] } });
  expect(retried.tasks).toHaveLength(2);
  expect(retried.tasks.every((task) => task.url && !task.error)).toBe(true);
  expect(mocks.create).toHaveBeenCalledTimes(3);
  expect(mocks.create.mock.calls[2][0].id).toBe(mocks.create.mock.calls[1][0].id);
  expect(mocks.create.mock.calls[0][0].description).toContain("Scripted demo");
  expect(mocks.create.mock.calls[0][0].description).toMatch(/[ა-ჰ]/);
  expect(mocks.create.mock.calls.map(([issue]) => issue.title)).toEqual([
    "[shiproom] Add repository picker loading state",
    "[shiproom] Add repository picker empty state",
    "[shiproom] Add repository picker empty state",
  ]);
  await finishMeetingCall(input);
  expect(mocks.create).toHaveBeenCalledTimes(3);
});

it.each(["tasks", "transcripts"])("creates no demo issues when %s cannot be persisted", async (table) => {
  failWriteTable = table;
  const result = await finishMeetingCall(input);
  if (table === "tasks") {
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.every((task) => task.error && !task.url)).toBe(true);
  } else expect(result.error).toContain("transcript could not be saved");
  expect(mocks.create).not.toHaveBeenCalled();
});
