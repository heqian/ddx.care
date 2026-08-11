## Purpose

Protects patient-derived medical-tool cache data through fail-closed lifecycle controls, pseudonymous request identities, bounded retention, owner-only storage, and non-disclosing observability.

## ADDED Requirements

### Requirement: Sensitive startup security precedes singleton construction

`index.ts` SHALL contain no static application import. It SHALL set a process umask of `0077` and only then dynamically import the server module, so no jobs store, tool cache, Orphadata store, audit logger, route singleton, or transitive application singleton can create a file first. The production Docker build SHALL use this bootstrap as its server entrypoint rather than building the dynamically imported server module directly. Sensitive persistent data SHALL live in a dedicated application data directory rather than the repository root. The server SHALL create or explicitly tighten the dedicated directory and its sensitive leaf directories to `0700`, and existing database, WAL, SHM, active-log, and rotated-log files to `0600`, before use.

The container data initializer and application bootstrap SHALL treat `APP_DATA_DIR` as the traversal mount boundary, SHALL use no-follow inspection for every path component, and SHALL complete a read-only validation pass before any ownership, mode, deletion, open, or other mutation. They SHALL reject symlinks, paths escaping the root, and nested mount-boundary crossings before mutation. Permission hardening SHALL target only the validated dedicated data tree and exact sensitive leaf files. It SHALL NOT change the mode of the repository root, process working directory, filesystem root, another mount, or an arbitrary shared ancestor. Failure to establish, open, configure, or secure the jobs database SHALL be fatal and SHALL keep the server unready and non-listening.

#### Scenario: Umask is applied before runtime imports
- **WHEN** the server starts in a clean process
- **THEN** `index.ts` applies `0077` before dynamically importing the server module, and every newly created sensitive file is owner-only from creation

#### Scenario: Existing sensitive leaves are tightened
- **WHEN** the dedicated data directory, a database, a sidecar, or an active/rotated audit log already exists with broader permissions
- **THEN** startup explicitly changes the dedicated directory/leaf-directory mode to `0700` and sensitive file mode to `0600` before opening or appending to it

#### Scenario: Repository root is never chmodded
- **WHEN** the process working directory is the repository root or a configured path would otherwise resolve its parent to that root
- **THEN** startup uses or rejects the dedicated data-directory configuration without changing the repository-root mode

#### Scenario: Symlink or mount escape is rejected before mutation
- **WHEN** initializer/bootstrap preflight encounters a symlink, an escaping path component, or a nested mount boundary beneath `APP_DATA_DIR`
- **THEN** preparation fails before any file or directory in the candidate tree is chmodded, chowned, removed, opened, or rewritten

#### Scenario: Jobs database cannot be secured
- **WHEN** the jobs database or its dedicated directory cannot be created, tightened, opened, or initialized securely
- **THEN** startup fails before `Bun.serve()` and readiness never reports success

### Requirement: Cache lifecycle runs unconditionally before serving

The tool-cache lifecycle SHALL run on every startup before the server accepts requests, whether caching is requested or disabled. When `TOOL_CACHE_TTL_MS=0`, it SHALL close any cache handle and purge the configured cache database plus its `-wal` and `-shm` sidecars without creating a replacement. Only an `ENOENT` result for an already-absent target is ignorable; any other purge or permission failure SHALL fail startup, or mark readiness failed if discovered after startup.

Production caching with a positive TTL SHALL require a dedicated, valid `TOOL_CACHE_KEY_SECRET`. The exact environment value SHALL be canonical unpadded base64url using only `A-Z`, `a-z`, `0-9`, `_`, and `-`; strict decoding SHALL produce at least 32 bytes, and re-encoding those bytes as unpadded base64url SHALL reproduce the exact input. Whitespace, `=` padding, invalid characters/length, non-canonical trailing bits, malformed decoding, or fewer than 32 decoded bytes SHALL be rejected without logging the supplied value, its prefix, its encoded/decoded length, or decoded material. If the secret is absent or invalid in production, the lifecycle SHALL purge legacy cache files and then fail startup rather than use a fixed, public, WebSocket, or observability key. In non-production, an absent secret SHALL disable and purge caching while allowing the rest of the application to start; a supplied invalid secret SHALL be rejected after purge rather than treated as absent.

