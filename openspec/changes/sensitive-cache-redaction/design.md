## Context

The tool cache uses the raw URL as the primary key (`src/backend/tools/utils/tool-cache.ts:23-40`), so patient-derived drug, condition, and phenotype terms are stored in plaintext for 24 hours. Cache hits log the full URL (`src/backend/tools/utils/fetch.ts:24-29`), routed to stdout and the audit logger. Timeout errors include the full URL (`fetch.ts:69-73`). SQLite files are mode `0644` (verified: `jobs.sqlite`, `tool-cache.sqlite`, `orphadata.sqlite` and sidecars). The PHI design (`openspec/changes/archive/2026-07-12-phi-data-protection/design.md:3-10`) lists jobs, audit, and browser storage but omits the cache. `TOOL_CACHE_TTL_MS=0` skips `initToolCache()` but leaves an existing cache on disk.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Stop logging patient-derived query terms.
- Restrict SQLite file permissions to the owning user.
- Purge the cache when caching is disabled.
- Document the cache as a PHI surface.

**Non-Goals:**
- Encrypting the cache at rest (operator/disk-encryption responsibility).
- Removing the cache entirely (it reduces redundant upstream calls).
- Changing which upstream APIs are called or how URLs are constructed.

## Decisions

### D1: Log host/path plus keyed hash, not raw URL

**Decision:** `logger.info("tool_cache_hit", ...)` and timeout messages SHALL record `{ host, path, paramHash }` where `paramHash = HMAC-SHA256(normalizedQuery, LOG_PARAM_HASH_KEY).slice(0,16)`. The hash key is derived from `WS_TOKEN_SECRET` (or a fixed dev key) so hashes are not reversible without the secret.

**Rationale:** Preserves the ability to correlate repeated hits to the same query for debugging without retaining the query terms. Reusing `WS_TOKEN_SECRET` avoids a new secret.

**Alternatives considered:**
- Log only `host` — loses the ability to distinguish endpoints on the same host.
- Truncate the URL — still leaks the first drug/condition name.

### D2: umask and explicit directory/file permissions

**Decision:** In `index.ts`, set `process.umask(0o077)` before any store is constructed. Each store constructor creates its data directory with `0700` (via `mkdirSync(dir, { recursive: true, mode: 0o700 })`) and, after opening the database, `chmod`s the db file and known sidecars to `0600` where writable.

**Rationale:** SQLite creates sidecars dynamically, so a umask plus explicit directory permission is the most reliable guard. `chmod` on startup tightens pre-existing files created before the umask was set.

**Alternatives considered:**
- Rely on Docker volume permissions — the Dockerfile already runs as non-root `bun`, but a fresh named volume can be root-owned (separate finding); umask is defense-in-depth.
- SQLCipher — non-goal; documented as operator responsibility.

### D3: Purge on disable

**Decision:** When `TOOL_CACHE_ENABLED` is false, `initToolCache()` SHALL unlink `tool-cache.sqlite`, `tool-cache.sqlite-wal`, and `tool-cache.sqlite-shm` (best-effort) before returning.

**Rationale:** Disabling caching should not leave PHI on disk. Best-effort unlink avoids a hard failure if the file is locked.

### D4: Redacted tool-result summaries

**Decision:** `summarizeToolResult()` SHALL accept a `redact` boolean. When true, drug/condition/query-specific summaries (e.g., "Drug: warfarin") SHALL be replaced by count-based summaries (e.g., "1 result"). The `onStepFinish` handler passes `AUDIT_LOG_REDACT_TOOL_ARGS` through.

**Rationale:** The current summarizer (`src/backend/workflows/tool-result-summary.ts:71-193`) includes drug names in some branches, bypassing tool-arg redaction. Aligning summaries with the redaction flag closes the gap.

## Risks / Trade-offs

- **[Param hash correlation requires the secret]** → If `WS_TOKEN_SECRET` rotates, hashes change and prior logs can no longer be correlated. **Mitigation:** Acceptable; correlation across rotation is not a requirement.
- **[umask affects all files created by the process]** → A `0077` umask is appropriate for a server that creates sensitive files, but could surprise operators expecting group-readable logs. **Mitigation:** Explicitly `chmod` log files to the intended mode after creation in the audit logger; document the umask.
- **[Purge deletes useful cache on restart after intentional disable]** → An operator toggling disable on will lose cached reference data. **Mitigation:** This is the intended privacy behavior; the cache rebuilds on re-enable.

## Migration Plan

1. Deploy: umask and permissions take effect immediately; existing `0644` files are tightened on startup.
2. Deploy: log redaction takes effect immediately; prior log lines with URLs are not retroactively scrubbed.
3. Deploy: `TOOL_CACHE_TTL_MS=0` now purges; operators who disabled caching to "stop writing" will see the existing file removed — this is the intended behavior.
4. Rollback: revert to full-URL logging and `0644` files (unsafe but backward-compatible).

## Open Questions

- Should the param-hash key be a dedicated `LOG_PARAM_HASH_KEY` env var or derived from `WS_TOKEN_SECRET`? (Leaning: derive from `WS_TOKEN_SECRET` to avoid a new secret; add a dedicated key only if operators want hash stability independent of token rotation.)
- Should we also redact `jobId` in tool-call logs? (Leaning: no; `jobId` is needed for correlation and is not PHI itself.)