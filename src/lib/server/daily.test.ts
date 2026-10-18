import { afterEach, expect, it, vi } from "vitest";
import { ensurePrivateRoom, fetchStoredTranscript, getExistingRoom } from "./daily";

vi.mock("server-only", () => ({}));
vi.mock("./config", () => ({ serverConfig: { dailyApiKey: () => "test-key" } }));
afterEach(() => vi.unstubAllGlobals());

it.each([
  { status: 200, privacy: "private", demo: false, expected: { transcription: "daily" } },
  { status: 200, privacy: "private", demo: true, expected: { transcription: "unavailable" } },
  { status: 200, privacy: "public", demo: false, expected: { error: "This call is not configured for private access." } },
  { status: 404, privacy: "private", demo: false, expected: { error: "This call is no longer available. Ask the organizer to start a new huddle." } },
  { status: 500, privacy: "private", demo: false, expected: { error: "Daily returned 500." } },
])("reads an existing room without changing it ($status, $privacy, demo=$demo)", async ({ status, privacy, demo, expected }) => {
  const fetch = vi.fn(async () => Response.json({ name: "saved-room", url: "https://example.daily.co/saved-room", privacy, config: { enable_transcription_storage: true } }, { status }));
  vi.stubGlobal("fetch", fetch);
  expect(await getExistingRoom("saved-room", demo)).toMatchObject(expected);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]).toMatchObject(["https://api.daily.co/v1/rooms/saved-room", expect.not.objectContaining({ method: "POST" })]);
});

it("updates an existing room with Georgian Nova-3, separate keyterms, and streaming diarization", async () => {
  const room = { name: "srtest", url: "https://example.daily.co/srtest", config: { enable_transcription_storage: true } };
  const update = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    if (init.method === "POST") {
      const properties = JSON.parse(init.body).properties;
      expect(properties.enable_transcription_storage).toBe(true);
      const settings = properties.auto_transcription_settings;
      expect(settings).toMatchObject({ language: "ka", model: "nova-3", extra: { diarize_model: "latest" } });
      expect(settings.extra.keyterm).toContain("repository picker");
      expect(settings.extra.keyterm).toContain("რეპოზიტორია");
      expect(settings.extra.keyterm[0]).toBe("example/project");
      expect(new Set(settings.extra.keyterm.map((term: string) => term.toLowerCase())).size).toBe(settings.extra.keyterm.length);
      expect(Buffer.byteLength(settings.extra.keyterm.join(""))).toBeLessThanOrEqual(400);
      update();
    }
    return Response.json(room);
  }));
  expect(await ensurePrivateRoom("test", "ka", ["example/project", "GITHUB"])).toMatchObject({ transcription: "daily" });
  expect(update).toHaveBeenCalledOnce();
});

it("downloads this room's finished Daily transcript when the list omits isVttAvailable", async () => {
  const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nშევთანხმდით.\n";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = String(url);
    if (path.includes("/transcription/stop")) return new Response("{}", { status: 200 });
    if (path.endsWith("/rooms/srroom")) return Response.json({ id: "room-1", name: "srroom", url: "https://example.daily.co/srroom" });
    if (path.includes("/transcript/mine/access-link")) return Response.json({ download_link: "https://files.example/mine.vtt" });
    if (path.includes("/transcript?")) {
      return Response.json({
        data: [
          { transcriptId: "other", status: "t_finished", isVttAvailable: true, roomId: "room-other" },
          { transcriptId: "mine", status: "t_finished", roomId: "room-1" },
        ],
      });
    }
    if (path === "https://files.example/mine.vtt") return new Response(vtt);
    return Response.json({ error: path }, { status: 500 });
  }));
  expect(await fetchStoredTranscript("srroom")).toEqual({ id: "mine", vtt });
});
