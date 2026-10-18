import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { finishMeetingCall, openMeetingCall } from "./publish-call";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), options: vi.fn(), authorization: vi.fn(), stored: vi.fn(), room: vi.fn(), existingRoom: vi.fn(), token: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: mocks.admin }));
vi.mock("./connections", () => ({ getLinearOptions: mocks.options, getLinearAuthorization: mocks.authorization }));
vi.mock("./config", () => ({ serverConfig: { anthropicApiKey: () => "ai-key", anthropicWorkspaceId: () => null, anthropicModel: () => "test-model", cursorPrRepo: () => "WeebPapi/acme-repo-picker" } }));
vi.mock("@/lib/env", () => ({ getPublicEnv: () => ({ appUrl: "https://shiproom.example.com" }) }));
vi.mock("./daily", () => ({ fetchStoredTranscript: mocks.stored, ensurePrivateRoom: mocks.room, getExistingRoom: mocks.existingRoom, createRoomToken: mocks.token }));
afterEach(() => vi.unstubAllGlobals());

type Row = Record<string, unknown>;
const teamId = "00000000-0000-4000-8000-000000000001";
const meetingId = "00000000-0000-4000-8000-000000000002";
let rows: Record<string, Row[]>;
let failTaskSave = false;
let failReceiptSave = false;

