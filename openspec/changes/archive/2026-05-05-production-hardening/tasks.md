## 1. Configuration & Security Headers

- [x] 1.1 Add `TRUSTED_ORIGINS`, `WS_TOKEN_SECRET`, and `JOB_TTL_MS` env vars to `src/backend/config.ts` with defaults and validation
- [x] 1.2 Update `corsHeaders()` and `corsPreflightResponse()` in `src/backend/api/routes.ts` to add `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`; implement `TRUSTED_ORIGINS` validation logic that reflects the request's `Origin` if it matches the whitelist
- [x] 1.3 Update WebSocket origin validation in `src/backend/api/websocket.ts` to validate against `TRUSTED_ORIGINS` when set (falling back to `ALLOWED_ORIGINS` when not)
- [x] 1.4 Add `Strict-Transport-Security` header to `Caddyfile` and add structured `log` directive
- [x] 1.5 Update `.dockerignore` to include `.agents/`, `.claude/`, `.opencode/`, `tests/`, `*.sqlite`, `playwright.config.ts`

## 2. Prompt Injection Hardening

- [x] 2.1 Update `buildPatientSummary()` in `src/backend/workflows/diagnostic-workflow.ts` to wrap patient data in `<patient_data>...</patient_data>` boundary tags with guard instructions before and after
- [x] 2.2 Add input field truncation in `buildPatientSummary()` — truncate each field to `MAX_INPUT_FIELD_LENGTH` characters with `[Content truncated due to length limit]` suffix
- [x] 2.3 Add truncation step in the `POST /v1/diagnose` route handler after Zod validation, before passing data to the workflow (defensive layer)

## 3. WebSocket Authentication

- [x] 3.1 Create `src/backend/utils/ws-token.ts` with `generateToken(jobId)` and `verifyToken(jobId, token)` functions using HMAC-SHA256 with `WS_TOKEN_SECRET`
- [x] 3.2 Update `POST /v1/diagnose` response to include `token` field from `generateToken(jobId)`
- [x] 3.3 Update `/ws` route handler in `src/backend/api/routes.ts` to validate `token` query parameter when `WS_TOKEN_SECRET` is set; return 403 if invalid or missing
- [x] 3.4 Update frontend `DiagnoseResponse` type in `src/frontend/api/types.ts` to include `token: string`
- [x] 3.5 Update `src/frontend/main.tsx` to store the `token` from the submission response and pass it through to `WaitingRoom` and `useJobStream`
- [x] 3.6 Update `src/frontend/hooks/useJobStream.ts` to include `token` in WebSocket URL and in reconnection URLs

## 4. Rate Limit Fix

- [x] 4.1 Move `rateLimiter.record(ip)` call in `POST /v1/diagnose` handler from before body parsing to after successful Zod validation (after `parsed.success` check)
- [x] 4.2 Update the `tests/api.test.ts` to verify that malformed requests do not increment the rate limit counter

## 5. Job Lifecycle

- [x] 5.1 Change `JOB_TTL_MS` default from `30 * 60 * 1000` to `60 * 60 * 1000` in `src/backend/config.ts` and make it configurable via `JOB_TTL_MS` env var
- [x] 5.2 Add `markStalePending()` method to `JobStore` in `src/backend/progress-store.ts` that updates all `pending` jobs to `failed("Server restarted — job interrupted")`
- [x] 5.3 Call `progressStore.markStalePending()` in `index.ts` on startup before the server starts accepting connections
- [x] 5.4 Update `tests/progress-store.test.ts` to cover `markStalePending()`
- [x] 5.5 Add `paused` prop to `useAutoLogout` hook; when `paused` is true, reset and hold the timer; pause it in `App` when `route.screen === "waiting"`

## 6. Workflow Cancellation

- [x] 6.1 Create `src/backend/utils/abort-controller-store.ts` with a `Map<string, AbortController>` and exported `set`, `get`, `delete` functions
- [x] 6.2 Store the `AbortController` in the map when a workflow starts in the `POST /v1/diagnose` handler; remove it in the `.then()` and `.catch()` blocks
- [x] 6.3 Add `DELETE /v1/diagnose/:jobId` route handler that looks up the `AbortController`, aborts it, marks the job as failed, and calls `rateLimiter.finishWorkflow()`
- [x] 6.4 Add `cancelDiagnosis(jobId)` function to `src/frontend/api/client.ts`
- [x] 6.5 Update `WaitingRoom` component's Cancel button to call `cancelDiagnosis(jobId)` before navigating back; handle graceful failure

## 7. LLM Validation Retry

- [x] 7.1 In `diagnostic-workflow.ts`, when `diagnosisReportSchema.safeParse()` fails in the CMO decision loop, log the validation errors and attempt one retry with a correction prompt that includes the Zod error details; if retry also fails, fall back to raw object with a logged warning
- [x] 7.2 Same retry logic for `formatReport`'s final forced report generation (when `isFinal && finalReport` is not set after max rounds)
- [x] 7.3 Add test cases covering the retry path in `tests/workflow.test.ts`

## 8. Frontend Resilience

- [x] 8.1 Update `useJobStream.ts` reconnection logic: increase from 3 to 5 retries, widen backoff to 1s→2s→4s→8s→16s, and add pre-reconnect status check via `getJobStatus()`
- [x] 8.2 In `src/frontend/main.tsx`, handle `status === "failed"` in the deep-link fetch (`fetchDeepLink`) — show the error message and a "New Case" button instead of getting stuck at "Loading results..."

## 9. Testing

- [x] 9.1 Add tests for `TRUSTED_ORIGINS` CORS validation in `tests/api.test.ts`
- [x] 9.2 Add tests for WebSocket token authentication in `tests/ws-origin.test.ts`
- [x] 9.3 Add tests for `DELETE /v1/diagnose/:jobId` in `tests/api.test.ts`
- [x] 9.4 Add tests for `markStalePending()` in `tests/progress-store.test.ts`
- [x] 9.5 Add tests for rate-limit recording after validation in `tests/api.test.ts`
- [x] 9.6 Add tests for `buildPatientSummary()` boundary markers in `tests/workflow.test.ts`
- [x] 9.7 Add frontend test for `useAutoLogout` `paused` prop
- [x] 9.8 Run `bun run lint && bun run typecheck` to verify all changes

## 10. Documentation

- [x] 10.1 Update `AGENTS.md` with new environment variables (`TRUSTED_ORIGINS`, `WS_TOKEN_SECRET`, `JOB_TTL_MS`) and the `DELETE /v1/diagnose/:jobId` endpoint
- [x] 10.2 Update `Caddyfile` comments to document HSTS and structured logging changes
- [x] 10.3 Update `.env.example` with `TRUSTED_ORIGINS`, `WS_TOKEN_SECRET`, and `JOB_TTL_MS`