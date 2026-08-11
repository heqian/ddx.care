## Purpose

Defines observable integrity and isolation guarantees for the repository's test runners so every suite is owned, production behavior is tested directly, external effects are controlled, and developer workspace data remains untouched.

## ADDED Requirements

### Requirement: Every Bun test has exactly one execution classification

The test runner SHALL discover every `tests/**/*.test.ts` and `tests/**/*.test.tsx` file and require exactly one resolved typed registration for each. Registrations SHALL be extensible by an owning change and MAY declare exact paths or narrow owned patterns, support/fixture paths, parent-run startup cases, and one supported profile. Discovery SHALL reject unclassified or multiply classified tests, stale or escaping executable/support registrations, duplicate startup-case IDs, ambiguous patterns, and unsupported profiles. It SHALL compute the inventory from the filesystem without freezing a numeric file count.

#### Scenario: Current inventory is complete
- **WHEN** test discovery runs against the current repository
- **THEN** every discovered Bun test is classified exactly once and every registration resolves without comparing the result to a fixed count

#### Scenario: Unclassified future file fails discovery
- **WHEN** a new matching test file is added without a manifest entry
- **THEN** discovery fails even when the selected test command would not otherwise run that file's profile

#### Scenario: Stale or duplicate manifest entry fails discovery
- **WHEN** a manifest path does not exist or a test path is listed more than once
- **THEN** discovery fails with the offending path and classification error

#### Scenario: Downstream test registration composes
- **WHEN** a downstream change adds hermetic dependency fixtures, prompt-governance tests, encoding tests, cache-startup cases, or another matching test/support path
- **THEN** its owned registration is merged into discovery and the new executable runs under exactly one declared profile without replacing an existing path list

### Requirement: Bun tests start with process-level resource isolation

Each Bun test file SHALL run in a fresh child process by default. Before creating any runner-owned test, startup, protected-smoke, or server child, the parent SHALL allocate a unique canonical absolute temporary root, export it as `APP_DATA_DIR`, and set explicit absolute job database, tool-cache database, Orphadata database, and enabled audit-log leaves beneath it. The runner SHALL validate its generated environment/fixtures and observed artifacts but SHALL NOT define application data-root resolution, mount, or no-follow semantics. Base processes SHALL start with `TOOL_CACHE_TTL_MS=0`, no cache-key secret, disabled Orphadata startup, and an explicit token-secret mode.

#### Scenario: Paths exist before imports
- **WHEN** a child first imports configuration or a singleton-bearing module
- **THEN** the exported `APP_DATA_DIR` is unique to that child and every persistence or audit leaf has already been assigned an explicit absolute path beneath it

#### Scenario: Files do not share import or global state
- **WHEN** two test files use different configuration, fetch mocks, DOM globals, timers, or token secrets
- **THEN** they execute in separate processes and cannot observe each other's module registry or globals

#### Scenario: Temporary resources are cleaned after failure
- **WHEN** a child passes, fails, times out, or is interrupted
- **THEN** the parent stops owned processes and removes only that child's complete temporary data root

### Requirement: Configuration-sensitive classes use distinct process profiles

Cache-disabled, cache-enabled, cache-startup, Orphadata-cache, empty-secret, REST token-secret, WebSocket ticket-secret, integration, contract, and protected real-provider smoke tests SHALL run under explicit profiles whose settings are fixed before imports. Every base-profile child SHALL use cache TTL zero with no cache-key secret. Every successful enabled `cache-enabled` or `cache-startup` child SHALL use a positive TTL and a unique `TOOL_CACHE_KEY_SECRET` generated from exactly 32 cryptographically random bytes and encoded as strict canonical unpadded base64url. A `cache-startup` case SHALL declaratively select disabled, enabled, or expected-failure key state before process creation and SHALL NOT inherit arbitrary cache settings. REST and WebSocket secret modes SHALL use separate generated secrets and server processes.

#### Scenario: Cache test cannot enable cache for another file
- **WHEN** a cache-enabled child completes under a positive cache TTL and generated key
- **THEN** every cache-disabled child still imports configuration with a zero cache TTL

#### Scenario: Cache key is strict and unique
- **WHEN** the parent launches two successful cache-enabled children
- **THEN** each receives a different unpadded base64url value that strictly decodes to 32 bytes and passes production cache-key validation

#### Scenario: Token security modes cannot contaminate each other
- **WHEN** REST token, WebSocket ticket, and empty-secret route tests run
- **THEN** each observes only its declared secret mode and uses production credential primitives rather than a test-local HMAC implementation

### Requirement: The authoritative parent owns application startup cases

The authoritative parent runner SHALL support declarative startup cases for a registration-owned application entry command, readiness or expected exit, probes, and cleanup. Downstream tests of pre-import bootstrap, security ordering, real server readiness, cache startup, migration, purge, enabled-cache readiness, expected startup failure, and shutdown cleanup SHALL use those cases. This capability supplies the mechanism but does not implement the sensitive-cache bootstrap or resolver. Test files SHALL NOT implement a nested child harness.

