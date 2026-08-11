## 1. Discovery, Registrations, and Authoritative Parent Runner

- [x] 1.1 Add a typed profile registry defining process kind, environment, network policy, secret policy, and default-suite inclusion without embedding test paths or a numeric inventory
- [x] 1.2 Add deterministic extensible registration fragments with owner, exact paths or narrow owned patterns, one profile, optional support/fixture paths, and optional parent-run startup cases
- [ ] 1.3 Implement filesystem discovery for every `tests/**/*.test.ts(x)` and reject unclassified or multiply classified tests, stale or escaping executable/support entries, ambiguous patterns, duplicate startup-case IDs, and unsupported profiles before selection
- [ ] 1.4 Add positive coverage plus synthetic future-file, duplicate, stale, out-of-root, unsupported-profile, and overlapping-registration failures; prove a narrow owned registration can intentionally include a newly added matching test
- [ ] 1.5 Implement one authoritative Bun parent runner that launches one test file per fresh child by default and reports the owner, registration, profile, file/case, exit, timeout, and cleanup result
- [x] 1.6 Allocate one unique canonical absolute temporary root for every runner-owned child, export it as `APP_DATA_DIR`, set explicit absolute job/tool-cache/Orphadata/audit leaves beneath it, and sanitize inherited root/path/secret/port/live-run values before spawn without implementing application path-resolution semantics
- [ ] 1.7 Implement declarative startup cases whose fixtures, declared application entry command, readiness/exit observation, probes, termination, and cleanup are all owned by the parent runner; reject nested application-startup harness ownership in test files
- [ ] 1.8 Add bounded child parallelism and finally/signal cleanup that stops owned servers and removes only each child's unique data root on every exit path

## 2. Config and Production Composition Seams

- [ ] 2.1 Validate the runner's own generated temporary root, explicit absolute leaf environment values, fixtures, and observed artifacts remain beneath the owning child root; do not implement or consume the later sensitive-cache resolver
- [ ] 2.2 Introduce an immutable config value/loader that can be built from explicit environment input and validated without cache-busting imports or process-global mutation in tests
- [x] 2.3 Extract a side-effect-free server entry/composition module from current production startup and wire `index.ts` through it while preserving existing runtime behavior; do not add umask logic or the dynamic bootstrap in this change
- [x] 2.4 Make that lifecycle/server module accept injected production dependencies and do nothing on import until its create/start operation is invoked, so sensitive-cache can later load it from its bootstrap
- [x] 2.5 Refactor route construction to accept config, job and abort stores, rate limiter, token service, workflow factory, cache status, logger, clock/ID sources, and Bun server adapter without capturing test-sensitive singleton defaults
- [x] 2.6 Make production token generation/verification usable through the injected route service so empty-secret, secret, expiry, and cross-job cases all exercise production code
- [x] 2.7 Replace the closed-over `websocketHandlers` object with a factory that accepts the job store and timer operations while preserving production heartbeat and event behavior
- [ ] 2.8 Put startup and shutdown coordination in the injected lifecycle/server seam with config, stores, caches, Orphadata, audit logger, server, timers, signals, clock/sleep, and exit dependencies
- [ ] 2.9 Verify importing config, route, WebSocket, or lifecycle/server construction after the runner establishes the environment cannot open databases, initialize audit/cache state, start a server, install timers, or register signals

## 3. Remove Copied and Singleton-Mutating Tests

- [ ] 3.1 Rewrite `routes-helpers.test.ts` to exercise production client-IP, CORS, and diagnosis validation behavior; remove its local helper and Zod schema implementations
- [ ] 3.2 Rewrite the copied CORS builder and REST token decision tree in `api.test.ts` against actual injected production routes while retaining real HTTP coverage where the Bun HTTP layer matters
- [x] 3.3 Rewrite `ws-origin.test.ts` against the production `/ws` route with injected trusted/allowed origins and token service; remove all local origin and token algorithms
- [x] 3.4 Remove `rest-token.test.ts`'s direct HMAC/token-format implementation and mint valid, expired, and cross-job credentials only through production primitives or server responses
- [x] 3.5 Rewrite `shutdown.test.ts` to invoke the production lifecycle shutdown path with fake clock/sleep/server/timers/exit dependencies instead of reproducing the wait loop
- [ ] 3.6 Rewrite the startup-sequence case in `progress-store.test.ts` to call the production startup lifecycle with an injected store instead of repeating `index.ts` ordering
- [x] 3.7 Rewrite `websocket.test.ts` to construct production handlers with an injected in-memory or temporary `JobStore`; remove singleton imports and every `DELETE FROM jobs` cleanup
- [x] 3.8 Replace copy-only frontend progress-class and purge assertions with rendered production behavior or the production purge coordinator, then audit all tests for remaining executable logic described as mirroring production and remove it

## 4. Apply Every Execution Profile

