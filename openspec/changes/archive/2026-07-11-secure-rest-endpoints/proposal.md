## Why

The HMAC token mechanism already secures WebSocket connections (`/ws`) against unauthorized access, but the REST endpoints `GET /v1/status/:jobId` and `DELETE /v1/diagnose/:jobId` perform **no token verification**. Anyone who obtains a UUID job ID (from logs, shared URLs, browser history, referrer headers) can retrieve the full diagnosis report — including patient summary, specialist findings, and ranked diagnoses, all PHI-derived — or cancel another user's running diagnosis. This is an IDOR (Insecure Direct Object Reference) vulnerability that defeats the WebSocket authentication already in place.

## What Changes

- **Require HMAC token on `GET /v1/status/:jobId`** — Accept the token as a `token` query parameter (mirroring the `/ws` pattern). When `WS_TOKEN_SECRET` is set, verify the token with `verifyToken(jobId, token)`; reject with `403 Forbidden` on missing/invalid tokens.
- **Require HMAC token on `DELETE /v1/diagnose/:jobId`** — Same token verification as above; reject with `403 Forbidden` on missing/invalid tokens.
- **Frontend API client passes token** — Update `getJobStatus()` and `cancelDiagnosis()` in `src/frontend/api/client.ts` to accept and forward the `token` parameter.
- **Frontend stores and passes token for polling** — `useJobStream.ts` already has the token for WebSocket; extend it to pass the token to the HTTP polling fallback (`getJobStatus()`).
- **Deep-link support** — `main.tsx` `fetchDeepLink()` needs the token to load results from a shared URL. The token will be embedded in the hash route alongside the jobId (e.g. `#/results/:jobId/:token`).
- **Dev mode unchanged** — When `WS_TOKEN_SECRET` is empty (dev mode), tokens are not required, preserving the current developer experience.

## Capabilities

### New Capabilities

- `rest-job-auth`: HMAC token verification on all job-scoped REST endpoints (`GET /v1/status/:jobId`, `DELETE /v1/diagnose/:jobId`), reusing the existing `ws-token` infrastructure

### Modified Capabilities

- `ws-authentication`: Token is now also consumed by REST endpoints and the HTTP polling fallback, not just WebSocket connections

## Impact

- **Backend API routes** (`src/backend/api/routes.ts`): Add `verifyToken()` call in `GET /v1/status/:jobId` and `DELETE /v1/diagnose/:jobId` handlers
- **Frontend API client** (`src/frontend/api/client.ts`): `getJobStatus()` and `cancelDiagnosis()` accept optional `token` parameter
- **Frontend hooks** (`src/frontend/hooks/useJobStream.ts`): Pass token to polling fallback
- **Frontend router/main** (`src/frontend/main.tsx`, `src/frontend/hooks/useRouter.ts`): Parse token from deep-link route; pass to status fetches
- **Tests** (`tests/api.test.ts`, `tests/ws-origin.test.ts`, `tests/api-client.test.ts`): Add token verification coverage for REST endpoints