#### Scenario: Explicitly disabled cache is purged
- **WHEN** `TOOL_CACHE_TTL_MS=0` and any configured cache database, WAL, or SHM file exists
- **THEN** all three targets are removed before serving and no replacement cache file is created

#### Scenario: Disabled cache is already absent
- **WHEN** caching is disabled and all three configured cache targets return `ENOENT`
- **THEN** startup proceeds with cache health reporting an intentional disabled state

#### Scenario: Purge fails
- **WHEN** deletion of a configured cache database or sidecar fails for any reason other than `ENOENT`
- **THEN** the server does not become ready or accept requests, and the reported failure contains no cache path, URL, request term, or secret

#### Scenario: Production cache secret is missing
- **WHEN** `NODE_ENV=production`, `TOOL_CACHE_TTL_MS` is positive, and `TOOL_CACHE_KEY_SECRET` is absent or invalid
- **THEN** legacy cache files are purged if possible and startup fails with non-sensitive configuration guidance

#### Scenario: Development cache secret is missing
- **WHEN** the environment is not production, `TOOL_CACHE_TTL_MS` is positive, and `TOOL_CACHE_KEY_SECRET` is absent
- **THEN** caching is effectively disabled, configured cache files and sidecars are purged, and application startup may proceed

#### Scenario: Cache secret encoding is invalid
- **WHEN** `TOOL_CACHE_KEY_SECRET` contains whitespace, padding, malformed/non-canonical base64url, or decodes to fewer than 32 bytes
- **THEN** configured cache files and sidecars are purged, startup rejects the supplied secret in every environment, and logs/health contain only a generic configuration code

### Requirement: Cache identities are full-length keyed pseudonyms

An eligible request SHALL be identified only by a full-length HMAC-SHA256 computed with the strictly decoded `TOOL_CACHE_KEY_SECRET` bytes over an unambiguous, domain-separated and versioned canonical descriptor. The descriptor SHALL cover at least the cache-key domain, key-format version, response namespace (`json` or `text`), normalized `GET` method, canonical host, canonical path, and canonical query representation. Canonicalization SHALL reject malformed/ambiguous inputs, normalize equivalent allowed URLs deterministically, retain duplicate query pairs, and avoid collisions between field boundaries and response formats.

The complete 256-bit digest SHALL be the persisted lookup identity; the database SHALL NOT persist the raw URL, raw path/query, patient-derived term, reversible encoding, or a truncated observability hash. The key secret SHALL be independent from `WS_TOKEN_SECRET` and every logging/audit key, SHALL NOT be emitted through health or logs, and SHALL NOT have a fixed development fallback.

#### Scenario: Equivalent eligible requests share an identity
- **WHEN** two allowlisted public requests differ only in canonicalizable host casing, default port, percent-encoding, or query ordering that the endpoint declares order-insensitive
- **THEN** they produce the same full-length HMAC cache identity without storing either raw URL

#### Scenario: Materially different requests do not collide
- **WHEN** eligible requests differ by host, path, query pair/value, duplicate query pair, key-format version, or `json` versus `text` namespace
- **THEN** their canonical HMAC inputs and cache identities are distinct

#### Scenario: Short log hash is rejected as cache identity
- **WHEN** observability exposes a shortened correlation value or the WebSocket secret is configured
- **THEN** neither value is used to read, write, migrate, or correlate cache entries

#### Scenario: Cache database is inspected
- **WHEN** an operator or attacker with filesystem read access inspects the cache-key column
- **THEN** it contains only full-length keyed pseudonyms and does not contain raw request URLs or patient-derived request terms

### Requirement: Only allowlisted unauthenticated public GET requests are cached

