import { beforeEach, expect, it, vi } from "vitest";
import { chooseMeetingContext } from "./meetings";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  meeting: vi.fn(),
  repo: vi.fn(),
  options: vi.fn(),
  adminUpdate: vi.fn(),
  finish: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ findMembership: mocks.access }));
vi.mock("@/lib/server/connections", () => ({ getLinearOptions: mocks.options }));
vi.mock("@/lib/server/publish-call", () => ({ finishMeetingCall: mocks.finish }));
vi.mock("next/navigation", () => ({ redirect: (...args: unknown[]) => mocks.redirect(...args) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: table === "team_repositories" ? mocks.repo : mocks.meeting,
      };
      return query;
    },
  }),
  createAdminClient: () => ({
    from: () => ({
      update: (row: unknown) => {
        mocks.adminUpdate(row);
        const query = {
          eq: () => query,
          then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
        };
        return query;
      },
    }),
  }),
}));

const teamId = "22222222-2222-4222-8222-222222222222";
const meetingId = "11111111-1111-4111-8111-111111111111";

function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  data.set("teamId", teamId);
  data.set("meetingId", meetingId);
  data.set("githubRepositoryId", extra.githubRepositoryId ?? "123");
  data.set("linearTeamId", extra.linearTeamId ?? "lin-team");
  data.set("linearProjectId", extra.linearProjectId ?? "lin-project");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ user: { id: "organizer" } });
  mocks.meeting.mockResolvedValue({ data: { organizer_id: "organizer", processing_status: "needs_context", is_demo: false, daily_room_name: "room" } });
  mocks.repo.mockResolvedValue({ data: { github_repository_id: "123" } });
  mocks.options.mockResolvedValue({
    status: "ready",
    teams: [{ id: "lin-team", name: "Shiproom", key: "SHI", projects: [{ id: "lin-project", name: "Shiproom Demo" }] }],
  });
  mocks.finish.mockResolvedValue({ error: null, tasks: [] });
});

it("saves selected context and resumes processing from the saved transcript", async () => {
  await chooseMeetingContext({}, form());
  expect(mocks.adminUpdate).toHaveBeenCalledWith(expect.objectContaining({
    github_repository_id: "123",
    linear_team_id: "lin-team",
    linear_project_id: "lin-project",
    github_repository_provenance: "user",
  }));
  expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({ meetingId, isDemo: false, roomName: "room" }));
  expect(mocks.redirect).toHaveBeenCalledWith(`/teams/${teamId}/meetings/${meetingId}`);
});

it("does not let a non-organizer choose context", async () => {
  mocks.meeting.mockResolvedValue({ data: { organizer_id: "someone-else", processing_status: "needs_context", is_demo: false } });
  expect(await chooseMeetingContext({}, form())).toMatchObject({ error: expect.stringContaining("organizer") });
  expect(mocks.adminUpdate).not.toHaveBeenCalled();
  expect(mocks.finish).not.toHaveBeenCalled();
});

it("rejects an empty destination instead of inferring", async () => {
  expect(await chooseMeetingContext({}, form({ githubRepositoryId: "", linearTeamId: "", linearProjectId: "" }))).toMatchObject({ error: "Choose a repository and Linear team." });
  expect(mocks.finish).not.toHaveBeenCalled();
});
