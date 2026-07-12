## Why

ddx.care persists PHI-derived data in two locations with inadequate protection: (1) The `jobs` SQLite table stores full diagnosis reports (patient summary, specialist findings, ranked diagnoses) in plaintext for 60 minutes, accessible to anyone with filesystem access. (2) When `AUDIT_LOG_PATH` is set, the audit logger appends tool call arguments (drug names, condition names, search queries — all PHI-adjacent) as JSON Lines with size-based rotation only and no time-based purge, meaning sensitive data can persist for weeks. While the system is explicitly labeled "not HIPAA-compliant," these gaps exceed reasonable risk for a medical-adjacent application.

## What Changes

- **Redact tool arguments in audit logs** — The logger currently records `toolArgs` verbatim (drug names, condition names, search queries). Redact or truncate these to remove PHI-adjacent content while preserving operational utility (tool name, success/failure, duration).
- **Add time-based purge for audit logs** — Add a configurable `AUDIT_LOG_RETENTION_HOURS` (default 168h / 7 days) that purges audit log entries older than the threshold. This complements the existing size-based rotation.
- **Document PHI retention in job store** — Add structured logging and documentation that makes the 60-minute job TTL and its PHI implications explicit. Add a startup log warning when jobs containing results exist.
- **Add secure-delete on job cleanup** — When `cleanupExpired()` deletes a job, overwrite the result/progress columns with empty values before deleting the row, to reduce recoverability from disk images (SQLite soft-deletes leave data in the file until vacuum).
- **Configurable shorter default for sensitive deployments** — Document that `JOB_TTL_MS` can be reduced (e.g., to 5 minutes for production demos) and add validation guidance.

## Capabilities

### New Capabilities

- `phi-data-protection`: Redaction of PHI-adjacent data in audit logs, time-based audit log retention, and secure-delete of job data on cleanup

### Modified Capabilities

- `job-lifecycle`: Job cleanup SHALL scrub result/progress data before deletion

## Impact

- **Backend audit logger** (`src/backend/utils/audit-logger.ts`): Add time-based purge method; call it on a timer
- **Backend logger** (`src/backend/utils/logger.ts`): Redact `toolArgs` in `specialistCall()` / tool-call events
- **Backend progress store** (`src/backend/progress-store.ts`): Scrub columns before delete in `cleanupExpired()`
- **Backend config** (`src/backend/config.ts`): Add `AUDIT_LOG_RETENTION_HOURS`
- **Tests** (`tests/audit-logger.test.ts`, `tests/progress-store.test.ts`): Add redaction, purge, and scrub coverage
- **Documentation** (`AGENTS.md`, `.env.example`): Document PHI retention and new env vars