Cache eligibility SHALL require HTTPS, method `GET`, an explicit public medical-API host/path allowlist match, no URL user information, no request body, and no authorization, cookie, API-key, proxy-authorization, or other credential-bearing header. Non-GET, body-bearing, authenticated, malformed, non-HTTPS, or non-allowlisted requests SHALL bypass both cache lookup and cache write while preserving their network behavior. Only successful allowlisted responses SHALL be cache candidates; redirects outside the allowlist, ignored-404 sentinels, rate limits, other 4xx/5xx responses, timeouts, transport failures, and parse failures SHALL NOT be cached.

#### Scenario: Public allowlisted GET is eligible
- **WHEN** a configured public medical endpoint receives an unauthenticated HTTPS `GET` with no body and a successful response
- **THEN** the response may be read from or written to its format namespace using the pseudonymous identity

#### Scenario: Credential-bearing request bypasses cache
- **WHEN** a request contains URL credentials or any authorization, cookie, API-key, or equivalent credential-bearing header
- **THEN** no cache identity is looked up or persisted and no response from another caller can be returned

#### Scenario: Body or non-GET request bypasses cache
- **WHEN** a request uses a method other than `GET` or carries a body
- **THEN** both cache read and write are bypassed even if its host/path is allowlisted

#### Scenario: Endpoint is not allowlisted
- **WHEN** a request host/path or a redirect target is not in the explicit public endpoint allowlist
- **THEN** the request is never served from or inserted into the tool cache

#### Scenario: Failed or malformed response is not cached
- **WHEN** the network response is not a successful cacheable response or its declared JSON/text representation cannot be consumed safely
- **THEN** no cache entry is written

### Requirement: Legacy raw-key cache data is destroyed during migration

Startup SHALL recognize the legacy schema that stores a raw URL key, or any unknown/incompatible cache schema version, and SHALL wipe the old table/database plus WAL/SHM state before creating an empty current schema. It SHALL NOT transform legacy URLs into HMAC keys or retain legacy plaintext rows during migration. A failure to destroy or rebuild the legacy cache SHALL fail startup/readiness without logging a legacy key or response.

#### Scenario: Legacy URL-key table is present
- **WHEN** startup opens a cache created by the raw-URL schema
- **THEN** all legacy rows and sidecar state are destroyed and an empty versioned pseudonymous-key cache is created before requests are accepted

#### Scenario: Legacy migration cannot complete
- **WHEN** the old database, table, WAL, or SHM state cannot be securely wiped or the current schema cannot be rebuilt
- **THEN** startup/readiness fails rather than serving or retaining the legacy cache

### Requirement: Logical expiry is enforced at startup, on read, and periodically

Cache entries SHALL become ineligible at `fetched_at + TOOL_CACHE_TTL_MS`. Startup SHALL remove expired rows before serving, every cache-read path SHALL check and delete expired data before returning a value and invoke expired-row cleanup, and periodic maintenance SHALL remove entries that are never read. An expired entry SHALL always be a miss and SHALL never be returned while awaiting a timer.

The cache and jobs databases SHALL enable SQLite `secure_delete`. Deletion maintenance SHALL checkpoint and truncate WAL state after deletion batches, and SHALL compact or rebuild the cache when required to reclaim free pages or enforce the physical database limit. Documentation SHALL distinguish these best-effort physical-remanence mitigations from guaranteed erasure on SSDs, copy-on-write filesystems, snapshots, backups, and external replicas.

#### Scenario: Expired row is requested before periodic cleanup
- **WHEN** a cache read encounters an entry at or beyond its TTL
- **THEN** the row is deleted, the request is treated as a miss, and the expired response is not returned

#### Scenario: Server restarts with expired rows
- **WHEN** the cache contains entries that expired during downtime
- **THEN** startup cleanup removes them before the server accepts requests

#### Scenario: Expired row is never read
- **WHEN** an entry expires but receives no subsequent lookup
- **THEN** periodic cleanup removes it and performs the configured WAL/free-page maintenance

