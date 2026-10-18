import { beforeEach, expect, it, vi } from "vitest";
import { endMeetingCall } from "./call";

const mocks = vi.hoisted(() => ({ access: vi.fn(), meeting: vi.fn(), finish: vi.fn() }));
vi.mock("@/lib/contracts", () => import("../contracts"));
vi.mock("@/lib/server/auth", () => ({ findMembership: mocks.access }));
vi.mock("@/lib/server/config", () => ({ serverConfig: {} }));
vi.mock("@/lib/server/publish-call", () => ({ finishMeetingCall: mocks.finish }));
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
