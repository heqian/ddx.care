import { createHmac, timingSafeEqual } from "node:crypto";
import { WS_TOKEN_SECRET } from "../config";

export function generateToken(jobId: string): string {
  if (!WS_TOKEN_SECRET) return "";
  return createHmac("sha256", WS_TOKEN_SECRET).update(jobId).digest("hex");
}

export function verifyToken(jobId: string, token: string): boolean {
  if (!WS_TOKEN_SECRET) return true;
  const expected = generateToken(jobId);
  if (!expected || !token) return false;
  if (expected.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}