#### Scenario: Logical deletion completes
- **WHEN** rows are deleted for TTL, eviction, migration, or explicit disablement
- **THEN** `secure_delete`, WAL checkpoint/truncation, and compaction/rebuild policy reduce physical remnants without claiming to erase backups, snapshots, or storage-device history

### Requirement: Plaintext cache values remain sensitive and bounded

Pseudonymizing request identities SHALL NOT reclassify cached response values as non-sensitive. Cache files and sidecars SHALL remain owner-only and deployment documentation SHALL require encrypted storage for the desired at-rest threat model. Operators SHALL be told to exclude the cache from backups or protect backup/snapshot copies with encryption and retention no longer than the approved policy.

The cache SHALL enforce configurable maximum serialized response bytes, maximum entry count, and maximum aggregate database bytes including WAL/SHM overhead. Oversized individual responses SHALL bypass writes. Capacity maintenance SHALL delete expired entries first and then evict the least-recently-used or oldest entries deterministically until all logical limits are met; it SHALL checkpoint/compact or rebuild and recheck physical size. If the physical bound cannot be restored safely, cache writes SHALL stop and readiness SHALL report failure rather than permit unbounded growth.

#### Scenario: Response exceeds its limit
- **WHEN** an eligible successful response serializes above the configured maximum response bytes
- **THEN** the response is returned to the caller but is not cached, and observability records only a generic bounded-cache bypass reason

#### Scenario: Entry limit is reached
- **WHEN** insertion would exceed the configured entry count
- **THEN** expired rows and then deterministic least-recently-used/oldest rows are evicted before the insertion can commit

#### Scenario: Physical database limit is reached
- **WHEN** the database plus WAL/SHM state exceeds the configured byte limit after logical eviction
- **THEN** maintenance checkpoints and compacts/rebuilds the cache, rechecks the bound, and marks cache readiness failed if the bound still cannot be enforced

#### Scenario: Backup policy is documented
- **WHEN** an operator configures volume snapshots or backups for the application data directory
- **THEN** documentation identifies the plaintext cache as sensitive and directs the operator to exclude it or apply encryption, access control, deletion, and bounded retention to every copy

### Requirement: Fetch and cache observability uses one safe request descriptor

`fetchJSON` and `fetchText` SHALL derive one validated safe request descriptor and use it consistently for cache eligibility, cache-hit observability, timeout errors, HTTP failures, DNS/TLS/network failures, malformed JSON/text handling, and nested error/cause handling. Observable fields and downstream error summaries SHALL use only allowlisted service/endpoint identifiers and generic method, status, duration, error-class, and cache-outcome metadata. They SHALL never contain a raw URL, query string, URL credential, patient-derived request term, cache key, response value, secret, arbitrary provider status text, or unsanitized nested error message, regardless of log-redaction mode.

#### Scenario: JSON or text cache hit is logged
- **WHEN** `fetchJSON` or `fetchText` returns a cached value
- **THEN** stdout/audit receive only the shared safe endpoint descriptor and generic cache-hit metadata, not the request URL, term, key, or value

#### Scenario: Transport failure contains nested sensitive data
- **WHEN** a timeout, DNS, TLS, socket, redirect, or other transport error contains the requested URL or term in its message or nested cause
- **THEN** emitted errors and logs use the safe descriptor and generic error classification without serializing the original message/cause

#### Scenario: Response parsing fails
- **WHEN** an allowlisted response contains malformed JSON, malformed text encoding, or an unsafe provider error/status string
- **THEN** the failure path uses the same safe descriptor, writes no cache entry, and emits no raw body, status text, URL, or request term

### Requirement: Cache health is non-sensitive and reflects readiness

Health output SHALL expose only coarse cache state needed for operations, such as enabled/disabled, ready/unready, aggregate entry count, aggregate byte usage, hit/miss/eviction counters, and generic disabled/failure classes. It SHALL NOT expose cache identities, URLs, hosts/paths tied to requests, query terms, response values or sizes per request, database paths, filesystem errors containing paths, or secret/configuration values. An intentional disabled-and-purged cache SHALL not make overall readiness fail; an enabled cache that cannot initialize, maintain bounds, or complete required purge/migration SHALL make readiness fail.