#### Scenario: Cache startup case runs
- **WHEN** a registered disabled, enabled, migration, expiry, permission, or invalid-key cache startup case executes
- **THEN** the parent prepares its fixture under a unique temporary root, starts the registration's declared application entry command, observes the declared readiness or exit result, terminates the process, and cleans the root

#### Scenario: Nested startup harness is rejected
- **WHEN** a test registration attempts to delegate an application startup matrix to a test-owned child-process harness
- **THEN** registration review or validation rejects that ownership and requires parent-run startup cases

### Requirement: Non-live tests cannot make unexpected external requests

All non-live Bun children, parent-run startup children, the Playwright child server, and Playwright browser contexts SHALL reject non-loopback network requests. Tests that exercise network clients, dependency policy, or GitHub issue maintenance SHALL use mocks, fake adapters, and registered fixtures. Integration and contract profiles SHALL use explicit run flags, cache TTL zero, unique temporary roots, and documented provider-host allowlists. Canonical `real-provider-smoke` SHALL define only protected execution policy: exact clean source revision, frozen lock digest, qualified Bun identity, mock mode absent, cache disabled, deployed model configuration, provider-host allowlist, and non-disclosing artifacts. Dependency policy SHALL own the synthetic case/assertions and single workflow/status.

#### Scenario: Unexpected unit-test network call fails
- **WHEN** a non-live test attempts an unmocked request to an external host
- **THEN** the request fails immediately and identifies the test file and host

#### Scenario: Live contract request is allowed without cache masking
- **WHEN** the contract profile runs with `RUN_CONTRACT=1`
- **THEN** requests to declared provider hosts are allowed and no tool or Orphadata cache can satisfy the request

#### Scenario: Live integration remains opt-in
- **WHEN** default offline test commands run
- **THEN** integration registrations are classified but not executed without their explicit live-network trigger

#### Scenario: Protected provider smoke is not a unit substitute
- **WHEN** hermetic, integration, or contract classes pass in mock mode
- **THEN** the protected real-provider status remains independently required wherever its policy applies and cannot be satisfied by those results

### Requirement: Tests exercise injected production behavior instead of copies

The lifecycle/server composition module SHALL be side-effect-free on import, accept the dependencies needed for deterministic tests, and construct/start production behavior only when invoked. This capability SHALL extract and test that seam while leaving `index.ts` startup and the application data-root resolver unchanged; `sensitive-cache-redaction` owns their later bootstrap/security behavior. Production route, WebSocket, token/config, and lifecycle construction SHALL accept injected stores and configuration. Tests SHALL call these production seams or drive actual handlers/components and SHALL NOT maintain independent implementations of production algorithms under assertion.

#### Scenario: Server composition is ready for a later bootstrap
- **WHEN** the generic composition work completes before sensitive-cache startup changes
- **THEN** a later `index.ts` bootstrap can dynamically load and invoke the lifecycle/server module without importing a side-effectful composition graph first

#### Scenario: Lifecycle module is import-safe
- **WHEN** a test imports the lifecycle/server construction module after its child environment is established
- **THEN** the import alone does not open a database, create an audit logger, initialize caches, register signals or timers, or start a server

#### Scenario: Route policies come from production handlers
- **WHEN** request schema, CORS, client-IP, REST token, or WebSocket origin tests run
- **THEN** their result is produced by the production route/helper implementation under injected configuration

#### Scenario: WebSocket tests cannot mutate the production singleton
- **WHEN** `websocket.test.ts` opens, completes, fails, and closes sockets
- **THEN** production WebSocket handlers use the injected temporary store and the test performs no delete or reset against the default `progressStore`

#### Scenario: Startup and shutdown tests call the production lifecycle
- **WHEN** stale cleanup, interval disposal, active-workflow waiting, or shutdown timeout is tested
- **THEN** the test invokes the production lifecycle coordinator with injected stores, timers, clock/sleep, server, and exit behavior rather than reproducing its sequence or loop

#### Scenario: Production drift changes the test result
- **WHEN** a production decision used by one of these tests is changed
- **THEN** the corresponding test observes the changed production behavior without updating a test-local algorithm

### Requirement: Playwright owns an isolated server and browser network

Every Playwright invocation SHALL start and stop a new child server with `reuseExistingServer` disabled, a dedicated port, and one unique temporary root exported as `APP_DATA_DIR`, distinct from every other child. The launcher SHALL assign explicit absolute job/cache/Orphadata/audit leaves beneath that root without implementing application resolver semantics. The server SHALL use mock LLM mode, cache TTL zero with no cache key, and disabled Orphadata. The server and browser SHALL allow loopback traffic only. Filesystem-discovered `tests/**/*.spec.ts` files SHALL reconcile with Playwright discovery without a fixed count.

#### Scenario: Local server is not reused
- **WHEN** a developer runs Playwright while another server already occupies the usual development address
- **THEN** Playwright uses only its newly allocated child server or fails without sending tests to the existing server

#### Scenario: E2E server cannot initialize workspace caches
- **WHEN** the Playwright child server starts
- **THEN** its unique `APP_DATA_DIR` contains every database/audit leaf and cache-disabled startup cannot create or update workspace files

