## Context

`package.json` and CI use hand-maintained file commands with inconsistent ownership across backend, frontend, token, integration, contract, and Playwright tests. There is no repository-wide discovered inventory, so a newly added matching test can be absent from every normal command without failing CI.

Several active changes will add or extend tests concurrently. `dependency-advisory-resolution` needs hermetic evaluator and fake GitHub issue fixtures plus a protected real-provider smoke. `clinician-reviewed-prompts` adds prompt-governance and medical-fact coverage. `patient-data-delimiter-escaping` adds deterministic encoding and envelope coverage. `sensitive-cache-redaction` adds bootstrap and cache-startup matrices. Other active task-bearing changes extend backend, frontend, E2E, container, and support-fixture coverage. A fixed file count or one monolithic path table would conflict immediately with those changes.

`sensitive-cache-redaction` will later own the production `APP_DATA_DIR` resolver and the `index.ts` umask/bootstrap split. This change must land its generic parent runner, canonical profiles, temporary environment, and injected server composition seam first, without consuming those not-yet-implemented sensitive-cache contracts. Positive cache tests can still receive generated keys through the generic profile policy.

Today configuration and several stores are captured at import. Server suites omit some persistence, cache, Orphadata, or audit settings; `websocket.test.ts` mutates the default store; Playwright can inherit workspace paths or reuse an unrelated server. The sensitive-cache plan also proposes child startup cases inside `tool-cache.test.ts`, which would create a second process owner unless reconciled with this change.

Copied behavior remains in route, token, origin, shutdown, startup, and frontend tests. The root TypeScript contract excludes test and Playwright trees, and diagnostic strict checks expose independent Bun/frontend and Playwright error baselines.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Give every discovered Bun test exactly one visible, extensible execution policy without a fixed inventory count.
- Give each runner-owned child and Playwright server one unique temporary root exported as `APP_DATA_DIR`, with explicit database and audit leaf environment values beneath it before application imports.
- Make the authoritative parent runner own application startup cases and their cleanup.
- Exercise actual route, WebSocket, token/config, startup, shutdown, schema, origin, and frontend behavior.
- Isolate Playwright's server, browser network, persistence, caches, Orphadata, audit log, and port.
- Make strict application, Bun/frontend, and Playwright typechecks independently actionable and green.
- Prove test commands do not read, create, truncate, rotate, or otherwise mutate workspace persistence/audit sentinels.
- Let active and future changes add registrations, support fixtures, startup cases, and protected classes without replacing a central explicit list.
- Leave canonical application data-root resolution and the no-static-import `index.ts` bootstrap to `sensitive-cache-redaction`, which is applied after this runner and seam work.

**Non-Goals:**
- Changing HTTP, WebSocket, diagnosis, cache, authentication, or retention behavior.
- Making live integration tests hermetic or moving them into the default offline command.
- Replacing `bun:test`, Playwright, or the existing CI dependency-cache strategy.
- Adding a coverage percentage gate.
- Treating environment-only integration, contract, or provider verification as passed when prerequisites are unavailable.

## Decisions

### D1: The runner owns pre-import isolation

**Decision:** One Bun parent runner is authoritative for every registered test-file child and every application startup/server case. For a normal Bun test, it spawns `bun test <one-file>` in a fresh process. For a startup case, it prepares the declared fixture, spawns the registration's declared application entry command, observes readiness or expected exit, performs registered probes, terminates the process, and reports the case/profile. After `sensitive-cache-redaction` lands, its bootstrap cases declare `bun index.ts`; this change does not implement that bootstrap. A test file does not start another application server or implement a nested cache-specific process harness.

Before each runner-owned process starts, the parent allocates one unique canonical OS temporary directory, exports that path as `APP_DATA_DIR`, and sets `DB_PATH`, `TOOL_CACHE_DB_PATH`, `ORPHADATA_DB_PATH`, and enabled `AUDIT_LOG_PATH` to explicit absolute leaves beneath it. The parent validates its generated environment and fixtures lexically/canonically before spawn and verifies created artifacts afterward. It does not parse application-relative paths, implement the production data-root resolver, or define mount/no-follow behavior; `sensitive-cache-redaction` owns those semantics later.