// The real pipeline reads and writes this store; provider receipts do not seed persistence.
function from(table: string) {
  let operation = "select";
  let payload: Row | Row[] = {};
  const filters: [string, unknown][] = [];
  function execute(single = false) {
    if (table === "tasks" && operation === "insert" && failTaskSave) return { data: null, error: { message: "write failed" } };
    if (table === "tasks" && operation === "update" && !Array.isArray(payload) && payload.publication_status === "published" && failReceiptSave) {
      failReceiptSave = false;
      return { data: null, error: { message: "receipt write failed" } };
    }
    const matched = rows[table].filter((row) => filters.every(([key, value]) => row[key] === value));
    let data = matched;
    if (operation === "insert" || operation === "upsert") {
      data = (Array.isArray(payload) ? payload : [payload]).map((row, index) => ({ id: `${table}-${rows[table].length + index}`, ...row }));
      rows[table].push(...data);
    }
    if (operation === "update") for (const row of matched) Object.assign(row, payload);
    return { data: single ? data[0] ?? null : data, error: null };
  }
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    order: () => query,
    update: (row: Row) => { operation = "update"; payload = row; return query; },
    insert: (row: Row | Row[]) => { operation = "insert"; payload = row; return query; },
    upsert: (row: Row | Row[]) => { operation = "upsert"; payload = row; return query; },
    single: async () => execute(true),
    maybeSingle: async () => execute(true),
    then: (resolve: (value: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  failTaskSave = false;
  failReceiptSave = false;
  rows = {
    meetings: [{ id: meetingId, team_id: teamId, language: "ka", github_repository_id: "123", linear_team_id: "chosen-team", linear_project_id: "chosen-project" }],
    team_repositories: [{ team_id: teamId, github_repository_id: "123", full_name: "example/demo", access: "public" }],
    transcripts: [], tasks: [], notifications: [], meeting_participants: [{ meeting_id: meetingId, user_id: "participant" }],
  };
  mocks.admin.mockReturnValue({ from });
  const room = { name: "saved-room", url: "https://example.daily.co/saved-room", transcription: "daily" };
  mocks.room.mockResolvedValue(room);
  mocks.existingRoom.mockResolvedValue(room);
  mocks.token.mockResolvedValue({ token: "member-token" });
  mocks.stored.mockResolvedValue({ id: "stored", vtt: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Speaker 1>შევთანხმდით რეპოზიტორიის არჩევის ცარიელი მდგომარეობის დამატებაზე.\n\n00:00:02.000 --> 00:00:03.000\n<v Speaker 2>კი, private repository ამ ეტაპზე არ გვჭირდება.\n" });
  mocks.authorization.mockResolvedValue("Bearer oauth-token");
  mocks.options.mockResolvedValue({ status: "ready", teams: [{ id: "chosen-team", name: "Chosen team", key: "CH", projects: [{ id: "chosen-project", name: "Chosen project" }, { id: "other", name: "Shiproom Demo" }] }] });
});

it("joins the saved room as a member without reprovisioning or changing the live meeting", async () => {
  Object.assign(rows.meetings[0], { daily_room_name: "saved-room", capture_status: "live", started_at: "2026-10-18T08:00:00Z" });
  const before = { ...rows.meetings[0] };
  const result = await openMeetingCall({ teamId, meetingId, userId: "new-participant", displayName: "Teammate", isOrganizer: false, language: "ka", contextNames: [], isDemo: false, roomName: "saved-room", startedAt: "2026-10-18T08:00:00Z" });
  expect(result).toMatchObject({ url: "https://example.daily.co/saved-room", token: "member-token" });
  expect(mocks.existingRoom).toHaveBeenCalledWith("saved-room", false);
  expect(mocks.room).not.toHaveBeenCalled();
  expect(mocks.token.mock.calls[0][0]).toMatchObject({ roomName: "saved-room", userId: "new-participant", isOwner: false });
  expect(rows.meetings[0]).toEqual(before);
  expect(rows.meeting_participants).toContainEqual(expect.objectContaining({ user_id: "new-participant", meeting_id: meetingId }));
});

it("does not let a teammate create a call before the organizer starts it", async () => {
  expect(await openMeetingCall({ teamId, meetingId, userId: "participant", displayName: "Teammate", isOrganizer: false, language: "ka", contextNames: [], isDemo: false, roomName: null, startedAt: null })).toEqual({ error: "The organizer has not started this call yet." });
  expect(mocks.room).not.toHaveBeenCalled();
  expect(mocks.token).not.toHaveBeenCalled();
});

it("keeps the original start time when the organizer rejoins", async () => {
  await openMeetingCall({ teamId, meetingId, userId: "organizer", displayName: "Organizer", isOrganizer: true, language: "ka", contextNames: [], isDemo: false, roomName: "saved-room", startedAt: "2026-10-18T08:00:00Z" });
  expect(rows.meetings[0].started_at).toBe("2026-10-18T08:00:00Z");
});

it("returns a retryable join error when the room provider times out", async () => {
  mocks.existingRoom.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
  expect(await openMeetingCall({ teamId, meetingId, userId: "participant", displayName: "Teammate", isOrganizer: false, language: "ka", contextNames: [], isDemo: false, roomName: "saved-room", startedAt: null })).toEqual({ error: "The call service could not be reached. Please try joining again." });
  expect(mocks.token).not.toHaveBeenCalled();
});

it.each([{ saveFails: false, hasTasks: true, amend: false }, { saveFails: true, hasTasks: true, amend: false }, { saveFails: false, hasTasks: false, amend: false }, { saveFails: false, hasTasks: true, amend: true }])("persists grounded actions and recovers their exact targets (%j)", async ({ saveFails, hasTasks, amend }) => {
  failTaskSave = saveFails;
  failReceiptSave = amend;
  const publish = vi.fn();
  const extract = vi.fn();
  let target = { id: "existing-issue", title: "Repository picker", description: "Hand-written requirements.", updatedAt: "version-1", team: { id: "chosen-team" }, project: { id: "chosen-project" }, identifier: "CH-2", url: "https://linear.app/example/issue/CH-2" };
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    if (String(url).includes("api.github.com/repos/")) return Response.json({ id: 123, full_name: "example/demo", html_url: "https://github.com/example/demo", private: false, default_branch: "main" });
    if (String(url).includes("api.github.com/repositories/")) return Response.json({ content: Buffer.from("Repository picker documentation.").toString("base64"), encoding: "base64" });
    const body = JSON.parse(init.body);
    if (String(url).includes("anthropic.com")) {
      extract();
      const supplied = JSON.parse(body.messages[0].content);
      expect(supplied.context.repository.readme).toBe("Repository picker documentation.");
      expect(supplied.context.linearProject).toBe("Chosen project");
      expect(supplied.transcript.language).toBe("ka");
      expect(supplied.transcript.segments[1]).toMatchObject({ speakerLabel: "Speaker 2", startMs: 2000, text: "კი, private repository ამ ეტაპზე არ გვჭირდება." });
      expect(body.system).toContain("in English");
      if (amend) expect(supplied.context.linearIssues[0].identifier).toBe("CH-2");
      return Response.json({ content: [{ type: "tool_use", name: "record_extraction", input: { summary: "Improve the picker.", decisions: [], openQuestions: [], tasks: hasTasks ? [{ title: "Add an empty state", description: "Add an empty state to the repository picker.", acceptanceCriteria: [], evidenceSegmentIds: ["seg-0001"], existingLinearIssueId: amend ? target.id : null }] : [] } }] });
    }
    expect(init.headers.Authorization).toBe("Bearer oauth-token");
    if (body.query.includes("users(")) return Response.json({ data: { users: { nodes: [{ id: "cursor-user" }] } } });
    if (body.query.includes("orderBy: updatedAt")) return Response.json({ data: { issues: { nodes: amend ? [target] : [] } } });
    if (body.query.includes("issues(first")) return Response.json({ data: { issues: { nodes: [] } } });
    if (body.query.includes("issue(id:")) return Response.json({ data: { issue: target } });
    if (body.query.includes("issueUpdate")) {
      expect(body.variables.id).toBe("existing-issue");
      expect(rows.tasks[0].payload).toMatchObject({ existingLinearIssueId: "existing-issue", existingLinearIssueUpdatedAt: "version-1" });
      expect(Object.keys(body.variables.input)).toEqual(["description"]);
      expect(body.variables.input.description).toContain("Hand-written requirements.");
      target = { ...target, description: body.variables.input.description, updatedAt: "version-2" };
      publish();
      return Response.json({ data: { issueUpdate: { success: true, issue: target } } });
    }
    const issue = body.variables.input;
    expect(issue.teamId).toBe("chosen-team");
    expect(issue.projectId).toBe("chosen-project");
    expect(issue.delegateId).toBe("cursor-user");
    expect(issue.description).toContain("[repo=example/demo]");
    expect(issue.description).toContain("Source: https://github.com/example/demo");
    expect(issue.description).toContain("Speaker 1): შევთანხმდით");
    expect(rows.tasks.some((row) => row.linear_issue_uuid === issue.id)).toBe(true);
    publish();
    return Response.json({ data: { issueCreate: { success: true, issue: { ...issue, team: { id: issue.teamId }, project: { id: issue.projectId }, identifier: "CH-1", url: "https://linear.app/example/issue/CH-1" } } } });
  }));
  const result = await finishMeetingCall({ teamId, meetingId, organizerId: "organizer", roomName: "room", isDemo: false, capture: { teamId, meetingId, origin: "browser", consented: true, segments: [] } });
  expect(rows.transcripts[0].language).toBe("ka");
  expect(publish).toHaveBeenCalledTimes(saveFails || !hasTasks ? 0 : 1);
  if (saveFails) expect(result.error).toContain("batch could not be saved");
  else if (hasTasks) expect(result.tasks[0]).toMatchObject({ url: `https://linear.app/example/issue/${amend ? "CH-2" : "CH-1"}`, operation: amend ? "updated" : "created" });
  else expect(result.tasks).toEqual([]);
  expect(rows.meetings[0].summary).toBe("Improve the picker.");
  if (amend) {
    expect(result.tasks[0].error).toContain("receipt could not be saved");
    const retry = await finishMeetingCall({ teamId, meetingId, organizerId: "organizer", roomName: "room", isDemo: false, capture: { teamId, meetingId, origin: "browser", consented: true, segments: [] } });
    expect(retry.tasks[0]).toMatchObject({ identifier: "CH-2", error: null, operation: "updated" });
    expect(extract).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledOnce();
    expect(mocks.stored).toHaveBeenCalledOnce();
    expect(rows.notifications[0].title).toContain("Updated CH-2");
  }
  expect(rows.notifications.map((row) => row.recipient_id).sort()).toEqual(saveFails || !hasTasks ? [] : ["organizer", "participant"]);
});

