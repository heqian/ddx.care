/**
 * Token service factory.
 *
 * Produces a TokenService bound to an explicit secret and TTL, usable from
 * the injected route/WebSocket seams. Tests obtain valid, expired, and
 * cross-job credentials through these production primitives rather than a
 * test-local HMAC implementation.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const HEX_RE = /^[0-9a-f]+$/;

export interface TokenServiceOptions {
  secret: string;
  jobTtlMs: number;
  wsTicketTtlSec?: number;
}

export function createTokenService(opts: TokenServiceOptions): {
  generateToken(jobId: string, ttlMs?: number, now?: number): string;
  verifyToken(jobId: string, token: string, now?: number): boolean;
  generateWsTicket(jobId: string, ttlSec?: number, now?: number): string;
  verifyWsTicket(jobId: string, ticket: string, now?: number): boolean;
} {
  const { secret, jobTtlMs } = opts;
  const wsTicketTtlSec = opts.wsTicketTtlSec ?? 120;

  function sign(jobId: string, expiry: number): string {
    const payload = `${jobId}.${expiry}`;
    const hmac = createHmac("sha256", secret).update(payload).digest("hex");
    return `${expiry}.${hmac}`;
  }

  function verify(jobId: string, credential: string, now: number): boolean {
    if (!secret) return true;
    if (!credential) return false;
    const sep = credential.indexOf(".");
    if (sep <= 0 || sep !== credential.lastIndexOf(".")) return false;
    const expiryStr = credential.slice(0, sep);
    const hmacHex = credential.slice(sep + 1);
    if (!/^[0-9]+$/.test(expiryStr)) return false;
    if (hmacHex.length !== 64 || !HEX_RE.test(hmacHex)) return false;
    const expiry = Number(expiryStr);
    if (!Number.isFinite(expiry) || expiry <= now) return false;
    // Recompute the expected hmac hex (not the full credential string) and
    // compare the two 64-byte ASCII-hex buffers with timingSafeEqual.
    const payload = `${jobId}.${expiryStr}`;
    const expectedHex = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    return timingSafeEqual(Buffer.from(expectedHex), Buffer.from(hmacHex));
  }

  return {
    generateToken(jobId, ttlMs = jobTtlMs, now = Date.now()) {
      if (!secret) return "";
      return sign(jobId, now + ttlMs);
    },
    verifyToken(jobId, token, now = Date.now()) {
      return verify(jobId, token, now);
    },
    generateWsTicket(jobId, ttlSec = wsTicketTtlSec, now = Date.now()) {
      if (!secret) return "";
      return sign(jobId, now + ttlSec * 1000);
    },
    verifyWsTicket(jobId, ticket, now = Date.now()) {
      return verify(jobId, ticket, now);
    },
  };
}