#### Scenario: Healthy enabled cache is reported
- **WHEN** health is requested for an initialized bounded cache
- **THEN** the response contains only aggregate non-sensitive state and no request or filesystem identity

#### Scenario: Cache is intentionally disabled
- **WHEN** cache lifecycle completed a required purge and caching is intentionally disabled
- **THEN** health reports disabled and ready without exposing why a secret is absent or where files were removed

#### Scenario: Cache maintenance is unsafe
- **WHEN** an enabled cache cannot enforce migration, retention, permission, or physical-size requirements
- **THEN** health/readiness reports a generic unready cache state and does not expose sensitive diagnostic values

### Requirement: Deployment passes secure cache configuration

The supported Docker build SHALL build `index.ts` as the full-stack bootstrap entrypoint and package every dynamically imported server chunk and emitted frontend asset needed by that bootstrap. The supported Compose deployment SHALL set `APP_DATA_DIR=/app/data`; fixed `DB_PATH=/app/data/jobs.sqlite`, `TOOL_CACHE_DB_PATH=/app/data/tool-cache.sqlite`, and `ORPHADATA_DB_PATH=/app/data/orphadata.sqlite`; an enabled audit path under `/app/data/audit`; and pass `TOOL_CACHE_TTL_MS`, `TOOL_CACHE_KEY_SECRET`, and every cache-bound setting into the application. The key secret SHALL be supplied by the operator rather than embedded in the image or repository. The container data directory SHALL be writable by the non-root runtime user and SHALL still pass the shared mount-bounded no-follow initializer/bootstrap validation.

The standard container artifact smoke profile SHALL set `TOOL_CACHE_TTL_MS=0`, omit the key secret, and prove strict disabled-cache purge/readiness. After generic test-integrity infrastructure is applied, this change SHALL register cache-disabled general bootstrap under canonical `server-test`, positive-TTL and missing/invalid-key startup matrices under canonical `cache-startup`, and positive cache logic under canonical `cache-enabled`. The authoritative parent SHALL allocate a unique temporary root exported as `APP_DATA_DIR` before child creation and generate a fresh canonical unpadded base64url secret decoding to exactly 32 bytes for every successful enabled `cache-startup` or `cache-enabled` child. Cache tests SHALL NOT create a nested process harness or a second resource allocator.

#### Scenario: Production starts through Compose
- **WHEN** an operator supplies a positive cache TTL and `TOOL_CACHE_KEY_SECRET` through the supported Compose environment
- **THEN** the bootstrap receives the intended fixed data paths plus TTL/key/bound settings, uses the dedicated mounted data directory, and can pass cache lifecycle readiness

#### Scenario: Compose secret is omitted
- **WHEN** production Compose requests caching but does not supply the dedicated key secret
- **THEN** the application follows the production purge-and-fail behavior rather than silently caching with another key

#### Scenario: Container smoke disables cache explicitly
- **WHEN** CI runs the standard Docker/Compose artifact smoke
- **THEN** its environment sets `TOOL_CACHE_TTL_MS=0`, the bootstrap starts without a cache key, strict purge/readiness is exercised, and no tool-cache database is created

#### Scenario: Cache-enabled profile uses parent-owned isolation
- **WHEN** the cache-enabled test profile runs
- **THEN** the authoritative parent runner supplies one unique `APP_DATA_DIR` and one freshly generated valid cache key before the child imports the bootstrap or cache modules, with no nested child runner

#### Scenario: Rollback digest is cumulatively eligible
- **WHEN** an operator selects an immutable digest for rollback against the retained application data volume
- **THEN** release evidence proves that digest satisfies the current Docker bootstrap/artifact, data initializer/path, redaction/audit, untrusted-content encoding, and clinical-review eligibility gates; otherwise the cache is disabled and strictly purged and the deployment is fixed forward