Each child receives a sanitized environment, an isolated or dynamically allocated `PORT` when needed, and an explicit token-secret mode. Base profiles set `MOCK_LLM=1`, `TOOL_CACHE_TTL_MS=0`, unset `TOOL_CACHE_KEY_SECRET`, and set `ORPHADATA_ENABLED=0`. The parent removes inherited data-root, leaf-path, cache-key, token, port, and live-run values before applying the profile. It stops owned processes and recursively removes only the unique data root on success, failure, timeout, or signal.

**Rationale:** A process boundary is the only reliable way to precede all ESM imports and Bun's shared module registry. It also contains global mocks and timers. A first-import setup module, import convention, cache-busting query string, or per-file environment restoration is not an accepted substitute.

**Alternative considered:** Batch unit files after a preload or let `tool-cache.test.ts` own startup children. Rejected because shared imports can freeze configuration, and nested process owners cannot consistently allocate roots, enforce network policy, attribute failures, or clean up after interruption.

### D2: Discovery is exhaustive and registrations are extensible

**Decision:** The runner discovers every `tests/**/*.test.ts` and `tests/**/*.test.tsx` path from the filesystem, then resolves typed registration fragments in deterministic order. Each fragment declares an owner, exact paths or a narrow owned pattern, one supported profile, optional support/fixture paths, and optional parent-run startup cases. A broad catch-all profile is prohibited. The resolved inventory is computed at run time and never asserted against a numeric total.

Discovery fails before selection when a discovered test has zero or multiple registrations, a registered executable or support path is stale or outside the test tree, a startup case ID is duplicated, a profile is unsupported, or a registration pattern is ambiguous. Filters select from the already validated inventory, so a future unclassified file fails even when its intended class is not selected. Narrow patterns intentionally registered to an owner may include future files because those files immediately inherit and execute under that declared policy.

The profile registry defines environment, network, process kind, default-suite inclusion, and secret policy independently from path registrations:

| Profile | Policy |
| --- | --- |
| `hermetic-bun` | One Bun test file, base cache-disabled environment, loopback-only network |
| `server-test` | Base policy plus a parent-owned application server, dynamic port, readiness, and teardown |
| `config-matrix` | Base process environment; alternate values are passed to the injected config loader rather than import-global mutation |
| `cache-enabled` | Positive cache TTL, generated strict cache key, owned data root, no external network |
| `cache-startup` | Parent-owned application entry/startup case with declared disabled, enabled, or expected-failure cache mode fixed before import; successful enabled cases receive a generated strict key |
| `orphadata-cache` | Owned Orphadata leaf, mocked fetch, tool cache disabled, unmocked network denied |
| `token-secret-rest` | Dedicated generated REST token secret, parent-owned server, loopback only |
| `token-secret-ws` | Separate generated WebSocket ticket secret and process, parent-owned server, loopback only |
| `frontend-dom` | Dedicated HappyDOM process and isolated browser-like globals, no external network |
| `live-integration` | Explicit `RUN_INTEGRATION=1`, cache disabled, provider allowlist, environment-only execution |
| `live-contract` | Explicit `RUN_CONTRACT=1`, cache disabled, provider allowlist, existing CI policy |
| `real-provider-smoke` | Protected environment only, exact clean source revision/lock/qualified-Bun identity required, mock mode absent, real deployed models, cache disabled, provider-host allowlist, non-disclosing artifacts |

Playwright specs are discovered separately from `tests/**/*.spec.ts`; configuration and helper modules are support files. The Playwright discovery assertion compares filesystem discovery with the configured test match instead of checking a fixed count or list.

**Rationale:** Discovery supplies exhaustiveness, while composable registrations let downstream changes declare policy beside their own tests and fixtures without rewriting an incompatible central inventory.

### D3: Cache and token states get distinct processes

**Decision:** Cache-disabled state is the base for every profile except `cache-enabled` and declared `cache-startup` cases: `TOOL_CACHE_TTL_MS=0` is set and `TOOL_CACHE_KEY_SECRET` is removed before import. Each successful enabled child in either profile receives a positive TTL and a unique key generated from exactly 32 cryptographically random bytes, encoded as canonical unpadded base64url. A `cache-startup` registration declares `disabled`, `enabled`, or `expected_failure` plus bounded case-specific key presence/validity before the child is created; it cannot inherit arbitrary environment. The generated value must match `^[A-Za-z0-9_-]{43}$`, decode strictly back to 32 bytes, and pass the production config validator. It is never fixed, committed, printed, or reused across children.

