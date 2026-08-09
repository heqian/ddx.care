## Why

Job bearer capabilities (HMAC tokens) currently travel in REST and WebSocket query strings and in result URL paths, making them eligible for Caddy access logs, browser history, sync, screenshots, and referrers. Status responses carrying PHI lack `Cache-Control: no-store`, so shared or intermediary caches could retain reports. Tokens have no embedded expiry; their only effective expiration is deletion of the job row. Anyone with log or history access can retrieve or cancel a PHI-bearing job until it is cleaned up.

## What Changes

- **REST token in Authorization header**: the frontend SHALL send the job token via an `Authorization: Bearer <token>` header for `GET /v1/status/:jobId` and `DELETE /v1/diagnose/:jobId`, not as a query parameter. The server SHALL accept the header and SHALL keep query-param support only as a dev fallback.
- **WebSocket short-lived ticket**: the server SHALL issue a short-lived, single-use WebSocket ticket exchangeable for the durable job capability. The `/ws` upgrade SHALL accept the ticket (short TTL) in preference to the long-lived HMAC, reducing the value and window of URL-borne secrets.
- **Remove tokens from result paths**: the frontend SHALL NOT place tokens in URL path segments. Result deep links SHALL use a separate, optional, short-lived share capability distinct from the read/cancel capability, and navigation SHALL use `replaceState` to avoid persisting capability URLs in history.
- **`Cache-Control: no-store` on job responses**: all `GET /v1/status/:jobId` and WebSocket-completion responses SHALL include `Cache-Control: no-store, private` so caches do not retain PHI-bearing payloads.
- **Caddy query redaction**: the Caddyfile SHALL redact `token` query parameters from access logs.
- **Token expiry**: the HMAC token format SHALL incorporate an issuance time and expiry, and `verifyToken` SHALL reject expired tokens.

## Capabilities

### New Capabilities

- `websocket-ticket-exchange`: Issues short-lived, single-use tickets for WebSocket upgrades so long-lived job capabilities are not exposed in WebSocket URLs.

### Modified Capabilities

- `rest-job-auth`: REST endpoints SHALL accept the token via `Authorization` header in addition to the query parameter, and status responses SHALL include `Cache-Control: no-store, private`.
- `ws-authentication`: WebSocket upgrade SHALL prefer the short-lived ticket; the long-lived HMAC SHALL be accepted only as a dev fallback and SHALL carry an expiry.
- `frontend-job-context-isolation`: The frontend SHALL NOT embed tokens in URL path segments and SHALL use `replaceState` for capability-bearing navigations.

## Impact

- **Backend**: `src/backend/api/routes.ts` (Authorization header parsing, Cache-Control), `src/backend/utils/ws-token.ts` (expiry, ticket issuance/verification), `src/backend/api/websocket.ts` (ticket validation), `Caddyfile` (log redaction).
- **Frontend**: `src/frontend/api/client.ts` (Authorization header), `src/frontend/hooks/useRouter.ts` (remove token from path), `src/frontend/hooks/useJobStream.ts` (ticket usage), `src/frontend/main.tsx` (replaceState).
- **Tests**: `tests/rest-token.test.ts`, `tests/websocket.test.ts`, `tests/ws-origin.test.ts`, `tests/api-client.test.ts`, E2E token-protected flows.
- **Documentation**: `AGENTS.md`, `.env.example`, `README.md` (token transport and expiry).