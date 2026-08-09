## Why

The tool cache stores patient-derived query terms as full URLs (the cache primary key) and logs those URLs on every cache hit, routing them to stdout and the audit log. Timeout errors include the full URL. SQLite database files and WAL/SHM sidecars are mode `0644`, readable by other local users. The PHI data-protection design documented only the jobs table, audit log, and browser storage — it omitted the tool cache as a PHI-derived surface. Disabling the cache (`TOOL_CACHE_TTL_MS=0`) does not purge an existing cache database.

## What Changes

- **Do not log full URLs**: cache-hit and timeout logs SHALL record only the host and path plus a keyed hash of normalized query parameters, never the raw query string.
- **Redact tool-result summaries**: tool-result summaries SHALL not include drug, condition, or query terms when `AUDIT_LOG_REDACT_TOOL_ARGS=1`; summaries SHALL be restricted to counts and status.
- **Owner-only file permissions**: SQLite databases (jobs, tool-cache, orphadata) and WAL/SHM sidecars SHALL be created with owner-only permissions (`0600` files, `0700` data directory) via a process umask and explicit directory creation.
- **Purge existing cache on disable**: setting `TOOL_CACHE_TTL_MS=0` SHALL purge any existing tool-cache database on startup, not merely skip opening it.
- **Document the cache as a PHI surface**: the PHI retention documentation SHALL explicitly include the tool cache and upstream access-log disclosure.

## Capabilities

### New Capabilities

- `tool-cache-privacy`: Treats the tool-response cache as a PHI-derived surface, redacting query terms from logs, enforcing owner-only file permissions, and purging the cache when caching is disabled.

### Modified Capabilities

- `phi-data-protection`: PHI retention documentation SHALL include the tool cache; tool-result summaries SHALL honor `AUDIT_LOG_REDACT_TOOL_ARGS`.

## Impact

- **Backend**: `src/backend/tools/utils/tool-cache.ts` (permissions, purge-on-disable), `src/backend/tools/utils/fetch.ts` (log redaction), `src/backend/workflows/tool-result-summary.ts` (redacted summaries), `src/backend/progress-store.ts` and `src/backend/orphadata-cache.ts` (file permissions), `index.ts` (umask before store creation), `src/backend/config.ts` (data-directory permission helper).
- **Tests**: `tests/tool-cache.test.ts`, `tests/fetch-utils.test.ts`, `tests/logger.test.ts`, `tests/audit-logger.test.ts`.
- **Documentation**: `AGENTS.md` (PHI retention section, tool cache surface), `.env.example`.