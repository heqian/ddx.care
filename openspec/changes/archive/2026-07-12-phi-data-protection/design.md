## Context

ddx.care persists PHI-derived data in three locations:

1. **`jobs` SQLite table** (`src/backend/progress-store.ts`): The `result` column stores the full diagnosis report (patient summary, specialist findings, ranked diagnoses — all derived from user-supplied PHI). The `progress` column stores an array of progress events including `toolArgs` (drug names, condition names). Data persists for `JOB_TTL_MS` (default 60 min), cleaned up every 5 minutes via `cleanupExpired()` which does a plain `DELETE`.

2. **Audit log** (`src/backend/utils/audit-logger.ts`): When `AUDIT_LOG_PATH` is set, the logger appends all events as JSON Lines. The `specialistCall()` method (`src/backend/utils/logger.ts`) records `toolArgs` containing drug names, condition names, and search queries — PHI-adjacent data. Rotation is size-based only (`AUDIT_LOG_MAX_SIZE_MB` × `AUDIT_LOG_MAX_FILES`), with no time-based purge. Sensitive data can persist for weeks until the size limit evicts it.

3. **Frontend `sessionStorage`** (`src/frontend/pages/InputDashboard.tsx`): Auto-saves patient input every 500ms. Cleared on successful submission, but persists if the user abandons the form. (Lower priority — browser-side, cleared on tab close.)

The system is explicitly labeled "RESEARCH PROOF-OF-CONCEPT ONLY. NOT a medical device. NOT HIPAA-compliant." However, defense-in-depth principles warrant minimizing PHI exposure at rest.

## Goals / Non-Goals

**Goals:**
- Redact PHI-adjacent tool arguments from audit logs while preserving operational utility
- Add time-based retention to audit logs so old entries are purged automatically
- Scrub job data before deletion to reduce disk recoverability
- Make PHI retention periods explicit and configurable

**Non-Goals:**
- Full database encryption at rest (e.g., SQLCipher) — significant infrastructure change, out of scope for a POC. The `secure-rest-endpoints` change (token auth) is the primary access control; disk-level encryption (e.g., LUKS, Docker encrypted volumes) is the deployment operator's responsibility.
- HIPAA compliance (explicitly disclaimed)
- Removing audit logging entirely (it provides valuable operational observability)
- Frontend sessionStorage changes (lower priority; data clears on tab close)

## Decisions

### D1: Redact tool arguments in audit logs

**Decision:** In the logger's `specialistCall()` method, replace the raw `toolArgs` value with a redacted form. For search/lookup tools, record only the tool name and a boolean indicating whether args were present (not the actual values). For drug-interaction tools, record the drug name count (e.g., `"2 drugs queried"`) but not the names. Add a configurable `AUDIT_LOG_REDACT_TOOL_ARGS` env var (default `true`).

**Rationale:** The audit log's purpose is operational observability (which tools were called, success/failure, duration). The actual query arguments are PHI-adjacent and not needed for most debugging. Tool name + outcome is sufficient for performance and reliability analysis.

**Alternatives considered:**
- Hash the arguments → Loses debugging utility; hashes aren't reversible if needed for incident investigation.
- Truncate to N characters → Still leaks the first condition/drug name; truncation is not real redaction.
- Disable tool logging entirely → Loses valuable observability; the tool-call timing data is important.

### D2: Time-based audit log purge

**Decision:** Add a `purgeOlderThan(hours)` method to `AuditLogger` that reads the JSON Lines file, filters out entries older than the threshold, and rewrites the file. Call it on a timer (every `AUDIT_LOG_RETENTION_HOURS / 4`, minimum 1 hour). Add `AUDIT_LOG_RETENTION_HOURS` env var (default 168 / 7 days).

**Rationale:** Size-based rotation alone lets sensitive data persist indefinitely in low-traffic deployments. A time-based purge ensures PHI-adjacent data is removed within a bounded period regardless of log volume.

**Alternatives considered:**
- Rotate more aggressively (smaller size limit) → Doesn't bound time; a quiet period leaves old data indefinitely.
- Use syslog/journald with native retention → Adds an external dependency; the current file-based approach is simpler for a POC.

### D3: Scrub job data before deletion

**Decision:** In `cleanupExpired()`, before the `DELETE` query, run an `UPDATE jobs SET result = NULL, progress = '[]' WHERE createdAt < ?`. Then run the `DELETE`. Optionally call `VACUUM` periodically to reclaim disk space and reduce recoverability.

**Rationale:** SQLite's `DELETE` marks pages as free but doesn't zero them; the data remains in the file until those pages are overwritten or the database is vacuumed. Nulling the columns first, then deleting, reduces the window for recovery from a disk image. `VACUUM` reclaims the space entirely.

**Alternatives considered:**
- Encrypt the result column at rest → Adds key management complexity. Documented as a non-goal; disk encryption is the operator's responsibility.
- Reduce JOB_TTL_MS default → The 60-min default is needed for long workflows + client retrieval time. Operators can reduce it via env var.

## Risks / Trade-offs

- **[Audit log loses debugging detail]** → Redacting tool args means operators can't see exactly what was queried during an incident. **Mitigation:** Set `AUDIT_LOG_REDACT_TOOL_ARGS=0` for debugging sessions; document this escape hatch.
- **[Audit log purge I/O cost]** → Rewriting the log file on every purge cycle reads and rewrites the entire file. **Mitigation:** Run purge infrequently (every retention-period/4). For high-volume deployments, the size-based rotation keeps files small.
- **[VACUUM locks the database]** → Running VACUUM on the jobs database can briefly block writes. **Mitigation:** Run VACUUM infrequently (e.g., on shutdown or daily, not on every cleanup cycle). Or skip VACUUM and rely on column-scrubbing alone.
- **[Scrub-before-delete adds latency]** → An extra UPDATE before DELETE adds one query per expired job. **Mitigation:** Negligible; cleanup runs every 5 minutes and affects only expired jobs.

## Migration Plan

1. Deploy: new env vars (`AUDIT_LOG_RETENTION_HOURS`, `AUDIT_LOG_REDACT_TOOL_ARGS`) have sensible defaults.
2. Existing audit logs are not retroactively purged (only new entries are affected by redaction; old files age out via the new time-based purge).
3. Rollback: Set `AUDIT_LOG_REDACT_TOOL_ARGS=0` and `AUDIT_LOG_RETENTION_HOURS` to a very large value to revert behavior.

## Open Questions

- Should VACUUM run on a schedule (e.g., daily) or on graceful shutdown? (Leaning: on shutdown, to avoid runtime lock contention.)
- Should the redaction policy be per-tool (some tools are less sensitive than others)? (Leaning: blanket redaction for simplicity; can refine later.)
