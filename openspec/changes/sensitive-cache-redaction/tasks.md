## 0. Apply Generic Test Infrastructure First

- [ ] 0.1 Apply `test-integrity-and-hermeticity` for the generic parent runner, canonical profile registry, temporary environment, discovery, and injected route/lifecycle/server seams before implementing this change; confirm it did not implement `APP_DATA_DIR` resolution or alter the `index.ts` umask/bootstrap boundary

## 1. Pre-Import Bootstrap and Configuration

- [ ] 1.1 Convert `index.ts` to a bootstrap with no static application imports, set `process.umask(0o077)` first, then dynamically import `src/backend/server.ts` and invoke its production start function
- [ ] 1.2 Add `APP_DATA_DIR` handling in `src/backend/config.ts`, default development storage beneath `./data`, and resolve all relative database/audit paths beneath the canonical dedicated root
- [ ] 1.3 Implement a shared data-tree preflight/initializer that is bounded to the `APP_DATA_DIR` mount, uses no-follow inspection for every component, validates the complete tree before mutation, and rejects root/cwd/repository, symlink, escape, unsupported-node, and nested-mount cases
- [ ] 1.4 Add strict `TOOL_CACHE_KEY_SECRET` decoding in `src/backend/config.ts`: canonical unpadded base64url only, exact re-encoding, at least 32 decoded bytes, and generic rejection of whitespace/padding/malformed/non-canonical/short values without logging input or length
- [ ] 1.5 Add and validate `TOOL_CACHE_MAX_RESPONSE_BYTES`, `TOOL_CACHE_MAX_ENTRIES`, and `TOOL_CACHE_MAX_DB_BYTES`; leave absent/invalid production-secret handling to cache lifecycle so strict purge runs before failure
- [ ] 1.6 Add data-tree mutation after successful preflight that creates/tightens only the validated mount/root, nested dedicated directories, exact databases/sidecars, and active/rotated audit files to `0700`/`0600` using no-follow or descriptor-relative operations
- [ ] 1.7 Extend the already-extracted side-effect-free `src/backend/server.ts` seam with secure production composition so data security, jobs initialization, unconditional cache lifecycle, startup audit retention, and other readiness gates complete before `Bun.serve()`
- [ ] 1.8 Ensure bootstrap/startup errors and readiness diagnostics use generic error classes/codes without printing sensitive filesystem paths, secret values/lengths, URLs, request terms, rejected logging values, or nested error messages

## 2. Sensitive Store Security

- [ ] 2.1 Update `src/backend/progress-store.ts` to open only the resolved jobs path after data-tree preparation, enable/verify WAL and `PRAGMA secure_delete=ON`, and propagate every permission/open/PRAGMA/schema failure as fatal
- [ ] 2.2 Make terminal-job scrub and delete atomic in `src/backend/progress-store.ts`, preserve pending-job behavior, and checkpoint/truncate WAL after deletion batches without logging result/progress/error content
- [ ] 2.3 Tighten jobs database WAL/SHM files after WAL activation and verify their owner-only mode without changing the parent repository or shared mount mode
- [ ] 2.4 Update `src/backend/orphadata-cache.ts` to use the resolved dedicated path and owner-only database/sidecars while preserving non-fatal upstream population failures after secure storage initialization
- [ ] 2.5 Update `src/backend/utils/audit-logger.ts` to use the validated mount-bounded/no-follow tree and create/tighten its dedicated leaf directory, active file, temporary replacement, and every matching rotated file to owner-only modes before writing or renaming

## 3. Unconditional Cache Lifecycle and Migration

