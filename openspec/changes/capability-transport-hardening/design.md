## Context

Job capabilities currently travel in query strings (`src/frontend/api/client.ts:45-74`, `src/frontend/hooks/useJobStream.ts:17-22`) and result URL paths (`src/frontend/hooks/useRouter.ts:27-34`). Caddy logs request URIs without query redaction (`Caddyfile:40-43`). Status responses carry full reports and progress but lack `Cache-Control: no-store` (`src/backend/api/routes.ts:396-400`). Tokens are a deterministic HMAC of only the job ID with no expiry (`src/backend/utils/ws-token.ts:4-14`).

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Move REST credentials out of query strings into headers.
- Replace long-lived WebSocket URL credentials with short-lived, single-use tickets.
- Prevent capability URLs from persisting in browser history.
- Mark PHI-bearing responses non-cacheable.
- Redact Caddy access logs.
- Add token expiry tied to job lifetime.

**Non-Goals:**
- Replacing HMAC capabilities with full OIDC/user authentication (separate ADR).
- Eliminating all query parameters (the WebSocket handshake still needs `jobId` and a short-lived ticket).
- Changing the `WS_TOKEN_SECRET` mechanism itself.

## Decisions

### D1: Authorization header for REST, query as dev fallback

**Decision:** `verifyJobToken()` SHALL read the token from `Authorization: Bearer <token>` first, then fall back to `?token=` for dev compatibility. The frontend SHALL use the header.

**Rationale:** Headers are not logged by default in Caddy access logs and are not retained in browser history. Keeping the query fallback preserves dev ergonomics and the existing test harness during migration.

**Alternatives considered:**
- Header-only — breaks existing clients and tests abruptly; defer removal after migration.
- Custom header name — `Authorization` is standard and tooling understands it.

### D2: Short-lived signed WebSocket ticket

**Decision:** Issue `wsTicket = base64url(jobId || "." || expiry || "." || HMAC(jobId||expiry))` with a 120-second TTL. The `/ws` upgrade validates the ticket's HMAC and expiry. The long-lived `token` remains accepted for a migration period.

**Rationale:** A ticket in a URL is still observable, but its 120-second single-use window makes stolen tickets useless for replay. Stateless signing avoids adding a ticket store and the write contention it would create on every WS connect.

**Alternatives considered:**
- Server-side ticket store with single-use marking — stronger single-use guarantee but adds write contention on every connection; the short TTL already bounds replay value.
- One-time-use opaque token in SQLite — same drawback.

### D3: Token expiry embedded in the HMAC payload

**Decision:** `generateToken(jobId)` SHALL sign `jobId || "." || expiry` where `expiry = now + JOB_TTL_MS`. `verifyToken` SHALL parse the expiry, reject past expiry, and then compare HMACs.

**Rationale:** Ties credential lifetime to data lifetime without a separate store. Aligns token invalidation with job cleanup.

**Alternatives considered:**
- Fixed short TTL independent of job TTL — would force reconnects during long-running legitimate access; job-relative expiry is more ergonomic.

### D4: replaceState for capability routes

**Decision:** `useRouter.navigate()` SHALL use `pushState` for clean routes and `replaceState` for any route carrying a capability in state, so the capability URL is not retained in history. Result deep links SHALL use a separate short-lived share capability, not the read/cancel token.

**Rationale:** `pushState` entries persist in history and browser sync; `replaceState` avoids leaving the credential URL reachable via back navigation.

### D5: Cache-Control on job responses

**Decision:** Add `Cache-Control: no-store, private` to `GET /v1/status/:jobId` and to WebSocket completion payloads (via response headers on the upgrade response).

**Rationale:** Status responses contain full reports and progress. Without `no-store`, a shared or intermediary cache could serve a report to a different caller.

### D6: Caddy query redaction

**Decision:** Add a Caddy log directive that redacts `token` and `ticket` query parameters (e.g., replace with `REDACTED`).

**Rationale:** Defense-in-depth until header transport is the only path; even then, `jobId` in logs is acceptable but credentials are not.

## Risks / Trade-offs

- **[Query-param fallback extends the leak surface during migration]** → The fallback keeps existing clients working but still allows query-param logging. **Mitigation:** Caddy redaction (D6) covers the fallback; remove the fallback after the frontend ships header transport and a migration window elapses.
- **[Stateless ticket is technically replayable within its TTL]** → Without a server-side store, the same ticket could be used twice within 120 seconds. **Mitigation:** The short TTL and single WebSocket per job in practice bound this; add a server-side store only if abuse is observed.
- **[Token expiry breaks long-running polling]** → A token expiring mid-poll would 403 the client. **Mitigation:** Expiry matches `JOB_TTL_MS`, so the token is valid as long as the job exists; the client re-fetches a token only by resubmitting, which is the intended recovery for a stale job.

## Migration Plan

1. Deploy backend with header support, ticket issuance, expiry, and Caddy redaction; the query fallback keeps existing clients working.
2. Deploy frontend using `Authorization` header and `wsTicket`; use `replaceState` for capability routes.
3. After one release, remove the long-lived `token` query acceptance on `/ws` and the REST query fallback.
4. Rollback: revert frontend to query transport and backend to query-only; Caddy redaction and `no-store` are safe to keep.

## Open Questions

- Should the WebSocket ticket be passed via a header instead of a query parameter to avoid all URL logging? (Leaning: browsers cannot set headers on WebSocket upgrades, so a query ticket is the pragmatic choice; Caddy redaction covers it.)
- Should the separate share capability be implemented in this change or deferred? (Leaning: defer share capability; this change only removes the token from result paths and uses `replaceState`.)