## Why

ddx.care runs behind a Caddy reverse proxy in production, but several security, reliability, and operational gaps remain: CORS/CSP are wide open (`ALLOWED_ORIGINS=*`), WebSocket progress events are unauthenticated (anyone with a job ID can observe diagnostic details), patient data in LLM prompts lacks structured injection boundaries, rate-limit slots are consumed by invalid requests, jobs expire too quickly for long-running workflows, stale jobs persist as "pending" after server restart, workflows cannot be cancelled by the client, and the inactivity timer fires during active diagnosis. These issues make the system unsuitable for production use behind Caddy.

## What Changes

- **Tighten CORS and security headers** — Replace wildcard `ALLOWED_ORIGINS` with a `TRUSTED_ORIGINS` env var (required in production). Add `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` response headers. Configure Caddy to send `Strict-Transport-Security`.
- **Harden prompt injection boundaries** — Wrap patient data in structured XML tags with explicit boundary markers and a stronger guard instruction. Enforce max-length truncation on all input fields before LLM ingestion.
- **Add HMAC-signed WebSocket authentication** — Generate a short-lived HMAC token when a diagnosis is submitted, require it on the `/ws` upgrade, and validate server-side. This prevents passive observation of progress events (which contain diagnostic reasoning and drug names) by anyone who guesses a job ID.
- **Fix rate-limit slot leakage** — Move `rateLimiter.record(ip)` call to after successful body parsing and validation, so malformed requests don't consume rate-limit slots.
- **Increase job TTL and handle restart** — Increase `JOB_TTL_MS` default from 30m to 60m. On server startup, mark all `pending` jobs as `failed("Server restarted")`.
- **Add workflow cancellation endpoint** — Add `DELETE /v1/diagnose/:jobId` that aborts the workflow's `AbortController`, marks the job as cancelled, and frees the concurrent-workflow slot.
- **Pause inactivity timer during diagnosis** — In `useAutoLogout`, accept a `paused` prop; pause the timer when the user is on the waiting screen.
- **Harden LLM output fallback** — When `diagnosisReportSchema.safeParse()` fails, retry once with an explicit correction prompt before falling back to the raw object. Log validation failure details.
- **Increase WebSocket reconnection resilience** — Increase retries from 3 to 5, widen backoff to 1s→2s→4s→8s→16s, and check job status before reconnecting.
- **Handle failed deep links** — In `main.tsx`, handle `failed` status on deep-link result fetch so users see the error instead of a stuck spinner.

## Capabilities

### New Capabilities
- `csp-tightening`: CORS origin whitelisting, security headers (X-Content-Type-Options, X-Frame-Options), and HSTS via Caddy
- `prompt-injection-hardening`: Structured patient data boundaries, stronger guard instructions, and max-length truncation before LLM ingestion
- `ws-authentication`: HMAC-signed tokens for WebSocket upgrade, preventing unauthorized progress observation
- `workflow-cancellation`: `DELETE /v1/diagnose/:jobId` endpoint that aborts running workflows and frees concurrency slots
- `job-lifecycle`: Increased job TTL, stale-job cleanup on server restart, and moved rate-limit recording past validation

### Modified Capabilities
- `tool-use-progress`: WebSocket reconnection resilience increased (5 retries, wider backoff, status check before reconnect)

## Impact

- **Backend API routes** (`src/backend/api/routes.ts`): New DELETE endpoint, CORS changes, security headers, rate-limit fix
- **Backend WebSocket** (`src/backend/api/websocket.ts`): HMAC token validation on upgrade
- **Backend workflow** (`src/backend/workflows/diagnostic-workflow.ts`): Prompt injection hardening, LLM validation retry, abort-on-cancel support
- **Backend progress store** (`src/backend/progress-store.ts`): Startup stale-job cleanup method
- **Backend config** (`src/backend/config.ts`): New `TRUSTED_ORIGINS`, `WS_TOKEN_SECRET`, `WS_TOKEN_TTL_MS` env vars; increased `JOB_TTL_MS` default
- **Frontend main** (`src/frontend/main.tsx`): Pause `useAutoLogout` on waiting screen; handle `failed` deep-link status
- **Frontend WS hook** (`src/frontend/hooks/useJobStream.ts`): Increased retries, wider backoff, pre-reconnect status check
- **Frontend API client** (`src/frontend/api/client.ts`): New `cancelDiagnosis` function
- **Caddyfile**: HSTS header, structured logging, request size limits
- **Dockerfile**: Pin Bun version, add non-root user, `HEALTHCHECK`
- **`.dockerignore`**: Add missing entries