- [ ] 4.1 Register the implementation-time discovered offline backend inventory under narrow owned `hermetic-bun`, `server-test`, or `config-matrix` rules and remove per-file persistence environment setup
- [x] 4.2 Make every base-profile child receive a unique temporary root exported as `APP_DATA_DIR`, explicit absolute leaves beneath it, cache TTL zero, no `TOOL_CACHE_KEY_SECRET`, disabled Orphadata startup, and loopback-only traffic
- [x] 4.3 Add a cryptographic helper that generates exactly 32 random bytes as canonical unpadded base64url, strictly decodes and validates the value, and never logs or reuses it
- [x] 4.4 Make each successful `cache-enabled` child receive the generated strict cache key, a positive TTL, one unique data root, and no external network; test disabled behavior through the base profile or injected config
- [ ] 4.5 Register positive-TTL missing/invalid-key and other expected-failure cache startup cases as parent-owned startup-negative cases rather than weakening the successful cache-enabled profile
- [x] 4.6 Run each Orphadata-cache registration in its own child and data root with mocked fetch, disabled tool cache, and deterministic lifecycle cleanup
- [ ] 4.7 Run REST-token and WebSocket-ticket registrations in separate parent-owned server children with distinct generated secrets, roots, ports, origins, and teardown
- [x] 4.8 Run frontend DOM registrations in dedicated children so HappyDOM, fake timers, fetch, storage, and WebSocket globals cannot leak
- [x] 4.9 Keep integration and contract registrations explicit, cache-disabled, provider-allowlisted, and rooted in unique `APP_DATA_DIR` values under their existing run policies
- [x] 4.10 Add only the canonical `real-provider-smoke` execution policy: protected environment, exact clean source revision/lock/qualified-Bun identity, mock mode rejected, cache disabled, provider-host allowlist, unique temporary environment, and non-disclosing artifacts; leave the synthetic case/assertions and workflow/status to dependency policy

## 5. Network and Playwright Isolation

- [x] 5.1 Add a pre-import non-live network guard that allows loopback and test-provided mocks but fails unmocked external requests with the originating registration and host; add provider allowlists only to declared live/protected profiles
- [ ] 5.2 Make dependency evaluator and fake GitHub issue tests use registered local fixtures and fake command/API adapters, including command, parser, network-failure, permission, and issue-state cases without real registry/GitHub access
- [ ] 5.3 Add an E2E launcher that gives every Playwright server one unique temporary root exported as `APP_DATA_DIR`, assigns explicit absolute database/audit leaves beneath it, allocates a port, sets cache TTL zero with no cache key, and owns teardown/root cleanup without implementing application resolver semantics
- [ ] 5.4 Update Playwright configuration to consume launcher values, use the same base URL and WebSocket origin, and set `reuseExistingServer: false` for local and CI runs
- [ ] 5.5 Block non-loopback requests in Playwright browser contexts and the child server, reconcile filesystem spec discovery with `testMatch` dynamically, and add a synthetic future-spec exclusion failure

## 6. Strict Typecheck Contracts and Baseline Repairs

- [x] 6.1 Preserve an independently runnable strict application typecheck and its current source/declaration coverage
- [ ] 6.2 Add a strict no-emit Bun/frontend contract derived from discovered tests plus every registered TypeScript support, fixture, startup-case, and declaration file while excluding Playwright files
- [x] 6.3 Add a strict no-emit Playwright contract covering `playwright.config.ts`, every discovered spec, and E2E helpers/support while excluding Bun/HappyDOM test globals
- [ ] 6.4 Add discovery-to-typecheck reconciliation so a downstream registration cannot add an untyped TypeScript executable or support module
- [ ] 6.5 Repair existing frontend-test DOM/HappyDOM node types, React children calls, file-list values, fetch mocks, element narrowing, and speech declaration inclusion without broad ignore directives
- [ ] 6.6 Repair existing Mastra tool test calls to use the installed execute signature/context and narrow validation/result unions; fix readonly expectation mismatches instead of weakening the contract
- [ ] 6.7 Repair existing workflow test step parameters, discriminated outcome narrowing, duplicate `ProgressEvent` import, and unsafe direct result access against the installed Mastra types
- [x] 6.8 Repair Playwright helper/API response typing, `.ok()` call sites, and possibly missing job-ID indexing so the Playwright contract passes without DOM `Response` confusion

## 7. Active Downstream Registration Extensions

- [x] 7.1 For `dependency-advisory-resolution`, accept evaluator and fake GitHub issue registrations under canonical `hermetic-bun` with distinct owner-selected CI statuses, and accept its assertion file only under `real-provider-smoke`
- [x] 7.2 For `clinician-reviewed-prompts`, register prompt manifest/review/deployment, governance, corpus, and medical-fact tests/support under hermetic profiles while leaving actual clinician approval as a human gate
- [x] 7.3 For `patient-data-delimiter-escaping`, register deterministic encoder, envelope, transport, and tool-output tests under hermetic profiles and keep any pinned model evaluation as an explicit environment-only protected gate
- [x] 7.4 After `sensitive-cache-redaction` implements its resolver/bootstrap, accept cache logic under canonical `hermetic-bun` or `cache-enabled`, cache-disabled general bootstrap under `server-test`, and positive-TTL plus missing/invalid-key bootstrap, permission, purge, migration, readiness, and failure cases under canonical `cache-startup`, with no nested harness
- [x] 7.5 For `evidence-provenance-ledger`, register any new backend, frontend, support, and E2E files while confirming extensions to existing files retain their current profile ownership
- [x] 7.6 For `consultation-budget-enforcement`, register any new config, workflow, ledger, logger, prompt, support, or timing tests and confirm existing-file extensions do not create a second runner
- [x] 7.7 For `export-privacy-and-disclaimer`, register any new serializer/frontend tests and Playwright specs/support under their existing environment classes
- [x] 7.8 For `form-semantics-and-labels`, register any new frontend tests and Playwright specs/support while preserving isolated DOM and E2E policies

