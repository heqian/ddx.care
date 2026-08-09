## 1. Token Expiry and Ticket Primitives

- [x] 1.1 Update `src/backend/utils/ws-token.ts` `generateToken` to sign `jobId.expiry` with `expiry = now + JOB_TTL_MS`; update `verifyToken` to parse and reject expired tokens while preserving timing-safe comparison
- [x] 1.2 Add `generateWsTicket(jobId, ttlSec)` and `verifyWsTicket(jobId, ticket)` with a 120-second default TTL and HMAC validation
- [x] 1.3 Fix the malformed-Unicode `RangeError` by requiring exactly 64 ASCII hex characters before `timingSafeEqual`

## 2. REST Authorization Header and Cache-Control

- [x] 2.1 Update `verifyJobToken()` in `src/backend/api/routes.ts` to read `Authorization: Bearer <token>` first, then fall back to `?token=`
- [x] 2.2 Add `Cache-Control: no-store, private` to `GET /v1/status/:jobId` responses via `withCors`
- [x] 2.3 Include `wsTicket` in the `POST /v1/diagnose` 202 response alongside `token`

## 3. WebSocket Ticket Upgrade

- [x] 3.1 Update the `/ws` GET handler to prefer `ticket` validation, falling back to `token` during migration and dev mode
- [x] 3.2 Reject expired tickets with `403 Forbidden`; log rejection without the ticket value

## 4. Frontend Transport

- [x] 4.1 Update `src/frontend/api/client.ts` `getJobStatus` and `cancelDiagnosis` to send `Authorization: Bearer <token>` and stop putting the token in the URL
- [x] 4.2 Update `src/frontend/hooks/useJobStream.ts` to use `wsTicket` for the WebSocket URL
- [x] 4.3 Update `src/frontend/hooks/useRouter.ts` to remove token from result path segments and use `replaceState` for capability-bearing navigations
- [x] 4.4 Update `src/frontend/main.tsx` to thread `wsTicket` from submission through to the WaitingRoom

## 5. Caddy Log Redaction

- [x] 5.1 Update `Caddyfile` to redact `token` and `ticket` query parameters from access logs

## 6. Tests

- [x] 6.1 Extend `tests/rest-token.test.ts` to cover `Authorization` header acceptance, expired token rejection, and `Cache-Control: no-store` presence
- [x] 6.2 Add WebSocket ticket tests: valid ticket within TTL, expired ticket rejected, dev mode open
- [x] 6.3 Add a malformed-Unicode token test asserting a 403 (not 500) response
- [x] 6.4 Update `tests/api-client.test.ts` to assert the frontend sends `Authorization` headers and does not put tokens in URLs
- [x] 6.5 Add E2E coverage for waiting-page refresh, retry, and cancel under `WS_TOKEN_SECRET`

## 7. Documentation and Verification

- [x] 7.1 Update `AGENTS.md`, `.env.example`, and `README.md` with header transport, ticket TTL, token expiry, and Caddy redaction
- [x] 7.2 Run `bun run lint`, `bun run typecheck`, and `bun run test`
- [x] 7.3 Run `bun run test:rest-token` and E2E with `WS_TOKEN_SECRET` set