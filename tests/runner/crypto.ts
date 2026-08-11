/**
 * Cryptographic helpers for the parent runner.
 *
 * The generated cache key is exactly 32 cryptographically random bytes
 * encoded as canonical unpadded base64url. It is never fixed, committed,
 * printed, or reused across children. Each value must match
 * `^[A-Za-z0-9_-]{43}$`, decode strictly back to 32 bytes, and pass the
 * production config validator.
 */

import { randomBytes } from "node:crypto";

const BASE64URL_RE = /^[A-Za-z0-9_-]{43}$/;

export function generateCacheKey(): string {
  const bytes = randomBytes(32);
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function isValidCacheKey(value: string): boolean {
  if (!BASE64URL_RE.test(value)) return false;
  // Strict decode and re-encode to reject noncanonical padding bits.
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length !== 32) return false;
    // Re-encode and require exact equality so noncanonical padding is rejected.
    return decoded.toString("base64url") === value;
  } catch {
    return false;
  }
}

/**
 * Generate a unique token secret for REST or WebSocket ticket suites.
 * Distinct per child process.
 */
export function generateTokenSecret(): string {
  return randomBytes(32).toString("base64url");
}
