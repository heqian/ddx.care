## Context

`index.ts` statically imports `progressStore`, routes, the logger, and cache modules before executing `validateConfig()`. ESM evaluates those imports first: `src/backend/progress-store.ts` constructs the file-backed `progressStore` singleton at module load, and `src/backend/utils/logger.ts` can construct `AuditLogger` at module load. Setting a umask in the current entrypoint body would therefore be too late.

The current tool cache stores the raw URL as its primary key and the JSON/text response in plaintext. `fetchJSON` and `fetchText` consult it for every request regardless of method, body, credentials, or endpoint, and cache-hit/timeout paths include the raw URL. `index.ts` skips `initToolCache()` when caching is disabled, so old database, WAL, and SHM files remain. Initialization errors are warnings, expiry is checked only for the requested row without deleting it, cleanup first waits for a timer, and no response/entry/database bound exists.

The jobs, tool-cache, Orphadata, and optional audit-log paths default relative to the working directory. Store constructors do not explicitly secure existing files or sidecars. The audit logger creates directories/files with ambient permissions, purges only the active file by age, and receives the same structured record written to stdout. In contrast, progress events intentionally contain tool arguments and clinically useful summaries; they are persisted in the jobs database and returned only through job-capability routes in secured production deployments.

Compose currently mounts `/app/data` and sets the three database paths, but does not pass the tool-cache TTL, a dedicated cache-key secret, or cache bounds. The current Dockerfile does not create/tighten `/app/data` before switching to the non-root runtime user. See `proposal.md` for motivation and the two delta specs for normative behavior.

## Goals / Non-Goals

**Goals:**
- Make the security bootstrap run before any sensitive singleton construction.
- Fail closed for jobs-store security and every required cache purge/migration action.
- Eliminate raw request identity from cache keys and observability without misclassifying plaintext cached responses as safe.
- Restrict cache eligibility, enforce logical TTL on every path, reduce physical remnants, and bound disk consumption.
- Keep authorized progress useful while ensuring stdout/audit redaction is complete and consistent.
- Give operators an explicit migration, historical-log purge, backup, disk-encryption, and rollback procedure.
- Cover startup ordering and failure modes in isolated processes rather than relying on Bun's shared module registry.

**Non-Goals:**
- Application-level encryption of cached responses or SQLCipher key management.
- Claiming secure erasure from SSDs, copy-on-write filesystems, snapshots, backups, or external log systems.
- Removing clinically useful tool details from capability-authorized progress events.
- Caching authenticated/private APIs, non-GET requests, or arbitrary future hosts.
- Automatically deleting data from operator-managed container runtimes, journals, log aggregators, or backup systems.
- Changing the medical APIs, request semantics, or the existing `JOB_TTL_MS` authorization/lifecycle contract.

## Decisions

### D1: Use a true pre-import bootstrap and a dedicated data tree

**Decision:** `test-integrity-and-hermeticity` first extracts and tests the side-effect-free injected `src/backend/server.ts` composition seam without changing `index.ts`. This change then converts `index.ts` into the production bootstrap with no static application imports. Its first security action sets `process.umask(0o077)`; only then does it `await import("./src/backend/server")` and invoke the server module's production start function. This change owns that bootstrap boundary and requires every supported production launcher to execute `index.ts`, not `src/backend/server.ts` directly.

Add `APP_DATA_DIR` with a development default of `./data`; Compose sets `/app/data`. Relative `DB_PATH`, `TOOL_CACHE_DB_PATH`, `ORPHADATA_DB_PATH`, and enabled `AUDIT_LOG_PATH` values resolve beneath this root. Absolute sensitive paths are accepted only when their canonical location is inside the configured root.

Use one data-tree security implementation for the root-only container initializer and the non-root application bootstrap. It captures the `APP_DATA_DIR` mount identity, performs a complete read-only preflight using no-follow metadata for the root and every descendant/path component, and rejects traversal, symlinks, unsupported file types, a filesystem/repository/cwd root, paths outside the canonical root, and nested mount crossings. No chmod, chown, unlink, open-for-write, SQLite open, or other mutation occurs until the full candidate tree passes this preflight. The mutation pass remains bounded to the validated mount/root and uses no-follow operations or descriptor-relative equivalents so a path cannot be swapped to an external target.

After preflight, create and explicitly tighten `APP_DATA_DIR` and nested dedicated leaf directories to `0700`. Tighten an existing jobs/cache database, WAL, SHM, active audit log, and matching rotated audit logs to `0600`; recheck sidecars after enabling WAL because SQLite can create them during open. Never chmod the repository root, cwd, `/`, another mount, or a shared ancestor. Orphadata is public reference data, but its database follows the same owner-only baseline for consistency.