Expected-failure startup cases may explicitly remove or corrupt the key to test fail-closed positive-TTL behavior; those cases are registered as startup-negative cases and are not successful cache-enabled profiles. Disabled, enabled, migration, expiry, and security-bootstrap startup cases are all direct children of the authoritative parent runner. `tool-cache.test.ts` and future cache tests exercise injected cache behavior but do not contain their own process launcher.

Orphadata cache tests remain separate one-file processes because the module retains database state. REST token and WebSocket ticket suites each receive a separate generated secret and parent-owned server process; empty-secret behavior is tested through injected production config/token services.

Tests SHALL obtain valid, expired, and cross-job credentials from production token primitives or server responses. Test-local HMAC implementations and hard-coded replicas of token expiry/format rules are removed.

**Rationale:** Positive and zero cache TTLs, cache-key validation, and empty/non-empty token secrets are import-time or startup-sensitive states. Dedicated roots and processes prevent contamination while matching the fail-closed cache contract.

### D4: Production composition exposes route, WebSocket, and startup seams

**Decision:** Extract a side-effect-free lifecycle/server composition module that exposes injected construction and start/stop operations. Importing it alone does not open a database, create an audit logger, initialize a cache, register timers/signals, or listen on a port. Keep the existing production entrypoint functional during this change; do not add umask logic, implement a dynamic bootstrap, or consume a production `APP_DATA_DIR` resolver here. `sensitive-cache-redaction`, applied second, owns the `index.ts` no-static-import bootstrap and invokes this seam after applying its security boundary.

The composition seam accepts an immutable config value and injected production dependencies. Route construction accepts config, job/abort stores, rate limiter, token service, workflow factory, cache status provider, logger, clock/ID sources, and Bun server adapter. Tests invoke returned production handlers with injected dependencies after their runner-owned environment is established. Later, sensitive-cache startup prepares its dedicated tree and invokes this seam.

WebSocket handlers are created by a factory that accepts the job store and timer operations. `websocket.test.ts` supplies an in-memory or temporary `JobStore`; it never imports, truncates, or deletes from the production singleton.

Startup and shutdown live behind the lifecycle/server seam and accept config, stores, cache and Orphadata initializers/cleaners, audit logger, rate limiter, server factory, timers, signal registration, clock/sleep, and exit callback. Unit tests invoke that seam directly. Pre-import ordering and real-listen failure cases use parent-owned `index.ts` startup registrations.

**Rationale:** Landing the import-safe seam first removes singleton coupling without preempting the later security owner. Sensitive-cache can then make `index.ts` a minimal bootstrap around a composition module that is already testable and side-effect-free.

**Alternative considered:** Export the current closed-over helpers and mutate singleton internals. Rejected because it leaves route/startup behavior tied to import order and continues to test private shared state.

### D5: Copied production algorithms are removed, not synchronized

**Decision:** Tests SHALL call production code at its narrowest useful seam or drive the actual handler/component. The conversion includes:

| Existing copy | Replacement |
| --- | --- |
| Local client-IP, CORS, and Zod request schema in `routes-helpers.test.ts` | Production helper or injected route handler |
| Local CORS and REST token decision tree in `api.test.ts` | Actual route responses under injected config/token service |
| Local origin allowlist and token functions in `ws-origin.test.ts` | Actual `/ws` route handler under injected origin/token config |
| Local token format/HMAC in `rest-token.test.ts` | Production token service/primitives |
| Local shutdown wait loop in `shutdown.test.ts` | Production lifecycle shutdown with fake clock/sleep/exit |
| Repeated startup sequence in `progress-store.test.ts` | Production startup lifecycle with injected store |
| Progress-log class and purge simulations in `frontend.test.tsx` | Rendered production component or production purge coordinator; redundant copy-only assertions removed |

Fixtures, expected values, and interface-focused test doubles remain valid. A test double may model a dependency response, but it SHALL NOT independently implement the decision algorithm being asserted. A final repository audit removes remaining “mirrors production” code and replaces it with direct behavior.

