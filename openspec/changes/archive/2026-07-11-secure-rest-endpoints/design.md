## Context

ddx.care already implements HMAC-SHA256 token authentication for WebSocket connections (`/ws?jobId=...&token=...`). The `generateToken(jobId)` and `verifyToken(jobId, token)` functions in `src/backend/utils/ws-token.ts` use `WS_TOKEN_SECRET` as the signing key. When `WS_TOKEN_SECRET` is empty, the system operates in dev mode and skips token verification.

The critical gap: the REST endpoints `GET /v1/status/:jobId` and `DELETE /v1/diagnose/:jobId` return full diagnosis results (PHI-derived) and can cancel running jobs — with **no token verification**. While job IDs are UUIDv4 (hard to guess), they leak through browser history, shared URLs, server logs, referrer headers, and WebSocket replay. This is an IDOR vulnerability.

The frontend already has the token (returned in the `POST /v1/diagnose` response and used for WebSocket). It just needs to forward it on REST calls too.

## Goals / Non-Goals

**Goals:**
- Extend the existing HMAC token mechanism to cover `GET /v1/status/:jobId` and `DELETE /v1/diagnose/:jobId`
- Maintain backwards compatibility in dev mode (no `WS_TOKEN_SECRET` = no token required)
- Support deep-linking to results with an embedded token
- Keep the implementation simple by reusing `verifyToken()` infrastructure

**Non-Goals:**
- User accounts or session-based authentication (system remains behind Caddy basic_auth)
- Token expiration/rotation (the existing HMAC tokens have no TTL by design — they're job-scoped)
- Encrypting response payloads (TLS via Caddy handles transport security)
- Changing the WebSocket auth pattern (already secured)

## Decisions

### D1: Token passed as query parameter, not header

**Decision:** Accept the token via a `token` query parameter on both REST endpoints, mirroring the existing `/ws?token=...` pattern.

**Rationale:** Consistency with the WebSocket approach. Query parameters work for all HTTP methods (GET, DELETE) without custom header handling. The frontend API client can append `?token=...` uniformly.

**Alternatives considered:**
- `Authorization: Bearer <token>` header → More conventional for REST, but diverges from the existing `/ws` pattern, requiring two code paths. Also complicates deep-linking (URLs can't carry headers).
- Custom `X-Job-Token` header → Same drawbacks as Bearer.

### D2: Deep-link token embedded in hash route

**Decision:** Extend the hash route format from `#/results/:jobId` to `#/results/:jobId/:token`. The `useRouter` hook parses both segments. `main.tsx` passes the token to `fetchDeepLink()`.

**Rationale:** Hash routes aren't sent to the server, so the token stays client-side. This enables sharing a direct results link with embedded auth. If no token is present in the route (old-format links), the fetch fails with 403 and the UI shows an appropriate error.

**Alternatives considered:**
- Store token in `sessionStorage` only → Breaks deep-linking entirely (can't load results from a fresh browser session).
- Token in query string (`?token=...`) → Sent to the server in access logs; hash route is cleaner.

### D3: Dev mode skip — consistent with WebSocket

**Decision:** When `WS_TOKEN_SECRET` is empty, both REST endpoints skip token verification, exactly as `/ws` does today. The `verifyToken()` function already returns `true` when the secret is empty.

**Rationale:** Preserves the zero-config developer experience. Production deployments set `WS_TOKEN_SECRET` and get full coverage.

### D4: 404 takes precedence over 403

**Decision:** Job ID format validation (regex) runs first (400 on invalid format). Then token verification (403 on invalid token). Then job existence lookup (404 if not found). This order prevents token-guessing oracle attacks — a caller learns nothing about whether a job exists without a valid token.

**Rationale:** If existence check ran before token check, an attacker could enumerate job IDs by observing 404 vs 403 responses. Checking the token first ensures only authenticated callers learn the job's status.

## Risks / Trade-offs

- **[Token in URL → server logs]** → The token appears in query strings, which may be logged by Caddy or Bun's access logging. **Mitigation:** The token is job-scoped and useless for any other job. Caddy's log format can be configured to redact query params if needed. The token has no standalone value (it only authenticates one specific job ID).
- **[Deep-link token expiry]** → If the job is cleaned up (60-min TTL), the token is also invalid. **Mitigation:** The UI already handles 404 for expired jobs; the same path applies.
- **[Breaking existing deep-links]** → Old `#/results/:jobId` links without a token will get 403 in production. **Mitigation:** In dev mode (`WS_TOKEN_SECRET` empty), old links still work. In production, this is the desired security behavior — show a "link expired" message.
- **[Frontend polling fallback]** → The HTTP polling path in `useJobStream` must also carry the token. **Mitigation:** The hook already receives the token; pass it through to `getJobStatus()`.

## Migration Plan

1. Deploy with `WS_TOKEN_SECRET` already set (existing requirement for WS auth).
2. Frontend changes are backwards-compatible — the token is always available from the submission response.
3. Deep-link format change is additive: `#/results/:jobId/:token` is new; old `#/results/:jobId` links still work in dev mode.
4. Rollback: Set `WS_TOKEN_SECRET=""` to disable token verification on all endpoints (dev mode).

## Open Questions

- Should the `/v1/health` and `/v1/agents` endpoints also require tokens? (Leaning: No — these contain no PHI and are needed for the consent gate / agent grid before submission.)