Jobs-store directory/file permission failure, SQLite open failure, required PRAGMA failure, or schema initialization failure propagates out of startup before `Bun.serve()`. Enabled cache security/lifecycle failures do the same. An explicitly disabled optional cache can be ready only after a successful purge. Audit logging, when configured, must secure its leaves before accepting writes rather than silently writing insecurely.

**Rationale:** A statement at the top of the current statically importing entrypoint is not a bootstrap. One dynamic server-module boundary is auditable and remains compatible with Docker's full-stack entry build. A dedicated, mount-bounded no-follow root avoids chmodding `dirname("jobs.sqlite")`, traversing attacker-controlled links, or recursively mutating a nested mount while still repairing files created by older versions.

**Alternatives considered:**
- Set umask after existing imports: rejected because singleton constructors have already run.
- Rely only on umask: rejected because it does not repair existing files or directories.
- Chmod every configured parent: rejected because a relative leaf can resolve to the repository root and an absolute leaf can live in a shared mount.
- Recursive `chown`/`chmod` that follows links or mutates while discovering: rejected because an escape found late would leave partial external mutations.
- Keep all default databases in the repository root: rejected because it prevents safe directory hardening and mixes sensitive runtime data with source.

### D2: Model cache startup as an unconditional lifecycle state machine

**Decision:** Replace the conditional `if (TOOL_CACHE_ENABLED) initToolCache()` call with one awaited lifecycle invocation before server construction. It returns a typed state used by routes/health rather than relying only on module-level `TOOL_CACHE_ENABLED`.

The state transitions are:
1. Validate numeric/path/bound configuration and prepare the dedicated data directory.
2. If `TOOL_CACHE_TTL_MS=0`, close any handle, purge the configured database, `-wal`, and `-shm`, and return `disabled-ready`.
3. If TTL is positive and `TOOL_CACHE_KEY_SECRET` is absent in non-production, perform the same purge and return `disabled-ready`.
4. If TTL is positive and the key secret is absent in production, purge first and then throw a non-sensitive configuration error. Secret validation must not happen so early that it leaves an old cache behind.
5. If a secret is supplied but strict decoding rejects it in any environment, purge first and then throw the same generic configuration class; never downgrade a malformed value to absent development mode.
6. If enabled, tighten existing leaves, detect/migrate schema as described in D4, open/configure the database, run startup expiry/capacity maintenance, and return `enabled-ready`.

The purge helper attempts all three exact configured targets and ignores only errors whose code is `ENOENT`. It aggregates any other failures and throws without including filesystem paths in logs/health. It never creates a parent or database in disabled mode. Enabled initialization errors are fatal at startup. A runtime maintenance failure transitions cache readiness to unready, bypasses further cache writes, and makes `/v1/health` fail readiness without exposing sensitive diagnostics.

**Rationale:** Privacy settings must describe data on disk, not only whether new reads/writes occur. Running lifecycle unconditionally also makes disabled/misconfigured behavior testable and prevents stale cache files from surviving silently.

**Alternatives considered:**
- Best-effort unlink with a warning: rejected because disabled caching could still leave PHI-derived data behind while health reports success.
- Validate a missing production secret before purge: rejected because the process would fail but retain the insecure legacy cache.
- Silently disable production caching without a secret: rejected because it masks a security-relevant configuration error.

### D3: Use a dedicated full-length HMAC identity with conservative canonicalization

**Decision:** Add `TOOL_CACHE_KEY_SECRET`, independent from `WS_TOKEN_SECRET` and all log correlation keys. Its only accepted representation is canonical unpadded base64url. Validation rejects an empty supplied value, any leading/internal/trailing whitespace, `=` padding, characters outside `[A-Za-z0-9_-]`, impossible base64url lengths, decode failure, non-zero/non-canonical trailing bits, a re-encoded value that differs from the exact input, or decoded material shorter than 32 bytes. The decoder returns bytes, and those bytes are the HMAC key. Validation/logging exposes only a stable generic error code, never the input, prefix, encoded/decoded length, or decoded bytes.

