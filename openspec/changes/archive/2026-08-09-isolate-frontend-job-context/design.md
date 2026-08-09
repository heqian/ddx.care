## Context

The application keeps one global result, one token, one last request payload, and hook-local stream state. Routes identify jobs, but state is neither keyed nor reconciled against the route. Waiting routes omit credentials, result routes embed credentials in paths, and asynchronous fetches are not cancelled when navigation changes.

## Goals / Non-Goals

**Goals:**
- Make job identity the boundary for all client state transitions.
- Recover authenticated waiting and result state after a same-session refresh.
- Prevent stale responses and history navigation from mixing cases.
- Remove capability values from browser-visible paths.

**Non-Goals:**
- Supporting public share links.
- Persisting complete reports, progress logs, or patient payloads in browser storage.
- Replacing backend HMAC capabilities with user accounts.
- Preserving legacy token-bearing result URLs after deployment.

## Decisions

### 1. Use a job-keyed reducer as the in-memory source of truth

Introduce a `JobContext` map keyed by job ID. Each context owns its token, in-memory retry payload, stream generation, status, progress, error, and result. Reducer transitions enforce that terminal states cannot regress to pending.

This is preferable to adding more parallel global state because identity checks become mandatory at the transition boundary.

### 2. Persist only recovery credentials

Session storage contains a versioned map of `{jobId, token, expiresAt}`. It does not persist patient input, retry payloads, progress, or reports. Expiry uses the server's job-retention expectation with a conservative client maximum. Reset, cancellation, terminal expiry, and inactivity purge remove entries.

### 3. Keep routes capability-free

Waiting and result paths use `/waiting/:jobId` and `/results/:jobId`. The route looks up the token from the session credential store. A route without a valid credential shows an authorization-expired state. Public deep-link sharing is explicitly unsupported.

### 4. Scope asynchronous work by job and generation

Every status request carries an AbortSignal and captures a per-job stream generation. Cleanup aborts obsolete requests and timers. Responses update only their own job context and only when their generation is current. Polling uses serialized recursive timeouts rather than overlapping intervals.

### 5. Treat submission and retry response as one identity transaction

The response's job ID and token are stored together before navigation. A retry creates a fresh context and never reuses the previous token or terminal state. While retry is pending, its action is disabled rather than repurposed as Cancel.

### 6. Derive rendering from route-selected context

The page selects `jobs[route.jobId]`. Results render only if that context has a matching completed result. Back and forward navigation simply changes the selected context or starts authenticated recovery for that job.

## Risks / Trade-offs

- [Session storage exposes tokens to same-origin script] -> Existing tokens are already held by the SPA; minimize stored fields, enforce CSP, and clear aggressively.
- [No shareable result links] -> This is safer for a capability-protected research demo; design a separate scoped share token if sharing becomes a requirement.
- [In-memory retry payload is lost on refresh] -> Resuming status remains supported; retry after refresh requires re-entering the case rather than persisting PHI.
- [Existing token-bearing history entries remain] -> New navigation replaces the active entry and never creates new token paths; ephemeral old entries age out with the browser session.

## Migration Plan

1. Add the versioned credential store and job reducer with unit tests.
2. Refactor submission, retry, and streaming to dispatch job-scoped transitions.
3. Change routes to job-ID-only paths and branch rendering through route-selected context.
4. Add cleanup for reset, inactivity, cancellation, and expiry.
5. Add token-enabled navigation and stale-response E2E tests.
6. Deploy frontend and backend compatibility together; no server data migration is required.