- [ ] 3.1 Replace the current optional cache initialization in `src/backend/tools/utils/tool-cache.ts` with an explicit lifecycle state (`enabled-ready`, `disabled-ready`, `unready`) returned to startup and health
- [ ] 3.2 Implement one strict purge operation in `src/backend/tools/utils/tool-cache.ts` that closes any handle and removes the configured database, `-wal`, and `-shm`, attempts every target, ignores only `ENOENT`, and throws generic failure metadata otherwise
- [ ] 3.3 Run strict purge and create no cache files when `TOOL_CACHE_TTL_MS=0`; return an intentional disabled-ready state only after all targets are absent
- [ ] 3.4 For positive TTL with an absent `TOOL_CACHE_KEY_SECRET`, purge then fail production startup or continue non-production disabled; for any supplied invalid encoding/decoded length, purge then fail in every environment with one generic code
- [ ] 3.5 Version the cache schema, detect the legacy raw `url` primary-key table or any incompatible schema, and wipe/rebuild database/WAL/SHM from empty rather than translating legacy rows
- [ ] 3.6 Configure an enabled current cache with WAL, verified `secure_delete`, prepared statements, startup expiry cleanup, capacity enforcement, and fatal startup propagation for initialization/migration failure
- [ ] 3.7 Keep cache enablement/readiness out of bootstrap `index.ts`; use lifecycle state as the authoritative status in `src/backend/server.ts` and `src/backend/api/routes.ts`

## 4. Pseudonymous Cache Identity and Eligibility

- [ ] 4.1 Implement a single request descriptor in `src/backend/tools/utils/fetch.ts` that contains private canonical key material plus a separate approved service/endpoint observability view, without exposing private fields to logger calls
- [ ] 4.2 Canonicalize eligible HTTPS URLs with versioned/domain-separated, length-delimited namespace/method/host/path/query fields; normalize host/default port/path encoding and deterministic query pairs while retaining duplicates and rejecting ambiguity
- [ ] 4.3 Compute and persist only the full 256-bit HMAC-SHA256 identity using the strictly decoded `TOOL_CACHE_KEY_SECRET` bytes; never use the encoded text directly, persist raw URL components, or reuse `WS_TOKEN_SECRET`/a short log hash
- [ ] 4.4 Namespace cache rows and reads as `json` or `text` in `src/backend/tools/utils/tool-cache.ts` so one representation cannot satisfy the other
- [ ] 4.5 Add a deny-by-default public endpoint allowlist for the current OpenFDA, RxNav, ClinicalTrials.gov, NLM Clinical Tables, and MedlinePlus host/path combinations used by existing tool callers
- [ ] 4.6 Bypass cache lookup and write for non-HTTPS/non-GET/body-bearing requests, URL credentials, auth/cookie/API-key/proxy-authorization or equivalent headers, non-allowlisted endpoints, and non-allowlisted final redirect URLs
- [ ] 4.7 Cache only successful HTTP 200 responses after namespace parsing; keep redirects outside policy, ignored-404 sentinels, 429/4xx/5xx, timeouts, network errors, and parse failures out of storage

## 5. Cache Retention and Capacity

- [ ] 5.1 Run full expired-row cleanup during enabled startup and before readiness, indexed by `fetched_at`
- [ ] 5.2 On every `getCached` path, reject and delete the requested expired row before deserialization/return, invoke expired cleanup, and treat malformed cached content as a deleted miss
- [ ] 5.3 Schedule periodic cleanup from `src/backend/server.ts`, checkpoint/truncate WAL after deletion batches on a throttled path, and expose generic maintenance failure through lifecycle readiness
- [ ] 5.4 Serialize each candidate once, measure bytes, store `response_bytes`, and return without caching when `TOOL_CACHE_MAX_RESPONSE_BYTES` is exceeded
- [ ] 5.5 Track `last_accessed_at` and enforce `TOOL_CACHE_MAX_ENTRIES` by deleting expired rows first and then deterministic least-recently-used/oldest rows
- [ ] 5.6 Measure database plus WAL/SHM bytes against `TOOL_CACHE_MAX_DB_BYTES`, checkpoint and run controlled compaction/rebuild with free-space checks when logical eviction does not shrink physical storage, and mark cache unready if the bound cannot be restored
- [ ] 5.7 Keep aggregate hit/miss/eviction/oversize/entry/byte counters non-sensitive and resettable for isolated tests without exposing per-request identities or sizes

