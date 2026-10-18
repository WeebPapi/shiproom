import "server-only";
import { serverConfig } from "@/lib/server/config";

const DAILY = "https://api.daily.co/v1";

export type DailyRoom = { name: string; url: string; transcription: "daily" | "unavailable" };

function redact(text: string): string {
  return text.replace(/[A-Za-z0-9_\-]{24,}/g, "[redacted]").slice(0, 240);
}

async function daily(path: string, init: RequestInit = {}): Promise<Response> {
  const key = serverConfig.dailyApiKey();
  if (!key) throw new Error("Daily is not configured.");
  return fetch(`${DAILY}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(15_000),
  });
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown; info?: unknown };
    return redact([body.error, body.info].filter(Boolean).join(": ")) || `Daily returned ${response.status}.`;
  } catch {
    return `Daily returned ${response.status}.`;
  }
}

function roomFrom(
  body: { name?: unknown; url?: unknown; config?: { enable_transcription_storage?: boolean } },
  fallback: "daily" | "unavailable",
): DailyRoom | null {
  if (typeof body.name !== "string" || typeof body.url !== "string") return null;
  const flag = body.config?.enable_transcription_storage;
  const transcription = flag === true ? "daily" : flag === false ? "unavailable" : fallback;
  return { name: body.name, url: body.url, transcription };
}

/** Private room, reused by meeting id. Transcription storage is requested and reported honestly. */
export async function ensurePrivateRoom(meetingId: string, isDemo = false): Promise<DailyRoom | { error: string }> {
  const name = `sr${meetingId.replaceAll("-", "")}`;
  const existing = await daily(`/rooms/${encodeURIComponent(name)}`);
  if (existing.ok) {
    const room = roomFrom((await existing.json()) as { name?: string; url?: string; config?: { enable_transcription_storage?: boolean } }, "daily");
    if (room) return room;
  }
  const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60;
  const properties = {
    exp,
    enable_knocking: false,
    enable_screenshare: true,
    max_participants: 8,
    ...(isDemo ? {} : { enable_transcription_storage: true, auto_transcription_settings: { language: "en" } }),
  };
  let created = await daily("/rooms", { method: "POST", body: JSON.stringify({ name, privacy: "private", properties }) });
  let transcription: "daily" | "unavailable" = isDemo ? "unavailable" : "daily";
  if (!created.ok) {
    transcription = "unavailable";
    created = await daily("/rooms", {
      method: "POST",
      body: JSON.stringify({ name, privacy: "private", properties: { exp, enable_knocking: false, enable_screenshare: true, max_participants: 8 } }),
    });
  }
  if (!created.ok) return { error: await errorText(created) };
  const room = roomFrom((await created.json()) as { name?: string; url?: string; config?: { enable_transcription_storage?: boolean } }, transcription);
  return room ?? { error: "Daily did not return a room." };
}

/** Room-scoped token. Two hours, and it cannot join any other room. */
export async function createRoomToken(input: { roomName: string; userId: string; displayName: string; isOwner: boolean; transcribe: boolean }): Promise<{ token: string } | { error: string }> {
  const response = await daily("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        room_name: input.roomName,
        is_owner: input.isOwner,
        exp: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
        eject_at_token_exp: true,
        user_name: input.displayName.slice(0, 80) || "Shiproom",
        user_id: input.userId,
        auto_start_transcription: input.isOwner && input.transcribe,
      },
    }),
  });
  if (!response.ok) return { error: await errorText(response) };
  const body = (await response.json()) as { token?: unknown };
  if (typeof body.token !== "string" || !body.token) return { error: "Daily did not return a meeting token." };
  return { token: body.token };
}

export async function stopRoomTranscription(roomName: string): Promise<void> {
  await daily(`/rooms/${encodeURIComponent(roomName)}/transcription/stop`, { method: "POST", body: "{}" }).catch(() => undefined);
}

type TranscriptRow = { transcriptId?: string; status?: string; isVttAvailable?: boolean };

/** Polls Daily for a finished stored transcript. Does not claim success when the file is missing. */
export async function fetchStoredTranscript(roomName: string): Promise<{ id: string; vtt: string } | { empty: true } | { error: string }> {
  await stopRoomTranscription(roomName);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 3_000));
    const list = await daily(`/transcript?room_name=${encodeURIComponent(roomName)}&limit=10`);
    if (!list.ok) {
      const message = await errorText(list);
      if (list.status === 404 || /not enabled|payment|forbidden|transcription/i.test(message)) return { empty: true };
      return { error: message };
    }
    const body = (await list.json()) as { data?: TranscriptRow[] };
    const rows = body.data ?? [];
    const ready = rows.find((row) => row.status === "t_finished" && row.isVttAvailable && row.transcriptId);
    if (!ready?.transcriptId) {
      if (rows.some((row) => row.status === "t_in_progress")) continue;
      if (attempt === 4) return { empty: true };
      continue;
    }
    const link = await daily(`/transcript/${encodeURIComponent(ready.transcriptId)}/access-link`);
    if (!link.ok) return { error: await errorText(link) };
    const access = (await link.json()) as { download_link?: unknown };
    if (typeof access.download_link !== "string") return { error: "Daily did not return a transcript download." };
    const file = await fetch(access.download_link, { signal: AbortSignal.timeout(15_000) });
    if (!file.ok) return { error: "The stored Daily transcript could not be downloaded." };
    return { id: ready.transcriptId, vtt: await file.text() };
  }
  return { empty: true };
}