#### Scenario: Browser external request is blocked
- **WHEN** the rendered app requests a non-loopback font, CDN, API, HTTP, or WebSocket origin
- **THEN** the Playwright network policy blocks that request without preventing same-origin test traffic

#### Scenario: Future Playwright spec cannot be excluded accidentally
- **WHEN** a new `tests/**/*.spec.ts` file does not match the configured Playwright discovery policy
- **THEN** the Playwright discovery assertion fails

### Requirement: Test environments pass separate strict typechecks

The repository SHALL provide independently runnable strict, no-emit contracts for application code, Bun/frontend tests and registered TypeScript support/startup fixtures, and Playwright configuration/tests. The Bun/frontend contract SHALL derive coverage from discovered registrations and required application declarations. The Playwright contract SHALL include every discovered spec, E2E helper, and `playwright.config.ts`. Existing errors SHALL be repaired without excluding files, disabling strictness, or adding broad ignore directives.

#### Scenario: Bun or frontend test type error fails its contract
- **WHEN** a Bun test uses an invalid Mastra tool/workflow signature, unsafe outcome access, incompatible DOM/React value, or invalid mock type
- **THEN** the Bun/frontend typecheck fails with that file and error

#### Scenario: Playwright API misuse fails its contract
- **WHEN** a Playwright helper confuses `APIResponse` with DOM `Response`, calls a non-callable member, or uses a possibly missing job ID as an index
- **THEN** the Playwright typecheck fails independently of the Bun/frontend contract

#### Scenario: Every current test is included
- **WHEN** the typecheck file sets are compared with test discovery
- **THEN** all classified Bun files, registered TypeScript support/startup modules, and discovered Playwright specs are covered by exactly the appropriate strict contract

### Requirement: Test commands preserve workspace persistence and audit sentinels

Non-live Bun and Playwright test commands SHALL leave workspace `jobs.sqlite`, `tool-cache.sqlite`, and `orphadata.sqlite`, all corresponding `-wal` and `-shm` sidecars, the audit-log sentinel, and rotated audit sentinels unchanged in existence and content. Every runner-owned child and Playwright server SHALL expose one unique temporary root as `APP_DATA_DIR`, and every test-created persistence or audit leaf SHALL use the runner-assigned absolute path beneath its owning root rather than the workspace.

#### Scenario: Populated workspace sentinels remain untouched
- **WHEN** non-live Bun profiles and Playwright run while every database, sidecar, current audit log, and rotated audit sentinel contains known data
- **THEN** every sentinel has the same existence and byte content after the commands complete

#### Scenario: Absent workspace artifacts stay absent
- **WHEN** a default workspace database, sidecar, or audit artifact does not exist before a test command
- **THEN** the command does not create it

#### Scenario: Failure path preserves sentinels
- **WHEN** an isolated child test fails after initializing its temporary store or server
- **THEN** workspace sentinels remain unchanged and the child's temporary artifacts are cleaned

### Requirement: Downstream changes register tests without replacing discovery

Every active task-bearing downstream change that adds or splits a matching test, support fixture, startup case, or Playwright spec SHALL add or update an owned registration compatible with the authoritative discovery and profile registry. Dependency evaluator and issue tests SHALL use `hermetic-bun`, dependency provider assertions SHALL use `real-provider-smoke`, and sensitive-cache tests SHALL use cache-disabled `server-test`, positive/negative `cache-startup`, or logic-only `cache-enabled` as applicable. Distinct CI statuses MAY select owner registrations without inventing profile names. Existing downstream changes SHALL not introduce a parallel inventory, runner, provider workflow, or status.

#### Scenario: Active downstream change adds a test
- **WHEN** an active downstream change introduces a matching test or support/startup module
- **THEN** its implementation includes a registration update and discovery proves that the addition is owned, typed, and selected by the declared profile

#### Scenario: Downstream change extends existing files only
- **WHEN** an active downstream change adds cases to already registered tests without adding a new executable
- **THEN** it confirms the existing registration remains correct and does not create a competing file list or runner

### Requirement: Full-suite and environment-only results are reported distinctly

The repository SHALL expose a complete non-live suite and explicit environment-only integration, contract, and protected provider commands. Implementation verification SHALL run lint, strict typechecks, and the full suite in accordance with `AGENTS.md`. When integration prerequisites are available, verification SHALL run `bun run test:all && bun run test:integration`. When required credentials or network access are unavailable, integration SHALL be reported as an environment-only skip with its missing prerequisite and SHALL NOT be reported as passed.

#### Scenario: Full verification environment is available
- **WHEN** implementation verification has the required live network and credentials
- **THEN** `bun run test:all && bun run test:integration` executes after lint and strict typechecks, with contract and protected smoke evidence handled under their declared policies

#### Scenario: Integration cannot run locally
- **WHEN** lint, typechecks, and the complete non-live suite can run but the integration environment is unavailable
- **THEN** the non-live result is reported separately and integration remains an explicit skipped or pending environment-only gate rather than a success
