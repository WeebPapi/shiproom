export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function offsetMs(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * Converts a wall-clock "YYYY-MM-DDTHH:mm" in an IANA zone to an absolute instant.
 * Times inside a DST gap resolve forward by the gap length.
 */
export function zonedLocalToUtc(local: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match || !isValidTimeZone(timeZone)) throw new RangeError("Invalid local time or time zone.");
  const [, y, mo, d, h, mi] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const before = offsetMs(wall, timeZone);
  const first = wall - before;
  const after = offsetMs(first, timeZone);
  if (after === before) return new Date(first);
  const second = wall - after;
  // If the second candidate does not round-trip, the wall time is in a gap; keep the forward one.
  return new Date(offsetMs(second, timeZone) === after ? second : first);
}

export function formatInZone(instant: string | Date, timeZone: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(instant));
}
