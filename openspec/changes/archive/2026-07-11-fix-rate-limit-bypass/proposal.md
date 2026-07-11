## Why

The `POST /v1/diagnose` handler calls `rateLimiter.check(ip)` (which inspects existing timestamps but does NOT add one) and only calls `rateLimiter.record(ip)` after successful Zod validation. This means an attacker can send unlimited malformed payloads (invalid JSON, schema failures, oversized bodies) that always pass `check()` — because no timestamps are ever recorded — completely bypassing the per-IP rate limit. Only the concurrent-workflow cap (which is released immediately on validation failure) provides any throttling. This is a DoS vector that allows unbounded request volume from a single IP.

## What Changes

- **Move `rateLimiter.record(ip)` to immediately after `check()` succeeds** — Every request that passes the rate-limit check SHALL be counted, regardless of whether it later fails body parsing or validation. This ensures invalid payloads still consume rate-limit slots.
- **Keep concurrent-workflow slot management as-is** — `startWorkflow()` still only runs when a job is actually created; `finishWorkflow()` is called on all early-exit paths. Only the per-IP request counter changes.
- **Update the job-lifecycle spec** — The existing spec says "malformed requests do not consume rate-limit slots." This requirement is being reversed: malformed requests SHALL consume rate-limit slots to prevent bypass.
- **Add tests for the bypass scenario** — Verify that repeated invalid payloads eventually trigger 429.

## Capabilities

### New Capabilities

(None)

### Modified Capabilities

- `job-lifecycle`: Rate limit recording moved to immediately after `check()` succeeds (before body parsing), so all accepted requests count regardless of payload validity

## Impact

- **Backend API routes** (`src/backend/api/routes.ts`): Move `rateLimiter.record(ip)` from after Zod validation to immediately after `rateLimiter.check(ip)` succeeds
- **Tests** (`tests/api.test.ts`): Update existing rate-limit tests (which assert invalid requests DON'T count) and add tests verifying the bypass is closed (invalid requests DO count)
- **Specs** (`openspec/specs/job-lifecycle/spec.md`): Reverse the "Rate limit recording moved after validation" requirement
