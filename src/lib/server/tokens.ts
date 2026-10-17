import { createHash, randomBytes } from "node:crypto";

/** 256-bit URL-safe random token (43 chars). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Must match public.accept_invitation: encode(sha256(convert_to(token, 'UTF8')), 'hex'). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