## 6. Unified Safe Fetch Behavior

- [ ] 6.1 Refactor `fetchJSON` and `fetchText` in `src/backend/tools/utils/fetch.ts` onto one executor for descriptor creation, namespaced cache reads, timeout/network fetch, status handling, parsing, and conditional writes
- [ ] 6.2 Replace raw cache-hit URL logging with approved service/endpoint/method/namespace/cache-outcome fields from the shared descriptor
- [ ] 6.3 Map abort/timeout, DNS, TLS, socket, redirect, and other native fetch failures to safe typed errors without concatenating raw URLs, request terms, original messages, stacks, or nested causes
- [ ] 6.4 Map HTTP and malformed JSON/text failures using status/error class and static endpoint labels only; never include provider `statusText`, response bodies, raw headers, or arbitrary parsing messages in downstream summaries
- [ ] 6.5 Audit existing callers in `src/backend/tools/open-fda.ts`, `src/backend/tools/drug-interaction.ts`, `src/backend/tools/clinical-trials.ts`, `src/backend/tools/nlm-clinical-tables.ts`, and `src/backend/tools/medlineplus.ts` so current public GET behavior is allowlisted without changing medical request semantics

## 7. Stdout, Audit, and Progress Boundaries

- [ ] 7.1 Validate `AUDIT_LOG_REDACT_TOOL_ARGS` as only `0` or `1`, default to `1`, reject explicit `0`/unsupported values in production, and allow raw mode only through explicit non-production `0` break-glass with a generic warning
- [ ] 7.2 Update `src/backend/utils/logger.ts` so one sanitized structured entry is formatted for stdout and passed to `AuditLogger`, with the same redaction result in human and JSON modes
- [ ] 7.3 In redacted mode, make `logger.toolCall` retain only approved identifiers plus argument count/presence and make `logger.toolResult` retain only status/retry/duration and generic count/category metadata
- [ ] 7.4 In redacted mode, replace arbitrary workflow/tool/cache messages, errors, result summaries, results, and nested causes with stable classifications before either observability sink
- [ ] 7.5 Add sink-level recursive defense for sensitive event families that drops URL/query/header/body/args/result/response/message/error/cause/stack fields and rejects unexpected objects or strings
- [ ] 7.6 Keep cache/fetch request identity permanently safe in non-production break-glass mode; document that raw tool detail never permits raw cache/fetch URLs or terms and production has no raw mode
- [ ] 7.7 Update `src/backend/workflows/tool-event-hooks.ts` to construct separate progress and logger payloads rather than passing/spreading PHI-bearing progress data into observability
- [ ] 7.8 Preserve clinically useful `summarizeToolResult` output in `src/backend/workflows/tool-result-summary.ts` for authorized progress while deriving only approved generic logger metadata in redacted mode
- [ ] 7.9 Extend `src/backend/utils/audit-logger.ts` age purge across active and rotated logs at startup and periodically using same-directory atomic owner-only replacements that preserve originals on failure
- [ ] 7.10 Make startup audit purge failure fatal before traffic; make periodic purge failure set generic unready state until a complete retry succeeds without logging paths or content

## 8. Health, Deployment, and Documentation