Operators and the authoritative cache-enabled test profile generate 32 random bytes and encode them with unpadded base64url (for example, Bun/Node's `randomBytes(32).toString("base64url")`). There is no fixed development key. An absent non-production value disables/purges caching; a supplied malformed or short value fails after purge. The HMAC output is the full 32-byte digest (stored as a BLOB) or all 64 lowercase hexadecimal characters; it is never truncated.

Build the HMAC input from length-delimited fields so delimiters cannot collide:

```text
domain = "ddx.care/tool-cache-key"
version = "v1"
namespace = "json" | "text"
method = "GET"
host = canonical HTTPS host and non-default port
path = canonical absolute path
query = canonical ordered sequence of retained name/value pairs
```

Canonicalization parses the URL once, rejects user information, fragments, malformed percent escapes, control characters, non-HTTPS schemes, and endpoints outside D5's policy. It lowercases/IDNA-normalizes the host, removes a default `:443`, resolves dot segments, and normalizes percent-escape casing without decoding reserved path separators. For current allowlisted APIs, query order is declared semantically irrelevant: normalize names/values to one RFC 3986 encoding, sort by encoded name then encoded value, and retain every duplicate pair. If a future API is order-sensitive, it requires a new allowlist policy and key version rather than weakening v1.

The canonical URL is used only as ephemeral HMAC input. It is not persisted or logged. JSON and text namespaces are included to prevent a text entry from satisfying a JSON read. A short hash may be used only as an optional non-cache observability correlation value if separately keyed, but this design does not need one and explicitly forbids using one as cache identity.

**Rationale:** An unkeyed hash of a finite medical vocabulary is dictionary-attackable. Strict canonical base64url prevents multiple textual spellings, accidental padded standard base64, whitespace-bearing secret injection, and silently weak keys. A full HMAC hides request terms from a database-only reader while preserving exact lookup semantics; domain separation prevents cross-protocol key reuse.

**Alternatives considered:**
- Truncated HMAC derived from `WS_TOKEN_SECRET`: rejected due to key reuse, rotation coupling, smaller identity space, and confusion between logging and storage identities.
- Encrypt raw URLs: rejected because it adds nonce/key-rotation complexity while deterministic HMAC is sufficient for equality lookup.
- Hash only the query: rejected because different services, paths, or formats could collide semantically.
- Store host/path next to the HMAC: rejected because future endpoints may put patient terms in path segments and the cache does not need those fields.

### D4: Rebuild the legacy schema instead of translating it

**Decision:** Version the cache schema (SQLite `user_version` or an equivalent metadata row). The current table stores only pseudonymous identity and bounded metadata, for example:

```text
tool_cache(
  cache_key BLOB PRIMARY KEY,
  namespace TEXT CHECK(namespace IN ('json', 'text')),
  response TEXT NOT NULL,
  response_bytes INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL
)
```

On startup, inspect schema metadata before preparing statements. If the raw `url` column, an unknown version, or incompatible columns are present, close the handle and use the strict purge helper on the database/WAL/SHM set, then create an empty current database. Do not read raw legacy keys to generate HMACs and do not copy old responses. Run secure startup maintenance only after the new schema exists.

**Rationale:** In-place conversion would keep sensitive raw pages/WAL frames and would require loading every legacy URL. The cache is disposable, so an empty rebuild is simpler and safer.

**Alternatives considered:**
- `ALTER TABLE` and backfill HMACs: rejected because old raw data remains physically recoverable and migration code must process it.
- Leave the old table beside a new one until TTL: rejected because the privacy defect persists for another retention window.

### D5: Make cache eligibility an explicit endpoint policy

**Decision:** A request is cacheable only if all of the following hold:
- HTTPS `GET` with no body, URL user information, or fragment.
- No `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`, or other policy-declared credential header; no credentialed request mode.
- Initial and final response URL match an exact allowlist entry.
- Response is HTTP 200 and its namespace parser succeeds.

The initial allowlist maps stable endpoint IDs to the current exact public host/path combinations used through `src/backend/tools/utils/fetch.ts`:
- `api.fda.gov`: `/drug/event.json`, `/drug/label.json`, `/drug/enforcement.json`, `/drug/shortages.json`, `/other/substance.json`, `/food/event.json`, and `/device/event.json`.
- `rxnav.nlm.nih.gov`: `/REST/drugs.json` and `/REST/spellingsuggestions.json`.
- `clinicaltrials.gov`: `/api/v2/studies`.
- `clinicaltables.nlm.nih.gov`: current HPO and LOINC search endpoints under `/api`.
- `wsearch.nlm.nih.gov`: `/ws/query`.

The policy is deny-by-default and associates each host/path with a non-sensitive service/endpoint ID and query-order rule. A redirect can complete for existing fetch behavior, but its response is not cached unless `response.url` also matches policy. Non-GET/body/authenticated/non-allowlisted requests bypass both lookup and insertion. HTTP errors, 429, ignored-404 sentinels, redirects that leave policy, timeout/transport errors, and parse errors never write entries.

**Rationale:** The current generic utility accepts `RequestInit`; caching every call creates cross-user and credential leakage risk as soon as a caller adds headers or a non-GET method. Explicit public endpoint policy keeps the safe surface reviewable.

**Alternatives considered:**
- Cache every GET and vary on all headers: rejected because correctly modeling private/cache-control semantics is complex and unnecessary for the small public API set.
- Key authenticated requests by auth header: rejected because secrets would influence persistent identity and private responses should not enter this cache.

### D6: Share one descriptor and one execution path for JSON/text fetches

**Decision:** Refactor `fetchJSON` and `fetchText` around one internal request executor. It creates the D3/D5 descriptor once, performs namespaced cache lookup, runs network fetch and parsing, and conditionally inserts the result. Format-specific parsing remains a small callback; cache eligibility, timeout, redirect, status, and error behavior is shared.

The descriptor exposes only approved observability fields such as `{ service, endpoint, method: "GET" }`; it never exposes the original URL, canonical URL, HMAC input/output, query, or response. Cache-hit logs add only namespace and `cacheOutcome`. Error construction maps timeout, abort, DNS, TLS, socket, redirect, HTTP status, and parse failures to existing typed error classes with static endpoint labels and generic classifications. Do not concatenate `url`, provider `statusText`, response bodies, original `error.message`, or nested `cause` data. If an allowlisted machine error code is useful, copy only that code into a new safe error; do not attach the original nested error to a loggable object.

Cache/fetch logs follow this always-safe rule even when `AUDIT_LOG_REDACT_TOOL_ARGS=0`. The redaction flag is not a license to emit request URLs or cache identities.

**Rationale:** Patching only the explicit timeout template misses native fetch messages, DNS/TLS causes, malformed JSON exceptions, and future `fetchText` branches. A single descriptor/executor makes non-disclosure an invariant.

**Alternatives considered:**
- Regex-replace URLs in caught messages: rejected because terms can appear without a URL and nested objects can bypass string replacement.
- Keep duplicate JSON/text implementations: rejected because security fixes would drift.

### D7: Redact at the stdout/audit boundary without mutating progress

**Decision:** Treat application stdout and `AuditLogger` as two sinks for the same already-sanitized structured entry. Configuration accepts only `AUDIT_LOG_REDACT_TOOL_ARGS=1` or `0`, defaults to `1`, and forces the effective production value to `1`. `NODE_ENV=production` plus explicit `0` or any unsupported value is a fatal pre-traffic configuration error; it is never silently coerced. Outside production, only explicit `0` enables break-glass raw logging and emits a generic startup warning. When redaction is enabled, event-specific logger methods construct an allowlisted record and discard raw values before calling either sink:
- Tool calls retain agent/job/tool/call identifiers and argument count/presence, not `message` or `toolArgs`.
- Tool results retain status, retry classification, duration, and safe counts/categories, not raw result, `resultSummary`, free-form provider error, or cause.
- Workflow/tool failures retain stable error type/code and duration, not arbitrary `error.message`.
- Cache/fetch events always use D6's safe descriptor regardless of mode.

Add a final sink-level defense that recursively drops known sensitive fields (`url`, query variants, headers, body, args, result, response, message, error, cause, stack) and rejects unexpected objects/strings for sensitive event families in redacted mode. Both human and JSON output pass through the same path before console output and audit append.

Do not apply this sanitizer to `ProgressEvent` storage or WebSocket/status responses. `tool-event-hooks.ts` continues to emit clinically useful tool arguments and progress summaries to the capability-authorized job. The logger receives separately constructed metadata, never a spread copy of the progress event. This progress remains PHI-derived data in `jobs.sqlite`, protected by production job tokens and deleted under `JOB_TTL_MS`; it is not an audit log and does not use `AUDIT_LOG_RETENTION_HOURS`.

When redaction is explicitly disabled for non-production break-glass debugging, tool arguments/detail reach both stdout and audit as required by the existing contract, but cache/fetch raw URLs remain prohibited. Production has no raw mode.

Startup tightens the audit directory, active file, and every matching rotated file, then runs age purge before readiness. The existing periodic schedule remains at most hourly and processes active plus rotated files. A mixed retained/expired file is rewritten through a same-directory temporary file opened owner-only, flushed as appropriate, chmod-verified, and atomically renamed; the original remains intact until replacement. Fully expired rotations can be securely removed only after no-follow/mount-bounded validation. Startup purge/permission/replacement failure is fatal before traffic. A periodic failure preserves the original, records only a generic failure code, marks readiness unready, and retries on the bounded schedule; readiness returns only after a successful complete purge.

**Rationale:** Changing the shared progress summary to a generic value would degrade the authorized UI yet still miss free-form messages and logger calls. Redaction belongs at observability boundaries, with defense-in-depth at the sink. Production rejection removes a configuration foot-gun, while atomic active/rotation purge prevents retention enforcement from corrupting evidence or exposing partial files.

**Alternatives considered:**
- Redact `summarizeToolResult()` globally: rejected because it mutates authorized progress and does not cover call messages or nested errors.
- Redact only the file audit logger: rejected because stdout is commonly retained by Docker, journald, and aggregators.
- Permit production `AUDIT_LOG_REDACT_TOOL_ARGS=0` with a warning: rejected because production log pipelines retain stdout/audit data outside the process lifetime.

### D8: Enforce logical TTL and mitigate physical retention

**Decision:** Treat logical and physical retention as separate controls.

Logical cache retention:
- Run a full expired-row cleanup during enabled-cache startup before serving.
- On every read, compare `fetched_at` to TTL before deserializing/returning. Delete an expired requested row and invoke expired-row cleanup in the same maintenance path; it is always a miss.
- Keep the periodic cleanup for entries that are never read.
- Parse failures delete the unusable entry and miss rather than retaining it.

Physical mitigation:
- Enable and verify `PRAGMA secure_delete=ON` for the jobs and tool-cache databases.
- Keep scrub-and-delete for terminal jobs, but execute the scrub/delete atomically and checkpoint after deletion batches.
- After cache/job deletion batches, issue `PRAGMA wal_checkpoint(TRUNCATE)` on a throttled maintenance path so old WAL frames do not persist indefinitely.
- When the cache remains over its physical cap after eviction/checkpoint, run a controlled `VACUUM`/rebuild with free-space checks, then remeasure database plus WAL/SHM bytes. If it cannot complete or enforce the bound, stop cache writes and fail readiness.

These controls do not promise cryptographic erasure. Documentation states that disk/volume encryption remains the operator's responsibility and that cache databases should be excluded from backups where possible. If backed up or snapshotted, every copy needs equivalent encryption, access control, deletion, and bounded retention. Operators also configure volume quotas/alerts with headroom for SQLite rebuilds.

**Rationale:** TTL checks prevent stale serving, while `DELETE` alone does not remove content from WAL, free pages, snapshots, or backups. `secure_delete` plus checkpoint/rebuild narrows local recovery without overstating guarantees.

**Alternatives considered:**
- Rely on periodic `DELETE`: rejected because expired data can be returned before the timer and remains in WAL/free pages.
- Run `VACUUM` after every read/delete: rejected because it is blocking and write-amplifying; checkpointing is batched and rebuild occurs by threshold/maintenance policy.
- Claim owner-only mode is encryption: rejected because root, disk theft, snapshots, and backup readers remain in scope.

### D9: Bound response, entry, and physical database size

**Decision:** Add validated configuration with conservative defaults:
- `TOOL_CACHE_MAX_RESPONSE_BYTES=2097152` (2 MiB serialized value).
- `TOOL_CACHE_MAX_ENTRIES=5000`.
- `TOOL_CACHE_MAX_DB_BYTES=268435456` (256 MiB, measured across database/WAL/SHM).

Serialize once and measure bytes before insertion. An oversized response is returned normally but not cached. Store `response_bytes` and `last_accessed_at`; a hit updates recency without exposing identity. Before/after insertion, remove expired rows, then evict least-recently-used entries (tie-break by `fetched_at` and cache key for deterministic behavior) until response-byte and entry limits fit. Measure physical files using safe internal paths, checkpoint/rebuild as in D8 when the aggregate byte cap is exceeded, and recheck before reporting ready.

Health may report only enabled/ready state, aggregate entries/bytes, and aggregate hit/miss/eviction/oversize-bypass counters. It never returns paths, keys, endpoint/request detail, per-entry sizes, response data, secret state, or raw filesystem errors. Intentionally disabled-and-purged cache is healthy; an enabled cache unable to maintain bounds is not ready.

**Rationale:** TTL alone does not bound growth during a traffic spike, and SQLite files do not shrink merely because rows are deleted.

**Alternatives considered:**
- Entry count only: rejected because response sizes vary significantly.
- Filesystem size only: rejected because WAL/free-page behavior can trigger late, expensive eviction without logical accounting.
- Delete the whole cache whenever full: viable but unnecessarily destroys hot bounded data; retain as a recovery action after maintenance failure.

### D10: Deploy with an explicit secret/data contract and purge historical logs

**Decision:** Docker's full-stack production build uses `index.ts` as its entrypoint and retains every dynamic server chunk and emitted browser asset. The final image runs the emitted bootstrap (`dist/index.js`), not `src/backend/server.ts` or source. The root-only data-init service uses the shared D1 mount-bounded no-follow initializer rather than recursive link-following shell chmod/chown; the non-root bootstrap validates the same tree again before opening stores.

Compose owns these exact production values: `APP_DATA_DIR=/app/data`, `DB_PATH=/app/data/jobs.sqlite`, `TOOL_CACHE_DB_PATH=/app/data/tool-cache.sqlite`, `ORPHADATA_DB_PATH=/app/data/orphadata.sqlite`, fixed internal `PORT=3000`, `NODE_ENV=production`, and `AUDIT_LOG_REDACT_TOOL_ARGS=1`. An enabled audit log is fixed beneath `/app/data/audit`. The app environment supplies `TOOL_CACHE_TTL_MS`, strict `TOOL_CACHE_KEY_SECRET`, and all three cache bounds. The secret remains unset in source/image and is supplied through deployment secret management. `.dockerignore` excludes `*.sqlite*`, the data directory, and logs.

The normal Docker artifact smoke uses `TOOL_CACHE_TTL_MS=0`, omits `TOOL_CACHE_KEY_SECRET`, and proves the disabled purge/readiness path without creating a cache database. Cache-enabled behavior belongs to the dedicated test-integrity profile with a generated valid secret, not the image smoke.

The rollout is traffic-gated in this order:
1. Stop admission at Caddy/the deployment gate, drain active workflows and every old application/audit writer, then stop the old app so no old-format log or cache write can race cleanup.
2. Start the candidate digest and initializer with traffic still gated. Let the bootstrap validate/tighten the mount, enforce production redaction, purge active/rotated audit retention, purge/rebuild legacy cache state, clean expiry, and become internally ready.
3. Verify owner/modes, non-sensitive readiness, current schema/bounds, and canary absence in new stdout/audit while the release remains inaccessible to users.
4. Purge and verify old active/rotated application/audit files, container stdout/stderr, host journals, log-shipper buffers, aggregators, archives, backups, snapshots, and object-store copies under their governing systems. Record residual retention and accountable owners.
5. Admit traffic only after local and external purge verification is complete and the candidate remains ready; then monitor retention and cache health.

A digest is eligible for rollback only when immutable release evidence proves it satisfies every currently cumulative gate relevant to the retained volume and traffic: Docker bootstrap/full-stack artifact parity, data initializer and fixed-path safety, this change's cache/redaction/audit controls and secret encoding, untrusted-content encoding, and current clinician-reviewed clinical release eligibility. If no prior digest satisfies all gates, keep traffic gated, set `TOOL_CACHE_TTL_MS=0`, strictly purge cache database/WAL/SHM, and fix forward. A digest that can recreate raw cache keys, follow an unsafe data tree, permit production raw logging, omit required encoding, or activate clinically ineligible prompts is never a rollback target.

Caddy query redaction remains defense-in-depth for incoming capability parameters but does not solve outbound medical-tool URLs or application stdout. The application rules are authoritative.

**Rationale:** Code cannot retroactively remove already-shipped logs or snapshots, and purging while old writers or user traffic remain active creates a race. Compose must pass the exact configuration that production startup validates, Docker must execute the actual umask bootstrap, and rollback eligibility must be cumulative rather than merely packaging-compatible.

**Alternatives considered:**
- Derive the cache key from an existing deployment secret: rejected due to cross-purpose key reuse and coupled rotation.
- Leave cache variables implicit in Compose: rejected because current Compose silently omits documented cache controls.
- Run the container smoke with default positive cache TTL: rejected because artifact packaging smoke should not require a persistent secret and must exercise strict disabled purge.
- Roll back to any prior Docker-parity digest: rejected because an older digest can be incompatible with retained data, redaction, encoding, or clinical release gates.

### D11: Use the authoritative test-integrity parent runner

**Decision:** Do not add a child launcher, nested `bun` process, temporary-root allocator, or cleanup harness to `tool-cache.test.ts` or another cache test. The authoritative manifest and Bun parent runner from `test-integrity-and-hermeticity` own process isolation. Before each child is created, that runner allocates a unique absolute `APP_DATA_DIR`, places every database/audit path beneath it, allocates the port, sanitizes inherited settings, installs the non-live network guard, and owns teardown/sentinel verification.

The base profile sets `TOOL_CACHE_TTL_MS=0`, no cache key, and disabled Orphadata. Canonical `cache-enabled` sets a positive TTL and generates fresh 32-byte random material encoded as canonical unpadded base64url for `TOOL_CACHE_KEY_SECRET`; it never hard-codes or inherits the key. Canonical `server-test` exercises cache-disabled general behavior at the actual `index.ts` bootstrap/server-module boundary. Canonical `cache-startup` owns positive-TTL and missing/invalid-key startup matrices through declarative disabled, enabled, or expected-failure modes fixed by the parent before import; successful enabled cases receive the same generated strict key. Config/lifecycle failure matrices use these parent-owned startup cases and explicit production seams rather than spawning grandchildren or mutating import-time environment.

The matrix covers:
- umask precedes dynamic server-module import; Docker/test bootstrap starts with no static app import; new and pre-existing directories/files/sidecars/logs become `0700`/`0600`; repository-root mode is unchanged;
- insecure/unwritable jobs data and mount/symlink/path escapes fail before any mutation or listening;
- disabled cache purges database/WAL/SHM, tolerates only absent files, and fails on permission/deletion errors;
- production missing key purges then exits; development missing key purges and starts disabled; supplied whitespace/padded/malformed/non-canonical/short keys purge and fail without disclosure;
- enabled startup rejects/purges the raw-key schema, cleans expired rows, enforces bounds, and reports only non-sensitive health;
- JSON/text namespace separation, canonical HMAC behavior, allowlist and auth/body/method bypass, TTL-on-read deletion, secure-delete/checkpoint settings, oversized responses, eviction, and physical-bound failure;
- cache hits plus timeout, DNS, TLS, redirect, HTTP, malformed JSON/text, and nested error paths never expose canary terms/URLs in stdout or audit;
- production rejects raw logging; explicit non-production break-glass retains expected detail; redacted tool messages/arguments/results/errors remain absent from both sinks while authorized progress remains in the temporary jobs store;
- startup and periodic audit purge cover active/rotated files, atomic owner-only replacement, original preservation, and readiness failure/recovery;
- Compose passes fixed data/cache settings, Docker smoke sets TTL zero, and the cache-enabled parent profile supplies a generated valid key.

**Rationale:** Bun shares the module registry across tests, and several current suites import config/store singletons at module load. The cohort already establishes one authoritative fresh-process/resource boundary. Reusing it prevents competing cleanup, port, environment, network, and sentinel ownership.

**Alternatives considered:**
- Mutate `process.env` and append import query strings in one process: rejected because transitive modules and singletons can remain cached.
- Add a cache-local child harness: rejected because nested launchers duplicate the authoritative runner and make resource/sentinel ownership ambiguous.
- Test helper functions only: rejected for the bootstrap happy path; the parent-owned server child proves actual ordering while injected lifecycle tests cover deterministic failure matrices.

## Risks / Trade-offs

- **[Production startup becomes stricter]** -> Existing deployments with positive TTL but no dedicated key, insecure paths, unwritable files, or failed legacy purge will not start. **Mitigation:** preflight configuration and the staged migration checklist provide non-sensitive actionable errors; privacy-critical failures are intentionally fail closed.
- **[Strict secret encoding rejects formerly accepted strings]** -> Padded base64, copied whitespace, ordinary passphrases, and short random values fail. **Mitigation:** generate 32 random bytes directly as unpadded base64url, validate before the maintenance window, and never print the value during diagnosis.
- **[Mount-bounded traversal rejects nested mounts and links]** -> A volume layout that places another mount or symlink beneath `APP_DATA_DIR` will not initialize. **Mitigation:** keep one dedicated flat application-data mount with real directories and move external storage behind a separately reviewed design rather than weakening traversal.
- **[Production raw-log rejection can block startup]** -> A legacy `AUDIT_LOG_REDACT_TOOL_ARGS=0` deployment will fail. **Mitigation:** force `1` in Compose and preflight rendered environment before stopping old writers.
- **[Dedicated data root changes defaults]** -> Existing repository-root database files are no longer the default live stores. **Mitigation:** document path migration for jobs data, intentionally wipe the disposable legacy tool cache, and require operators to set `APP_DATA_DIR`/leaf paths explicitly before rollout.
- **[HMAC still reveals equality]** -> A database observer can see repeated pseudonymous keys and access times. **Mitigation:** use a high-entropy dedicated key, persist no request descriptors, bound TTL, and document that response values/timing remain sensitive.
- **[Plaintext responses remain readable to privileged storage access]** -> HMAC protects request identity only. **Mitigation:** owner-only modes, non-root runtime, disk/volume encryption, cache backup exclusion, and short bounded retention; application-level encryption remains out of scope.
- **[On-read cleanup and recency writes add SQLite work]** -> Reads can trigger deletion and last-access updates. **Mitigation:** indexed timestamps, small transactions, batched checkpointing, and conservative limits.
- **[Checkpoint/VACUUM can block or need temporary disk]** -> Physical maintenance may affect latency or fail on a full volume. **Mitigation:** run heavy rebuilds at startup/maintenance thresholds, reserve disk headroom, monitor aggregate bytes, and fail cache readiness rather than grow unbounded.
- **[Authorized progress remains PHI]** -> Redacting logs does not remove sensitive details from job progress. **Mitigation:** this is intentional application behavior protected by capability authorization, owner-only jobs storage, `JOB_TTL_MS`, secure-delete/checkpoint maintenance, and disk encryption responsibility.
- **[Historical copies are outside application control]** -> Container logs, journals, aggregators, backups, and snapshots can retain old disclosures. **Mitigation:** rollout has explicit operator purge/verification gates and documentation does not claim application deletion reaches them.
- **[Periodic audit purge can remove readiness]** -> A permission or atomic-replacement failure can drain traffic from an otherwise running process. **Mitigation:** preserve original files, report a generic code, reserve disk space, alert, and restore readiness only after a complete successful retry.
- **[Secret rotation invalidates cache hits]** -> A new `TOOL_CACHE_KEY_SECRET` makes existing pseudonyms unreachable. **Mitigation:** rotate monotonically by disabling cache for one startup to perform a strict purge, then install the new key and re-enable; never restore an old raw-key backup.

## Migration Plan

1. Apply `test-integrity-and-hermeticity` first for the generic parent runner, canonical profiles, temporary environment, discovery, and side-effect-free injected server seam; it does not implement this change's resolver or bootstrap.
2. Implement the `APP_DATA_DIR` resolver, no-follow initializer, `index.ts` umask/dynamic-server bootstrap, cache/redaction behavior, and canonical `server-test`/`cache-startup`/`cache-enabled` registrations in this change.
3. Before deployment, inventory current jobs/cache/audit paths and every application, container, journal, shipper, aggregator, archive, backup, and snapshot destination. Configure one flat `APP_DATA_DIR=/app/data` mount and fixed leaf paths; verify no nested mount/symlink; validate encrypted storage, quota/alerts, rebuild/replacement headroom, and backup policy.
4. Generate at least 32 random bytes directly as canonical unpadded base64url in deployment secret management. Preflight the exact secret, cache bounds, production redaction value `1`, Docker-owned Compose render, bootstrap bundle/chunks, and candidate cumulative release evidence without logging the secret.
5. Stop traffic admission, drain active workflows and old writers, and stop the old application. Do not purge while an old process can recreate raw cache/log data.
6. Start the candidate digest and shared data initializer behind the closed traffic gate. The bootstrap applies umask before dynamically importing the server, validates the mount no-follow before mutation, opens jobs fail-closed, destroys raw-key cache state, enforces startup active/rotated audit retention, and reaches internal readiness.
7. While traffic remains gated, verify owner/modes, fixed paths, cache schema/bounds, production redaction, authorized progress separation, and canary absence in new stdout/audit.
8. Purge and verify historical active/rotated application/audit logs, container-runtime logs, host journals, shipper buffers, aggregated logs, archives, backups, snapshots, and object-store copies. Record residual retention and accountable owners.
9. Admit traffic only after all required purge verification and candidate readiness gates pass. Monitor cache aggregate bytes, evictions, bypasses, audit purge readiness, filesystem capacity, and external retention.

Rollback is monotonic and immutable-digest-only. Retain the pre-import bootstrap, mount-bounded no-follow data contract, owner-only permissions, strict key encoding, safe descriptors, production redaction/audit retention, untrusted-content encoding, and clinical release gates. A previous digest is selectable only if evidence proves cumulative Docker/data/redaction/encoding/clinical eligibility against the retained volume. Otherwise keep traffic gated, set `TOOL_CACHE_TTL_MS=0`, perform a successful strict purge of database/WAL/SHM, and fix forward with a fully gated digest. Never restore a raw-key cache backup, derive a key from `WS_TOKEN_SECRET`, restore raw production logging, execute a server module directly, follow an unsafe data tree, or activate an encoding/clinical-ineligible digest.