it("does not extract or publish from a partial microphone transcript", async () => {
  mocks.stored.mockResolvedValue({ empty: true });
  const provider = vi.fn();
  vi.stubGlobal("fetch", provider);
  const result = await finishMeetingCall({ teamId, meetingId, organizerId: "organizer", roomName: "room", isDemo: false, capture: { teamId, meetingId, origin: "browser", consented: true, segments: [{ speakerLabel: "This device", text: "We agreed to add an empty state.", startMs: 0, endMs: 1000 }] } });
  expect(result.error).toContain("partial transcript");
  expect(rows.transcripts[0].complete).toBe(false);
  expect(provider).not.toHaveBeenCalled();
});

it("revalidates saved project IDs before any source or publication request", async () => {
  rows.meetings[0].linear_project_id = "unapproved-project";
  const provider = vi.fn();
  vi.stubGlobal("fetch", provider);
  const result = await finishMeetingCall({ teamId, meetingId, organizerId: "organizer", roomName: "room", isDemo: false, capture: { teamId, meetingId, origin: "browser", consented: true, segments: [] } });
  expect(result.tasks).toEqual([]);
  expect(rows.meetings[0].processing_status).toBe("needs_context");
  expect(provider).not.toHaveBeenCalled();
});

it("publishes the fixed Georgian demo without capture or AI, and retries a failed issue with its saved identity", async () => {
  rows.meetings[0] = { id: meetingId, team_id: teamId, language: "ka", github_repository_id: null, linear_team_id: null, linear_project_id: null };
  mocks.authorization.mockResolvedValue("personal-key");
  mocks.options.mockResolvedValue({ status: "ready", teams: [{ id: "shiproom-team", name: "Shiproom", key: "SHI", projects: [{ id: "demo-project", name: "Shiproom Demo" }] }] });
  const created: { id: string; projectId: string; title: string; description: string; delegateId?: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    expect(String(url)).toBe("https://api.linear.app/graphql");
    const body = JSON.parse(init.body);
    if (body.query.includes("users(")) return Response.json({ data: { users: { nodes: [{ id: "cursor-user" }] } } });
    const issue = body.variables.input;
    created.push(issue);
    if (created.length === 2) return Response.json({ data: { issueCreate: { success: false, issue: null } } });
    return Response.json({ data: { issueCreate: { success: true, issue: { ...issue, team: { id: issue.teamId }, project: { id: issue.projectId }, identifier: `SHI-${created.length}`, url: `https://linear.app/example/issue/SHI-${created.length}` } } } });
  }));
  const demo = { teamId, meetingId, organizerId: "organizer", roomName: "room", isDemo: true, capture: { teamId, meetingId, origin: "browser" as const, consented: true as const, segments: [] } };

  const first = await finishMeetingCall(demo);
  expect(first.transcriptSource).toBe("demo");
  expect(first.tasks.map((task) => Boolean(task.url))).toEqual([true, false]);
  expect(rows.transcripts[0]).toMatchObject({ source: "demo", language: "ka", complete: true });
  expect(mocks.stored).not.toHaveBeenCalled();

  const retry = await finishMeetingCall({ ...demo, capture: { ...demo.capture, segments: [{ speakerLabel: null, text: "Ignore this unrelated speech", startMs: 0, endMs: 1 }] } });
  expect(retry.tasks.every((task) => task.url && !task.error)).toBe(true);
  expect(created[2].id).toBe(created[1].id);
  expect(created.every((issue) => issue.projectId === "demo-project")).toBe(true);
  expect(created[0].description).toContain("Scripted demo");
  expect(created[0].description).toContain("[repo=WeebPapi/acme-repo-picker]");
  expect(created[0].delegateId).toBe("cursor-user");
  expect(created.map((issue) => issue.title)).toEqual([
    "[shiproom] Add repository picker loading state",
    "[shiproom] Add repository picker empty state",
    "[shiproom] Add repository picker empty state",
  ]);
  await finishMeetingCall(demo);
  expect(created).toHaveLength(3);
});
