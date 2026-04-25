# Tasks — Week of Apr 24, 2026

> Full project review conducted Apr 24 across 5 dimensions (code review, system design, frontend design, agent/Mastra, test coverage). All prior tasks are complete. Tasks ranked by impact and risk.

## P0 — Critical / Ship-Blocking

- [x] **Disable `development.hmr` in production** — `Bun.serve()` unconditionally sets `development: { hmr: true, console: true }`, enabling HMR overhead, verbose console, and HTML error pages that expose source snippets to clients in production. Gate on `NODE_ENV !== "production"`.

- [x] **Replace Caddyfile placeholder basic_auth hash** — The Caddyfile contains a literal `PLACEHOLDER_HASH_REPLACE_ME` string that won't authenticate anyone. The app would be publicly accessible on first deploy until a real bcrypt hash is substituted (via `caddy hash-password`).

## P1 — High Priority / Security

- [x] **Add explicit `X-Real-IP` header in Caddyfile** — Caddy doesn't set `X-Real-IP` by default (only `X-Forwarded-For`). The app's `getClientIp()` currently parses the rightmost `X-Forwarded-For` entry, which is fragile with CDN/load balancer chains. Add `header_up X-Real-IP {remote_host}` so the app has a single, reliable client IP source. Then switch `getClientIp()` to prefer `X-Real-IP` first, fall back to `server.requestIP()`.

- [x] **Standardize `MOCK_LLM` check to strict equality** — `validateConfig()` checks `process.env.MOCK_LLM === "1"` but the diagnostic workflow uses a truthy check (`if (process.env.MOCK_LLM)`). The inconsistency means `MOCK_LLM=0` passes config validation yet still triggers mock mode in the workflow. Change the workflow check to strict `=== "1"`.

## P2 — Medium Priority / Robustness

- [x] **Fix health check fragile magic-key SQLite lookup** — The `/v1/health` endpoint validates SQLite connectivity by looking up a magic job ID `__health__`. If a job with that ID is ever created (however unlikely), the health check would falsely report an error. Replace with a safe `SELECT 1` query.

- [x] **Add rate limiter max-entries cap** — The `RateLimiter.clients` Map only prunes every 10 minutes and has no size limit. A distributed DoS attack with unique IPs could exhaust memory with millions of entries before the prune interval fires. Add a configurable cap (e.g., 10K entries) that evicts the oldest entry when exceeded.

- [x] **Treat WebSocket close code 1005 as abnormal** — `useJobStream.ts` lists codes 1000 and 1005 as normal-close codes that don't trigger reconnection. But code 1005 ("No Status Received") occurs on server crashes or network drops — the server never sent a close frame. This means users get stuck on a dead progress screen with no reconnection attempt. Add code 1005 to the abnormal-close condition so the client retries or falls back to polling.

## P3 — Improvements / Quality

- [x] **Complete `.env.example` with all documented vars** — Currently missing: `ALLOWED_ORIGINS`, `LOG_FORMAT`, `AUDIT_LOG_PATH`, `AUDIT_LOG_MAX_SIZE_MB`, `AUDIT_LOG_MAX_FILES`, `DB_PATH`, `MAX_SPECIALIST_CONCURRENCY`, `AGENT_GENERATE_RETRY_BASE_DELAY`, `DIAGNOSIS_TIMEOUT_MS`, `NODE_ENV`. Add all documented environment variables with their defaults.

- [x] **Correct `getClientIp` X-Forwarded-For comment** — The comment in `routes.ts` states "The rightmost IP is the real client IP added by the immediate upstream proxy", which contradicts RFC 7239 (where `X-Forwarded-For: client, proxy1, proxy2` has the original client leftmost). The approach works for solo-Caddy (single entry), but the comment propagates a misunderstanding. Clarify the assumption: that with only Caddy in front, there is exactly one entry.