- [ ] 8.1 Update `/v1/health` in `src/backend/api/routes.ts` to include only coarse cache enabled/ready state and aggregate counters/bytes, treat intentional disablement as ready, and fail readiness for enabled lifecycle/maintenance failure
- [ ] 8.2 Publish the deployment-neutral bootstrap contract and verify every supported production launcher uses `index.ts` as the umask bootstrap entrypoint rather than importing or executing `src/backend/server.ts` directly
- [ ] 8.3 Replace recursive link-following data-init chmod/chown with the shared mount-bounded no-follow preflight/mutation command; keep app and initializer on the same image digest and block app startup on initializer failure
- [ ] 8.4 Specify and verify the production environment contract consumed by Docker-owned Compose: `APP_DATA_DIR=/app/data`, fixed job/tool-cache/Orphadata/audit paths, `AUDIT_LOG_REDACT_TOOL_ARGS=1`, explicit cache TTL/key/bounds, and no embedded secret; do not create a competing Compose implementation
- [ ] 8.5 Set the standard Docker artifact smoke environment to `TOOL_CACHE_TTL_MS=0` with no cache key and assert strict purge/readiness plus absence of a created cache database
- [ ] 8.6 Update `.dockerignore` to exclude `*.sqlite*`, the dedicated data directory, and application/audit logs
- [ ] 8.7 Document strict unpadded-base64url key generation/validation/rotation, positive-TTL production requirements, missing-dev disable/purge, invalid-value rejection, production-forced redaction, data-root containment, and cache defaults in `.env.example`
- [ ] 8.8 Update `AGENTS.md` and `README.md` to distinguish cache logical TTL from physical remnants, identify plaintext responses and authorized progress as PHI-bearing, and explain secure-delete/checkpoint/compaction limits
- [ ] 8.9 Document owner-only permissions as defense-in-depth rather than encryption; require encrypted disks/volumes, cache backup exclusion or protected bounded copies, volume quotas/alerts, and SQLite rebuild headroom
- [ ] 8.10 Document traffic-gated rollout in exact order: stop admission, drain/stop old writers, start/verify redacted candidate while gated, purge/verify application/container/journal/external copies, then admit traffic
- [ ] 8.11 Document cumulative immutable rollback eligibility across Docker bootstrap, data traversal/schema, redaction/audit, untrusted-content encoding, and current clinician-reviewed clinical gates; otherwise disable/purge cache and fix forward
- [ ] 8.12 Preserve Caddy's incoming capability-query redaction and clarify that it is independent defense-in-depth, not protection for outbound tool requests or application logs

## 9. Authoritative Parent-Runner Startup Profiles

- [ ] 9.1 Integrate these tests only through the `test-integrity-and-hermeticity` manifest/Bun parent runner; do not add a nested process launcher, temp-root allocator, port allocator, network guard, or cleanup harness to cache/startup test files
- [ ] 9.2 Make the authoritative parent allocate one unique absolute `APP_DATA_DIR` before each child, place every database/audit path beneath it, sanitize inherited values, and retain sole ownership of child teardown and workspace-sentinel verification
- [ ] 9.3 Configure the sole cache-enabled profile with positive TTL and a freshly generated 32-byte canonical unpadded-base64url `TOOL_CACHE_KEY_SECRET`; keep base/server/live-smoke profiles cache-disabled unless explicitly specified
- [ ] 9.4 Register canonical cache-disabled `server-test` cases plus positive-TTL and missing/invalid-key `cache-startup` cases proving `index.ts` sets umask before dynamically importing `src/backend/server.ts`, starts actual production composition when valid, fails as declared when invalid, and never changes repository-root mode
- [ ] 9.5 Use parent-isolated production lifecycle/config seams for mount/symlink/path, jobs, purge, secret-encoding, raw-log rejection, audit-retention, migration, and bound failure matrices without spawning grandchildren or cache-busting imports
- [ ] 9.6 Prove every startup/profile-created artifact stays under its parent-assigned `APP_DATA_DIR`, external network remains denied for non-live tests, and cleanup preserves all workspace database/sidecar/current/rotated-log sentinels

## 10. Cache, Fetch, Log, and Store Tests

