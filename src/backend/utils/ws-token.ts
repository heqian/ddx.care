import { createHmac, timingSafeEqual } from "node:crypto";
import { WS_TOKEN_SECRET, JOB_TTL_MS } from "../config";

const HEX_RE = /^[0-9a-f]+$/;

function generateCredential(jobId: string, ttlMs: number, now: number): string {
  if (!WS_TOKEN_SECRET) return "";
  const expiry = now + ttlMs;
  const payload = `${jobId}.${expiry}`;
  const hmac = createHmac("sha256", WS_TOKEN_SECRET)
    .update(payload)
    .digest("hex");
  return `${expiry}.${hmac}`;
}

function verifyCredential(
  jobId: string,
  credential: string,
  now: number,
): boolean {
  if (!WS_TOKEN_SECRET) return true;
  if (!credential) return false;
  const sep = credential.indexOf(".");
  if (sep <= 0 || sep !== credential.lastIndexOf(".")) return false;
  const expiryStr = credential.slice(0, sep);
  const hmacHex = credential.slice(sep + 1);
  // Validate length and ASCII hex before Buffer conversion so malformed Unicode cannot throw.
  if (!/^[0-9]+$/.test(expiryStr)) return false;
  if (hmacHex.length !== 64 || !HEX_RE.test(hmacHex)) return false;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry <= now) return false;
  const expected = createHmac("sha256", WS_TOKEN_SECRET)
    .update(`${jobId}.${expiryStr}`)
    .digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHex));
}

/**
 * Durable job capability token. Authenticates REST endpoints
 * (GET /v1/status, DELETE /v1/diagnose) and the /ws upgrade during migration.
 *
 * Format: `<expiryMs>.<hmacHex>` where `hmacHex = HMAC-SHA256(secret, "jobId.expiry")`.
 * The embedded expiry ties credential lifetime to job lifetime (JOB_TTL_MS by default).
 *
 * @param jobId Job identifier (UUID)
 * @param ttlMs Token lifetime in ms (defaults to JOB_TTL_MS)
 * @param now   Issuance time in ms (defaults to Date.now()); injectable for tests
 */
export function generateToken(
  jobId: string,
  ttlMs: number = JOB_TTL_MS,
  now: number = Date.now(),
): string {
  return generateCredential(jobId, ttlMs, now);
}

/**
 * Verify a durable job token. Returns true iff:
 *   - WS_TOKEN_SECRET is unset (dev mode), OR
 *   - The token parses as `<expiryMs>.<hmacHex>`, expiry is in the future,
 *     and the HMAC matches a timing-safe comparison.
 *
 * Rejects (returns false) on malformed structure, expired tokens, wrong
 * jobId, wrong secret, or malformed Unicode payloads — never throws.
 *
 * @param jobId Job identifier
 * @param token Candidate token string
 * @param now   Current time in ms (defaults to Date.now()); injectable for tests
 */
export function verifyToken(
  jobId: string,
  token: string,
  now: number = Date.now(),
): boolean {
  return verifyCredential(jobId, token, now);
}

/**
 * Short-lived, stateless WebSocket upgrade ticket. Bounds the window in which
 * a URL-borne /ws credential can be replayed (default 120s).
 *
 * Format: `<expiryMs>.<hmacHex>` where `hmacHex = HMAC-SHA256(secret, "jobId.expiry")`.
 * Identical structure to generateToken but with a short, independent TTL so
 * the two capabilities are not interchangeable.
 *
 * @param jobId  Job identifier (UUID)
 * @param ttlSec Ticket lifetime in seconds (default 120)
 * @param now    Issuance time in ms (defaults to Date.now()); injectable for tests
 */
export function generateWsTicket(
  jobId: string,
  ttlSec: number = 120,
  now: number = Date.now(),
): string {
  return generateCredential(jobId, ttlSec * 1000, now);
}

/**
 * Verify a short-lived WebSocket ticket. Returns true iff:
 *   - WS_TOKEN_SECRET is unset (dev mode), OR
 *   - The ticket parses as `<expiryMs>.<hmacHex>`, expiry is in the future,
 *     and the HMAC matches a timing-safe comparison for the given jobId.
 *
 * Never throws on malformed input; returns false instead.
 *
 * @param jobId  Job identifier expected to be bound into the ticket
 * @param ticket Candidate ticket string
 * @param now    Current time in ms (defaults to Date.now()); injectable for tests
 */
export function verifyWsTicket(
  jobId: string,
  ticket: string,
  now: number = Date.now(),
): boolean {
  return verifyCredential(jobId, ticket, now);
}