**Rationale:** Updating a copied helper after production changes only keeps two implementations synchronized by convention. Direct calls ensure production mutations affect the test.

### D6: Network access is a profile capability

**Decision:** A preload installed by the parent before test modules load rejects outbound requests in all non-live Bun profiles while allowing loopback. Existing tests can replace the guarded `fetch` with mocks and restore it to the guard. Dependency evaluator and fake GitHub issue tests run hermetically against registered fixtures and fake command/API adapters, never the registry or GitHub network.

The live integration and contract profiles opt into only their documented public API hosts, with cache TTL zero so the run reaches the provider. Canonical `real-provider-smoke` owns execution policy only: protected environment, exact clean source revision, frozen lock digest, qualified Bun identity, `MOCK_LLM` absent, deployed model identifiers and real credentials, required provider hosts only, cache disabled, and non-disclosing artifacts. Dependency policy owns its synthetic case/assertions/evidence criteria and single protected workflow/status.

**Rationale:** `ORPHADATA_ENABLED=0` and `TOOL_CACHE_TTL_MS=0` reduce side effects but do not prove an unexpected code path cannot reach the network. Explicit denial turns accidental I/O into a deterministic failure.

### D7: Playwright owns a fresh child server

**Decision:** `test:e2e` runs through the authoritative launch infrastructure. Each Playwright server receives its own canonical absolute `APP_DATA_DIR`, distinct from every Bun test and other server process, plus database and audit leaves that resolve beneath it. The launcher allocates an available port, sanitizes inherited paths and secrets, sets `MOCK_LLM=1`, `TOOL_CACHE_TTL_MS=0`, unsets `TOOL_CACHE_KEY_SECRET`, sets `ORPHADATA_ENABLED=0`, and always uses `reuseExistingServer: false`. The base URL, WebSocket origin, and readiness probe use the same port; the launcher owns shutdown and recursive root cleanup.

The server process receives the same non-live outbound guard. Playwright browser contexts abort non-loopback requests, including font/CDN requests, while allowing the owned HTTP/WebSocket origin. Filesystem discovery and Playwright's configured discovery are reconciled dynamically so any future matching spec excluded by `testMatch` fails without relying on a fixed count.

**Rationale:** Reusing a local server makes results depend on unknown code, configuration, and data. Server-only isolation also leaves browser-originated external requests uncontrolled.

### D8: Typecheck environments are separate and strict

**Decision:** Keep the existing strict application contract and add two independently runnable contracts:

| Contract | Includes | Excludes |
| --- | --- | --- |
| Bun/frontend tests | Every discovered Bun test, every registered TypeScript fixture/startup/support module, application declarations including speech types, Bun + DOM/React environments | Playwright specs/config |
| Playwright | `playwright.config.ts`, `tests/**/*.spec.ts`, `tests/e2e/**/*.ts`, transitively imported source | Bun test files and HappyDOM test globals |

Both use `strict: true` and `noEmit`. Manifest validation reconciles discovered test and support files with the appropriate contract, so downstream registrations cannot add untyped fixtures. Existing errors are repaired with current Mastra/React/Playwright signatures and proper narrowing; the contracts SHALL NOT pass by excluding failing files, disabling strictness, adding broad ignore directives, or replacing meaningful types with blanket escapes. Package scripts expose each contract and an aggregate typecheck; CI reports them separately.

**Rationale:** Bun frontend tests and Playwright intentionally have different globals and response types. A single ambient environment can hide real errors or manufacture conflicts.

### D9: Workspace sentinel preservation is an acceptance gate

**Decision:** A regression harness snapshots existence, bytes, and relevant metadata for workspace `jobs.sqlite`, `tool-cache.sqlite`, and `orphadata.sqlite`, each `-wal`/`-shm` sidecar, an audit-log sentinel, and rotated audit sentinels. It runs non-live Bun profiles and Playwright, then verifies every snapshot and absence state is unchanged. For every runner-owned child, the harness also records the unique `APP_DATA_DIR` and proves each configured or created database, sidecar, audit file, and audit rotation stayed beneath it.

**Rationale:** Merely checking that tests passed cannot detect a test that opened or truncated a developer database. Including sidecars and audit rotations catches writes that do not alter the primary file.

### D10: Downstream changes extend registrations and verification remains explicit

