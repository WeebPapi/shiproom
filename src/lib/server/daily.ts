import "server-only";
import { serverConfig } from "@/lib/server/config";
import { transcriptionOptions } from "@/lib/transcription";
import type { Language } from "@/lib/contracts";

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

/** Joining must not reconfigure a live room or create a replacement. */
export async function getExistingRoom(name: string, isDemo: boolean): Promise<DailyRoom | { error: string }> {
  const response = await daily(`/rooms/${encodeURIComponent(name)}`);
  if (response.status === 404) return { error: "This call is no longer available. Ask the organizer to start a new huddle." };
  if (!response.ok) return { error: await errorText(response) };
  const body = await response.json();
  if (body.privacy !== "private") return { error: "This call is not configured for private access." };
  const room = roomFrom(body, "unavailable");
  return room ? { ...room, transcription: isDemo ? "unavailable" : room.transcription } : { error: "Daily did not return a room." };
}

/** Private room, reused by meeting id. Transcription storage is requested and reported honestly. */
export async function ensurePrivateRoom(meetingId: string, language: Language, contextNames: string[], isDemo = false): Promise<DailyRoom | { error: string }> {
  const name = `sr${meetingId.replaceAll("-", "")}`;
  const settings = transcriptionOptions(language, contextNames);
  const existing = await daily(`/rooms/${encodeURIComponent(name)}`);
  if (existing.ok && isDemo) {
    const room = roomFrom(await existing.json(), "unavailable");
    if (room) return { ...room, transcription: "unavailable" };
  }
  if (existing.ok && !isDemo) {
    const updated = await daily(`/rooms/${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify({ properties: { enable_transcription_storage: true, auto_transcription_settings: settings } }) });
    if (!updated.ok) return { error: await errorText(updated) };
    const room = roomFrom(await updated.json(), "daily");
    if (room) return room;
  }
  const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60;
  const properties = {
    exp,
    enable_knocking: false,
    enable_screenshare: true,
    max_participants: 8,
    // Scripted demo takes use a fixed transcript, so Daily transcription is never requested.
    ...(isDemo ? {} : { enable_transcription_storage: true, auto_transcription_settings: settings }),
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
export async function createRoomToken(input: { roomName: string; userId: string; displayName: string; isOwner: boolean }): Promise<{ token: string } | { error: string }> {
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

type TranscriptRow = { transcriptId?: string; status?: string; isVttAvailable?: boolean; roomId?: string };

async function roomIdFor(name: string): Promise<string | null> {
  const response = await daily(`/rooms/${encodeURIComponent(name)}`);
  if (!response.ok) return null;
  const body = (await response.json()) as { id?: unknown };
  return typeof body.id === "string" ? body.id : null;
}

/** Polls Daily for a finished stored transcript. Does not claim success when the file is missing. */
export async function fetchStoredTranscript(roomName: string): Promise<{ id: string; vtt: string } | { empty: true } | { error: string }> {
  await stopRoomTranscription(roomName);
  const roomId = await roomIdFor(roomName);
  const query = roomId ? `roomId=${encodeURIComponent(roomId)}` : `room_name=${encodeURIComponent(roomName)}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 3_000));
    const list = await daily(`/transcript?${query}&limit=10`);
    if (!list.ok) {
      const message = await errorText(list);
      if (list.status === 404 || /not enabled|payment|forbidden|transcription/i.test(message)) return { empty: true };
      return { error: message };
    }
    const body = (await list.json()) as { data?: TranscriptRow[] };
    const rows = (body.data ?? []).filter((row) => !roomId || typeof row.roomId !== "string" || row.roomId === roomId);
    // Daily's documented t_finished list example omits isVttAvailable; only skip when it is explicitly false.
    const ready = rows.find((row) => row.status === "t_finished" && row.isVttAvailable !== false && row.transcriptId);
    if (!ready?.transcriptId) {
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