## 8. Package Scripts and CI Enforcement

- [x] 8.1 Replace hand-maintained Bun file lists in package scripts with discovery/registration selections while preserving clear aliases for the complete non-live suite, frontend, tokens, integration, contract, E2E, and protected provider smoke
- [x] 8.2 Make `test:all` run discovery first and include every required non-live registration, parent-owned startup case, token mode, frontend class, and isolated Playwright run while excluding environment-only live/protected classes
- [x] 8.3 Add separate package scripts and CI checks for application, Bun/frontend/support, and Playwright strict typechecks, and make aggregate typecheck run all three
- [x] 8.4 Update CI to run discovery first, every required non-live profile, isolated Playwright, sentinel verification, and contract tests under existing policy; retain the node_modules cache requirement unchanged
- [x] 8.5 Expose integration only through its explicit environment command and real-provider smoke only through its protected exact-candidate workflow; neither may be inferred from mock/offline success

## 9. Verification and Sentinel Gates

- [x] 9.1 Verify discovery succeeds for the implementation-time filesystem inventory without a numeric assertion and fails for synthetic unclassified, duplicate, stale, unsupported, out-of-root, overlapping, and excluded-Playwright additions
- [x] 9.2 Run `bun run lint` and repair all changed implementation and test files
- [x] 9.3 Run strict application, Bun/frontend/support, and Playwright typechecks independently and through the aggregate command
- [x] 9.4 Run `bun run test:all` and confirm every required non-live registration and parent-owned startup case runs with a unique data root, correct cache policy, network denial, failure attribution, and cleanup
- [ ] 9.5 Run isolated Playwright and confirm it starts a new uniquely rooted child server, blocks external browser/server requests, tears down, and removes its data root
- [ ] 9.6 In an environment with required network and credentials, run the AGENTS-required `bun run test:all && bun run test:integration`; if prerequisites are unavailable, record integration as an environment-only skip with the missing prerequisite and do not mark it passed
- [ ] 9.7 Run contract tests under their declared CI network policy and run `real-provider-smoke` only through the protected exact-candidate environment; verify all live/protected profiles use cache TTL zero and unique data roots
- [ ] 9.8 Snapshot workspace job/tool-cache/Orphadata databases and all WAL/SHM sidecars plus current/rotated audit sentinels before non-live and Playwright commands, then prove every existing sentinel is byte-identical, every absent sentinel remains absent, and every created leaf stayed beneath its owning `APP_DATA_DIR`

## 10. Review Remediation

- [x] 10.1 Wire `index.ts` through the composition/lifecycle seam so production uses the same routes, tokens, and lifecycle that tests exercise
- [x] 10.2 Install the network guard as a `--preload` on every applicable child and server process, not just as a metadata field
- [ ] 10.3 Make `runAll()` dispatch by profile process kind: `bun-test`, `bun-test-with-server`, and `startup-case` instead of always running `bun test <file>`
- [x] 10.4 Restore `RUN_INTEGRATION` and `RUN_CONTRACT` in the live profile environment after sanitization so live tests execute rather than skip
- [x] 10.5 Implement a protected real-provider-smoke gate that rejects unprotected local execution
- [ ] 10.6 Replace `extraEnv` with a validated override API that rejects overrides of runner-controlled variables
- [ ] 10.7 Implement real artifact containment by walking child roots before cleanup rather than checking parent-constructed paths
- [ ] 10.8 Wrap `test:all` and E2E in a suite-level sentinel gate that snapshots before and verifies after the actual commands
- [ ] 10.9 Make the Playwright network fixture automatic and used by all specs; integrate the launcher with the config
- [x] 10.10 Reclassify `tool-cache.test.ts` from `hermetic-bun` to `cache-enabled` so positive-TTL tests run with a positive TTL
- [x] 10.11 Fix canonical cache-key validation to require re-encoding equality
- [x] 10.12 Add CLI validation that rejects unknown options, invalid concurrency, and empty selections
- [ ] 10.13 Remove duplicate production implementations after wiring `index.ts` through the composition seam
- [x] 10.14 Restore required `children` props in Badge, Card, and Modal; pass children in test props instead of relying on createElement variadic args
- [x] 10.15 Remove `process.env` reads from `validateBuiltConfig` so validation depends only on the explicit config value
- [ ] 10.16 Make `createLifecycle` own recurring intervals, signal registration, and idempotent shutdown