import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

const key = randomBytes(32).toString("base64");

describe("credential encryption", () => {
  it("round-trips and binds ciphertext to its associated data", () => {
    const envelope = encryptSecret("lin_oauth_example", key, "team-1:linear");
    expect(envelope).not.toContain("lin_oauth_example");
    expect(decryptSecret(envelope, key, "team-1:linear")).toBe("lin_oauth_example");
    expect(() => decryptSecret(envelope, key, "team-2:linear")).toThrow();
  });

  it("rejects tampering and wrong keys", () => {
    const envelope = encryptSecret("secret", key, "a");
    const [v, iv, tag, ct] = envelope.split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64url")].join("."), key, "a")).toThrow();
    expect(() => decryptSecret(envelope, randomBytes(32).toString("base64"), "a")).toThrow();
    expect(() => encryptSecret("x", randomBytes(16).toString("base64"), "a")).toThrow(/32 bytes/);
  });
});
