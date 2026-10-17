import { describe, expect, it } from "vitest";
import { zonedLocalToUtc } from "./time";

describe("zonedLocalToUtc", () => {
  it("converts fixed-offset and DST zones to absolute instants", () => {
    expect(zonedLocalToUtc("2026-10-17T17:30", "Asia/Tbilisi").toISOString()).toBe("2026-10-17T13:30:00.000Z");
    expect(zonedLocalToUtc("2026-07-01T09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedLocalToUtc("2026-12-01T09:00", "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });

  it("moves a time inside a spring-forward gap past the gap", () => {
    expect(zonedLocalToUtc("2026-03-08T02:30", "America/New_York").toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("rejects invalid input", () => {
    expect(() => zonedLocalToUtc("2026-10-17 17:30", "UTC")).toThrow(RangeError);
    expect(() => zonedLocalToUtc("2026-10-17T17:30", "Mars/Olympus")).toThrow(RangeError);
  });
});
