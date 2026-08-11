## Why

The tool cache currently persists patient-derived request terms as raw URL primary keys and plaintext responses, can log those URLs through cache hits and transport errors, and leaves existing database/WAL/SHM files behind when caching is disabled. Sensitive stores and logs are also constructed by static imports before startup can apply a restrictive umask, while current TTL deletion and log-retention behavior does not fully address SQLite free pages, WAL files, backups, rotated logs, container logs, or aggregated logs.

## What Changes

- **BREAKING - fail-closed startup and data layout**: make `index.ts` an import-free bootstrap that applies `0077` and then dynamically imports the server module; use one dedicated application data directory, validate its tree with mount-bounded no-follow traversal before mutation, explicitly tighten sensitive leaves without ever changing the repository-root mode, and treat an insecure or unavailable jobs database as a fatal startup/readiness failure. Docker builds and runs this bootstrap entrypoint, not the server module directly.
- **BREAKING - keyed production cache**: require `TOOL_CACHE_KEY_SECRET` to be canonical unpadded base64url decoding to at least 32 bytes whenever caching is enabled. Reject whitespace, padding, malformed/non-canonical encoding, and short decoded values without logging the supplied value; development with no secret disables and purges caching rather than using a fixed key.
- Invoke the tool-cache lifecycle unconditionally before serving. Disabled caching purges the configured database plus WAL/SHM sidecars and any purge failure other than `ENOENT` prevents startup/readiness.
- Replace raw URL keys with full-length HMAC-SHA256 identities over a domain-separated, versioned, canonical public-request descriptor. JSON and text values use distinct namespaces; no short observability hash is accepted as cache identity.
- Cache only explicitly allowlisted, unauthenticated public HTTPS `GET` requests. Requests with credentials, bodies, non-GET methods, or non-allowlisted endpoints bypass both cache reads and writes.
- Bound cache retention and resource use with startup/on-read/periodic expiry, per-response, entry-count, and total-database limits, deterministic eviction, SQLite `secure_delete`, WAL checkpoint/truncation, and controlled rebuild/compaction where needed.
- Treat plaintext cached responses as sensitive even after request-key pseudonymization. Enforce owner-only storage, document disk-encryption and backup responsibilities, and wipe/rebuild the legacy raw-key schema during migration rather than converting it in place.
- Use one safe request descriptor for `fetchJSON` and `fetchText` cache hits and every transport/parsing failure path. Application stdout and audit logs never receive raw URLs or patient-derived request terms. Production forces `AUDIT_LOG_REDACT_TOOL_ARGS=1` and rejects raw mode; explicit raw logging is a non-production break-glass mode only.
- Keep capability-authorized progress events as PHI-bearing job data governed by `JOB_TTL_MS`; they are not audit records and are not silently mutated by log redaction.
- Purge active and rotated audit logs at startup and periodically using atomic owner-only replacement, with startup/readiness failure when retention cannot be enforced. Rollout stops and drains old writers, starts the redacted release behind a closed traffic gate, purges and verifies application/container/external copies, and only then admits traffic.
- Apply the generic test-integrity runner, canonical profiles, temporary environment, and injected lifecycle/server seam first. This change then owns the `APP_DATA_DIR` resolver and no-static-import `index.ts` bootstrap, registers cache-disabled general startup under `server-test`, positive-TTL and missing/invalid-key startup under `cache-startup`, positive cache logic under `cache-enabled`, and adds no nested runner.
- Rollback remains monotonic and digest-based. A rollback digest must satisfy the cumulative Docker artifact, data-tree, redaction/audit, untrusted-content encoding, and current clinical-release eligibility gates; otherwise caching is disabled and strictly purged while the release is fixed forward.

## Capabilities

### New Capabilities

- `tool-cache-privacy`: Defines fail-closed cache lifecycle, pseudonymous cache identities, request eligibility, bounded logical/physical retention, safe observability, owner-only storage, and migration behavior for the sensitive tool-response cache.

### Modified Capabilities

- `phi-data-protection`: Extends the existing tool-argument redaction contract with production-enforced redaction while preserving authorized progress semantics, and extends time-based audit retention to startup and periodic atomic purge of active/rotated files with explicit failure behavior.

## Impact

- **Startup/configuration**: the already-extracted injected server seam, sensitive-cache-owned `index.ts` bootstrap, `APP_DATA_DIR` resolver, `src/backend/config.ts`, `src/backend/progress-store.ts`, and `src/backend/orphadata-cache.ts`.
- **Cache/fetch path**: `src/backend/tools/utils/tool-cache.ts`, `src/backend/tools/utils/fetch.ts`, and the current public medical-tool callers under `src/backend/tools/`.
- **Observability**: `src/backend/utils/logger.ts`, `src/backend/utils/audit-logger.ts`, `src/backend/workflows/tool-event-hooks.ts`, and `src/backend/workflows/tool-result-summary.ts`.
- **Deployment/docs**: bootstrap/data/cache contracts consumed by Docker-owned `Dockerfile` and Compose work, plus `.env.example`, `README.md`, and `AGENTS.md`; operator-managed traffic gates, backups, container logs, and aggregated logs require rollout actions outside the repository.
- **Tests**: the authoritative test-integrity manifest/parent runner and its cache-enabled profile, plus `tests/config.test.ts`, `tests/progress-store.test.ts`, `tests/tool-cache.test.ts`, `tests/fetch-utils.test.ts`, `tests/logger.test.ts`, `tests/audit-logger.test.ts`, `tests/orphadata-cache.test.ts`, and `tests/api.test.ts`.
