import { afterEach, expect, it, vi } from "vitest";
import { ensurePrivateRoom } from "./daily";

vi.mock("server-only", () => ({}));
vi.mock("./config", () => ({ serverConfig: { dailyApiKey: () => "test-key" } }));
afterEach(() => vi.unstubAllGlobals());

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
