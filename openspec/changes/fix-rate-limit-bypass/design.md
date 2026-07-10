## Context

The `POST /v1/diagnose` handler in `src/backend/api/routes.ts` uses a two-phase rate-limiting pattern:

1. `rateLimiter.check(ip)` — Counts timestamps in the sliding window. Returns `{allowed: false}` if count >= `maxRequests`. Does NOT add a timestamp.
2. `rateLimiter.record(ip)` — Pushes a timestamp into the entry, incrementing the count.

A prior change ("production-hardening") moved `record(ip)` from before body parsing to after successful Zod validation (line 211). The intent was to avoid consuming rate-limit slots for malformed requests. However, this created a bypass: since `check()` only inspects existing timestamps and `record()` only runs on success, an attacker sending rapid invalid payloads will never accumulate timestamps. `check()` always returns `{allowed: true}` because `entry.timestamps.length` stays at 0.

Separately, the concurrent-workflow cap (`startWorkflow()` / `finishWorkflow()`) is correctly released on all early-exit paths (413, 400, validation failure). This cap limits concurrent LLM workloads but does not limit request rate.

## Goals / Non-Goals

**Goals:**
- Close the rate-limit bypass so all requests (valid or invalid) count against the per-IP limit
- Preserve the concurrent-workflow slot behavior (only held for jobs that actually start)
- Maintain backwards compatibility with existing rate-limit configuration

**Non-Goals:**
- Adding a separate "invalid request" rate limiter (unnecessary complexity; the single limiter suffices)
- Changing the concurrent-workflow cap logic (already correct)
- Implementing IP trust/proxy validation (separate issue)

## Decisions

### D1: Record immediately after check succeeds

**Decision:** Move `rateLimiter.record(ip)` from line 211 (after validation) to immediately after `rateLimiter.check(ip)` returns `{allowed: true}` (after line 131). Every request that passes the rate-limit check SHALL be counted, before body parsing or validation.

**Rationale:** The rate limiter's purpose is to prevent abuse — including abuse via malformed payloads. Counting only valid requests leaves the door wide open for DoS via invalid payloads. The original concern (malformed requests "wasting" rate-limit slots) is actually the desired behavior: a flood of malformed requests SHOULD be rate-limited.

**Alternatives considered:**
- Separate counter for invalid requests → Adds complexity; the single sliding-window limiter already handles this correctly once `record()` is moved.
- Record after body parsing but before validation → Still leaves invalid JSON uncounted. Recording after `check()` is the earliest correct point.

### D2: Concurrent-workflow slots remain unchanged

**Decision:** `startWorkflow()` and `finishWorkflow()` calls stay exactly where they are. `startWorkflow()` runs after validation passes (before the job is created). All early-exit paths (413, 400) call `finishWorkflow()` to release the slot.

**Rationale:** The concurrent-workflow cap protects server resources (LLM API calls, memory). It should only be held for requests that actually start a workflow. The per-IP rate limit and the concurrent-workflow cap serve different purposes and should operate independently.

## Risks / Trade-offs

- **[Valid requests squeezed out by attacker's invalid requests]** → An attacker could fill a victim's rate-limit window with invalid requests from a shared IP (NAT). **Mitigation:** This is the fundamental trade-off of per-IP rate limiting. The `RATE_LIMIT_MAX_REQUESTS` (default 10) and `RATE_LIMIT_WINDOW_MS` (default 60s) provide reasonable limits. For multi-tenant NAT, increase the limits.
- **[Existing test expectations reversed]** → The current `tests/api.test.ts` asserts that invalid requests do NOT increment the rate limit. These tests must be updated. **Mitigation:** Straightforward test update; the new behavior is more secure.
- **[Slight semantics change]** → Operators who tuned rate limits expecting only valid requests to count will see limits reached faster. **Mitigation:** Document the change; default limits are generous enough (10/min).

## Migration Plan

1. No env var or config changes needed.
2. Deploy: invalid requests now count against the rate limit immediately.
3. Rollback: Move `record(ip)` back to after validation (reopens the bypass).
