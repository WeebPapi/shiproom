import { beforeEach, expect, it, vi } from "vitest";
import { endMeetingCall, startMeetingCall } from "./call";

const mocks = vi.hoisted(() => ({ access: vi.fn(), meeting: vi.fn(), finish: vi.fn(), open: vi.fn(), options: vi.fn(), repositories: vi.fn() }));
vi.mock("@/lib/contracts", () => import("../contracts"));
vi.mock("@/lib/server/auth", () => ({ findMembership: mocks.access }));
vi.mock("@/lib/server/config", () => ({ serverConfig: { dailyApiKey: () => "test-key" } }));
vi.mock("@/lib/server/publish-call", () => ({ finishMeetingCall: mocks.finish, openMeetingCall: mocks.open }));
vi.mock("@/lib/server/connections", () => ({ getLinearOptions: mocks.options, listTeamRepositories: mocks.repositories }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: mocks.meeting };
    return query;
  },
}) }));

const teamId = "22222222-2222-4222-8222-222222222222";
const meetingId = "11111111-1111-4111-8111-111111111111";
const input = { teamId, meetingId, consented: true, origin: "browser", segments: [], isDemo: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ user: { id: "organizer" } });
  mocks.meeting.mockResolvedValue({ data: { organizer_id: "organizer", is_demo: false } });
  mocks.finish.mockResolvedValue({ tasks: [] });
});

it("admits a teammate to the saved room without requiring Linear or repository access", async () => {
  mocks.meeting.mockResolvedValue({ data: { organizer_id: "someone-else", daily_room_name: "saved-room", language: "ka", started_at: "2026-10-18T08:00:00Z" } });
  mocks.open.mockResolvedValue({ url: "https://example.daily.co/saved-room", token: "member-token" });
  expect(await startMeetingCall({ teamId, meetingId, consented: true })).toMatchObject({ token: "member-token" });
  expect(mocks.open.mock.calls[0][0]).toMatchObject({ isOrganizer: false, roomName: "saved-room", contextNames: [] });
  expect(mocks.options).not.toHaveBeenCalled();
  expect(mocks.repositories).not.toHaveBeenCalled();
});

it.each(["nonmember", "no-consent", "ended", "missing", "not-started"])("blocks call tokens for %s", async (state) => {
  mocks.meeting.mockResolvedValue({ data: { organizer_id: "someone-else", daily_room_name: "saved-room", ended_at: state === "ended" ? "2026-10-18T08:00:00Z" : null } });
  if (state === "nonmember") mocks.access.mockResolvedValue(null);
  if (state === "missing") mocks.meeting.mockResolvedValue({ data: null });
  if (state === "not-started") mocks.meeting.mockResolvedValue({ data: { organizer_id: "someone-else", daily_room_name: null } });
  expect(await startMeetingCall({ teamId, meetingId, consented: state !== "no-consent" })).toHaveProperty("error");
  expect(mocks.open).not.toHaveBeenCalled();
});

it("takes demo mode from the saved meeting even when the browser requests a demo", async () => {
  await endMeetingCall(input);
  expect(mocks.finish.mock.calls[0][0].isDemo).toBe(false);
  mocks.meeting.mockResolvedValue({ data: { organizer_id: "organizer", is_demo: true } });
  await endMeetingCall({ ...input, isDemo: false });
  expect(mocks.finish.mock.calls[1][0].isDemo).toBe(true);
});

it.each(["nonmember", "nonorganizer"])("blocks demo publication for a %s", async (role) => {
  if (role === "nonmember") mocks.access.mockResolvedValue(null);
  else mocks.meeting.mockResolvedValue({ data: { organizer_id: "another-person", is_demo: true } });
  expect((await endMeetingCall(input)).error).toBeTruthy();
  expect(mocks.finish).not.toHaveBeenCalled();
});