**Decision:** Active task-bearing changes do not replace the canonical manifest with their own explicit file lists. Each change adds or updates an owned registration fragment when it adds a matching test, support fixture, startup case, or protected execution class:

- `dependency-advisory-resolution` registers evaluator and fake GitHub issue tests/fixtures under canonical `hermetic-bun`; distinct CI statuses select those owner registrations. It registers its provider assertions under `real-provider-smoke` without creating a workflow or status.
- `clinician-reviewed-prompts` registers prompt manifest, review, corpus, governance, and medical-fact tests/support under a hermetic profile; human clinician approval remains a separate non-automated gate.
- `patient-data-delimiter-escaping` registers deterministic encoder, envelope, transport, and tool-output coverage under hermetic profiles; any pinned model evaluation remains an explicit environment-only protected gate.
- `sensitive-cache-redaction`, applied after this change, owns the application data-root resolver and `index.ts` bootstrap, registers cache logic under canonical `cache-enabled` or `hermetic-bun`, registers cache-disabled general server behavior under `server-test`, and registers positive-TTL and invalid/missing-key bootstrap/cache lifecycle matrices under canonical `cache-startup`.
- `evidence-provenance-ledger`, `consultation-budget-enforcement`, `export-privacy-and-disclaimer`, and `form-semantics-and-labels` extend backend, frontend, support, and Playwright registrations according to the files they add or split.

Package scripts expose discovery, profile selections, the complete non-live `test:all` suite, environment-only integration and contract commands, and the protected provider smoke. Implementation verification follows `AGENTS.md`: run `bun run lint`, strict typechecks, and `bun run test:all && bun run test:integration` when the required network and credentials are available. If the environment cannot run integration, record an explicit environment-only skip with the missing prerequisite; do not report it as passed or weaken the offline suite. Contract and real-provider smoke evidence remain separate according to their CI/protected policies.

**Rationale:** Registration tasks let concurrent changes compose without stale counts. Explicit environment outcomes preserve the difference between a green hermetic suite and live compatibility that was not exercised.

## Risks / Trade-offs

- **[One process per file increases startup time]** -> Run independent children with bounded parallelism while retaining unique data roots and deterministic failure attribution.
- **[Registration fragments can overlap]** -> Validate the fully discovered inventory before filtering and fail with both owners and matching rules.
- **[Composition refactoring can change startup behavior]** -> Land and directly test the import-safe lifecycle/server seam first; let sensitive-cache change `index.ts` and register real-bootstrap coverage second.
- **[Network denial can expose previously hidden calls]** -> Treat those failures as integrity defects; allow network only through explicit live or protected profiles and documented host allowlists.
- **[Strict test typechecking reveals a large baseline]** -> Repair by category in dedicated tasks and keep application, Bun/frontend, and Playwright diagnostics separate.
- **[Temporary directories can leak after interruption]** -> Install parent signal/finally cleanup and use OS temporary roots that are safe to reap independently of the workspace.
- **[Live verification may be unavailable locally]** -> Preserve the required command, record an environment-only skip and prerequisite, and require CI/protected evidence instead of a false pass.

## Migration Plan

1. Add the canonical profile registry, discovered registration fragments, generic parent child/startup launcher, temporary-environment containment, and sentinel harness while existing scripts remain available for comparison.
2. Extract and test the side-effect-free injected lifecycle/server composition seam without changing `index.ts`, adding umask behavior, or implementing application data-root resolution.
3. Register the existing inventory dynamically, convert copied and singleton-mutating tests, isolate Playwright, and add separate live integration, contract, and `real-provider-smoke` execution policies.
4. Add and repair the strict Bun/frontend/support and Playwright typecheck contracts, then switch package and CI entrypoints after the generic infrastructure is green.
5. Apply `sensitive-cache-redaction` second; it implements the resolver/bootstrap and registers cache-disabled `server-test`, positive/negative `cache-startup`, and cache-logic `cache-enabled` cases into this runner.
6. Let later downstream changes add canonical registrations; dependency owns provider assertions and the single revision/lock-bound workflow/status selecting `real-provider-smoke`.
7. Roll back the script switch as one unit if needed, but retain generic process isolation and sentinel protection; do not restore nested startup harnesses, singleton deletion, or first-import setup conventions.
