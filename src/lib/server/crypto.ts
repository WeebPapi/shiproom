import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Envelope: v1.<iv>.<auth tag>.<ciphertext>, base64url parts, AES-256-GCM.
// The associated data binds a ciphertext to its team/provider so rows cannot be swapped.
// shortcut: single key, no rotation; add a key id to the envelope before rotating keys.
const VERSION = "v1";

function parseKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be base64-encoded 32 bytes.");
  return key;
}

export function encryptSecret(plaintext: string, base64Key: string, associatedData: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", parseKey(base64Key), iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(envelope: string, base64Key: string, associatedData: string): string {
  const [version, iv, tag, ciphertext] = envelope.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error("Unsupported credential envelope.");
  const decipher = createDecipheriv("aes-256-gcm", parseKey(base64Key), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
