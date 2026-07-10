## 1. Backend Token Verification

- [ ] 1.1 In `GET /v1/status/:jobId` handler (`src/backend/api/routes.ts`), add token verification: read `token` from query params, call `verifyToken(jobId, token)` when `WS_TOKEN_SECRET` is set, return 403 on failure. Place the check before the job existence lookup.
- [ ] 1.2 In `DELETE /v1/diagnose/:jobId` handler (`src/backend/api/routes.ts`), add the same token verification before the abort/cancel logic, returning 403 on failure.
- [ ] 1.3 Verify the `JOB_ID_RE` format check still runs first (400 on malformed IDs), then token check (403), then existence lookup (404) — confirming the ordering prevents enumeration.

## 2. Frontend API Client

- [ ] 2.1 Update `getJobStatus(jobId, token?)` in `src/frontend/api/client.ts` to accept an optional `token` and append `?token=...` to the status URL when provided.
- [ ] 2.2 Update `cancelDiagnosis(jobId, token?)` in `src/frontend/api/client.ts` to accept an optional `token` and append `?token=...` to the DELETE URL when provided.

## 3. Frontend Hooks & Routing

- [ ] 3.1 Update `useJobStream.ts` to pass the stored `token` to `getJobStatus()` in the HTTP polling fallback path.
- [ ] 3.2 Update `useRouter.ts` to parse the token segment from deep-link routes (`#/results/:jobId/:token`).
- [ ] 3.3 Update `main.tsx` `fetchDeepLink()` to accept and forward the token from the route to `getJobStatus()`; handle 403 response by showing a "link expired or unauthorized" message.
- [ ] 3.4 Update `WaitingRoom.tsx` Cancel button handler to pass the token to `cancelDiagnosis()`.

## 4. Testing

- [ ] 4.1 Add tests in `tests/api.test.ts` for `GET /v1/status/:jobId`: valid token returns 200, missing token returns 403, invalid token returns 403, token verified before existence (403 not 404 for unknown job).
- [ ] 4.2 Add tests in `tests/api.test.ts` for `DELETE /v1/diagnose/:jobId`: valid token cancels, missing/invalid token returns 403.
- [ ] 4.3 Add tests verifying dev mode (no `WS_TOKEN_SECRET`) still works without tokens on both endpoints.
- [ ] 4.4 Update `tests/api-client.test.ts` to verify `getJobStatus()` and `cancelDiagnosis()` append the token query parameter.
- [ ] 4.5 Run `bun run lint && bun run typecheck && bun run test` to verify all changes.

## 5. Documentation

- [ ] 5.1 Update `AGENTS.md` route documentation to note token requirement on `GET /v1/status/:jobId` and `DELETE /v1/diagnose/:jobId`.
- [ ] 5.2 Update `.env.example` comments for `WS_TOKEN_SECRET` to mention it secures REST endpoints, not just WebSocket.