- [ ] 10.1 Extend `tests/config.test.ts` for mount-bounded/no-follow data-root/path containment, cache bounds, strict unpadded-base64url secret acceptance/re-encoding, whitespace/padding/malformed/non-canonical/short rejection without disclosure, and production raw-log rejection versus explicit non-production break-glass
- [ ] 10.2 Extend `tests/tool-cache.test.ts` for full-length deterministic HMAC identity from decoded key bytes, canonical-equivalence and material-difference cases, duplicate query retention, secret/key-domain separation, JSON/text namespaces, and database inspection with canary terms
- [ ] 10.3 Extend `tests/tool-cache.test.ts` for allowlisted public GETs plus method/body/auth/cookie/API-key/scheme/host/path/final-redirect bypass and non-success/non-parse write exclusion
- [ ] 10.4 Extend `tests/tool-cache.test.ts` for TTL deletion on read/startup/periodic cleanup, malformed-row deletion, response limit, entry eviction order, database/WAL/SHM cap, checkpoint/compaction behavior, and unready bound failure
- [ ] 10.5 Extend `tests/fetch-utils.test.ts` to cover both `fetchJSON` and `fetchText` cache hits, timeout, abort, DNS, TLS, socket, redirect, HTTP/status-text, malformed payload, and nested-cause canaries with no term/raw-URL leakage
- [ ] 10.6 Extend `tests/logger.test.ts` and `tests/audit-logger.test.ts` to assert production-forced identical stdout/audit redaction, non-production-only break-glass detail, startup and periodic active/rotated purge, owner-only atomic replacement, original preservation, and fail/recover readiness behavior
- [ ] 10.7 Extend `tests/workflow.test.ts` to prove redacted logger payloads omit canary arguments/results/errors while authorized `tool-event-hooks` progress retains its expected tool arguments and summaries
- [ ] 10.8 Extend `tests/progress-store.test.ts` for fatal file-backed initialization errors, `secure_delete`, atomic terminal scrub/delete, WAL checkpoint/truncation, owner-only database/sidecars, and unchanged pending/job-TTL semantics
- [ ] 10.9 Extend `tests/orphadata-cache.test.ts` for dedicated-path owner-only files and secure storage failure while preserving graceful public-API population failure
- [ ] 10.10 Extend `tests/api.test.ts` for intentional-disabled versus enabled-ready/unready cache/audit health and assert health never exposes paths, keys, encoded/decoded lengths, URLs, endpoints tied to requests, terms, secrets, response values, or per-entry sizes
- [ ] 10.11 Add a deployment assertion to an existing test file that verifies Docker builds/runs the `index.ts` bootstrap with its dynamic chunk, Compose fixed `APP_DATA_DIR`/paths/redaction/cache settings, no embedded secret, shared no-follow initializer, and `TOOL_CACHE_TTL_MS=0` smoke contract

## 11. Verification and Operator Gates

- [ ] 11.1 Run `bun run lint`
- [ ] 11.2 Run `bun run typecheck`
- [ ] 11.3 Run the focused config, progress-store, cache-enabled, fetch, logger, audit, workflow, Orphadata, and server/API profiles through the authoritative parent runner
- [ ] 11.4 Run `bun run test:all && bun run test:integration` through the cohort runner policies with unique `APP_DATA_DIR` roots and required external credentials
- [ ] 11.5 Inspect the migrated SQLite schema/files and canary stdout/audit output in a controlled environment to confirm no raw URL column, request term, cache key, response, or sensitive nested error remains
- [ ] 11.6 Operator: generate/install canonical unpadded-base64url cache key material from at least 32 random bytes, configure fixed data paths/limits and forced production redaction, and verify no-follow mount layout, non-root ownership, encryption, quotas, replacement/compaction headroom, and backup policy before deployment
- [ ] 11.7 Operator: stop admission, drain/stop old writers, start and verify the redacted digest while traffic-gated, purge/verify active/rotated application plus container/journal/shipped/aggregated/archive/backup/snapshot copies, record owners/residual retention, and only then admit traffic
- [ ] 11.8 Operator: rehearse rollback eligibility by verifying the immutable digest's cumulative Docker/data/redaction/encoding/clinical evidence; when ineligible or absent, keep traffic gated, set TTL zero, strictly purge database/WAL/SHM, and fix forward without weakening retained controls
