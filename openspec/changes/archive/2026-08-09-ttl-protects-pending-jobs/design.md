## Context

`cleanupExpired()` in `src/backend/progress-store.ts:177-180` selects rows purely by `createdAt < cutoff` with no status filter, so a pending job can be deleted while its workflow is still running. The scrub statement at line 90-92 nulls `result` and resets `progress` but leaves `error` intact, so PHI-derived provider messages persist. `JOB_TTL_MS` and `DIAGNOSIS_TIMEOUT_MS` are independently configurable (`src/backend/config.ts:5-22`), and documentation even recommends a 5-minute TTL for sensitive deployments (`AGENTS.md:241-245`), which is shorter than the 15-minute workflow timeout. Startup runs `markStalePending()` but does not clean expired terminal jobs until the first 5-minute interval.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Prevent TTL cleanup from deleting or scrubbing active (pending) jobs.
- Scrub `result`, `progress`, and `error` before deletion.
- Introduce a distinct pending-job timeout that cancels and fails truly-stuck pending jobs.
- Validate that retention settings relate correctly to the workflow timeout.
- Remove expired terminal jobs on startup before serving requests.

**Non-Goals:**
- Full disk-level encryption or `secure_delete` (operator responsibility, documented elsewhere).
- Migrating progress storage to a separate events table (separate change).
- Changing the default `JOB_TTL_MS` of 60 minutes.
- Multi-instance pending timeout coordination (single-instance only).

## Decisions

### D1: Status-filtered terminal cleanup

**Decision:** `cleanupExpired()` SHALL select only rows where `status IN ('completed', 'failed') AND createdAt < cutoff`. The scrub and delete statements use the same status filter.

**Rationale:** Pending jobs are owned by a running workflow and an abort controller; deleting them orphanes the workflow and breaks status/cancellation. Terminal jobs have no running owner and are safe to expire.

**Alternatives considered:**
- Use `updatedAt`/`completedAt` instead of `createdAt` — more correct but requires a schema migration and backfill; defer and add later. `createdAt` is retained for now with the status filter as the primary guard.
- Keep `createdAt` for terminal jobs only — this is what D1 does.

### D2: Scrub error in the same statement

**Decision:** Change the scrub statement to `UPDATE jobs SET result = NULL, progress = '[]', error = NULL WHERE status IN ('completed','failed') AND createdAt < ?`.

**Rationale:** `error` carries provider messages that may include PHI or implementation details. Nulling it in the same transaction as `result` and `progress` ensures consistent scrubbing without a separate round trip.

### D3: Separate pending timeout with abort

**Decision:** Add `PENDING_JOB_TIMEOUT_MS` (default `DIAGNOSIS_TIMEOUT_MS + 120000`). A periodic sweep (reuse the existing cleanup interval) SHALL find pending jobs older than the timeout, abort their controller via `abortStore`, mark them `failed("Diagnosis timed out")`, and let the workflow's `finally` release capacity.

**Rationale:** Reusing the workflow abort path keeps capacity release consistent with cancellation semantics and avoids a parallel release path. The default exceeds the workflow timeout so a legitimate long workflow can settle before pending expiry.

**Alternatives considered:**
- Reuse `JOB_TTL_MS` for pending expiry — conflates terminal retention with active timeout and forces the documented 5-minute sensitive setting to kill active work.
- Delete pending jobs past TTL and let the workflow continue — the current bug; orphans work and 404s status.

### D4: Config relationship validation

**Decision:** `validateConfig()` SHALL reject `JOB_TTL_MS < DIAGNOSIS_TIMEOUT_MS` and `PENDING_JOB_TIMEOUT_MS < DIAGNOSIS_TIMEOUT_MS`.

**Rationale:** Both relationships, if violated, produce user-visible breakage (premature deletion or premature pending failure). Failing fast at startup is cheaper than diagnosing runtime 404s.

### D5: Startup expired-terminal cleanup

**Decision:** On startup, after `markStalePending()`, call `cleanupExpired(JOB_TTL_MS)` once before starting the server.

**Rationale:** Jobs that expired during downtime otherwise linger for up to 5 minutes (the cleanup interval) after restart, exposing PHI past the retention boundary.

## Risks / Trade-offs

- **[Pending jobs linger past `JOB_TTL_MS`]** → A pending job whose workflow hangs without aborting can linger until `PENDING_JOB_TIMEOUT_MS`. **Mitigation:** The pending sweep aborts the controller, and the workflow's `finally` releases capacity; the timeout is configurable.
- **[Backwards-incompatible config rejection]** → Operators with `JOB_TTL_MS=300000` and the 15-minute timeout will fail startup after upgrade. **Mitigation:** Document the relationship; the failure message names both values and the fix. This is the correct behavior since the prior config was unsafe.
- **[Scrub is not secure erasure]** → Nulling columns does not zero SQLite pages immediately. **Mitigation:** Document that disk encryption and `VACUUM`/`secure_delete` are operator responsibilities; this change reduces the window without claiming cryptographic erasure.

## Migration Plan

1. Deploy: new `PENDING_JOB_TIMEOUT_MS` has a safe default; no env var required.
2. Operators with `JOB_TTL_MS < DIAGNOSIS_TIMEOUT_MS` must raise `JOB_TTL_MS` before upgrading — the startup error guides this.
3. Rollback: revert the status filter and scrub change; pending jobs will again be TTL-deletable (unsafe but backward-compatible).

## Open Questions

- Should the pending timeout sweep also handle jobs whose `AbortController` is missing (e.g., post-restart pending jobs already handled by `markStalePending`)? (Leaning: `markStalePending` already handles restart; the sweep only needs to handle long-running pre-restart jobs.)
- Should we add a `completedAt`/`updatedAt` column in this change or defer to the `progress-events-separate-table` change? (Leaning: defer; the status filter is sufficient for correctness now.)