## 1. Audit Log Tool-Arg Redaction

- [x] 1.1 Add `AUDIT_LOG_REDACT_TOOL_ARGS` env var to `src/backend/config.ts` (default `"1"`) with validation.
- [x] 1.2 In `src/backend/utils/logger.ts`, update the `specialistCall()` method (and any tool-call event logging) to replace raw `toolArgs` with a redacted summary (tool name, arg count, `args_present` boolean) when redaction is enabled.
- [x] 1.3 Add tests in `tests/audit-logger.test.ts`: verify redacted entries omit raw arg values; verify raw entries include them when redaction is disabled.

## 2. Time-Based Audit Log Purge

- [x] 2.1 Add `AUDIT_LOG_RETENTION_HOURS` env var to `src/backend/config.ts` (default 168) with validation.
- [x] 2.2 Add a `purgeOlderThan(hours: number)` method to `AuditLogger` in `src/backend/utils/audit-logger.ts` that reads the JSON Lines file, filters entries by timestamp, and rewrites the file.
- [x] 2.3 Set up a timer in `index.ts` (alongside existing cleanup timers) that calls `purgeOlderThan()` at most once per hour, using `AUDIT_LOG_RETENTION_HOURS` as the threshold. Clear the timer on shutdown.
- [x] 2.4 Add tests in `tests/audit-logger.test.ts` for the purge method: old entries removed, recent entries preserved.

## 3. Job Data Scrub Before Delete

- [x] 3.1 In `src/backend/progress-store.ts`, add a `scrubStmt` prepared statement: `UPDATE jobs SET result = NULL, progress = '[]' WHERE createdAt < ?`.
- [x] 3.2 Update `cleanupExpired()` to run `scrubStmt.run(cutoff)` before `cleanupStmt.run(cutoff)`.
- [x] 3.3 Add tests in `tests/progress-store.test.ts` verifying that expired jobs have their result/progress nulled before deletion.

## 4. Configuration & Documentation

- [x] 4.1 Add `AUDIT_LOG_RETENTION_HOURS` and `AUDIT_LOG_REDACT_TOOL_ARGS` to `.env.example` with descriptions.
- [x] 4.2 Update `AGENTS.md` environment variables table with the new vars.
- [x] 4.3 Add a "PHI Data Retention" section to `AGENTS.md` documenting: job data TTL (60 min, configurable via `JOB_TTL_MS`), audit log retention (7 days, configurable), tool-arg redaction policy, and scrub-before-delete behavior.
- [x] 4.4 Run `bun run lint && bun run typecheck && bun run test` to verify all changes.
