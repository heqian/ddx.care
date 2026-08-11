## Why

Package scripts and CI classify tests through hand-maintained command lists, so current omissions and newly added test files can remain invisible. Concurrent changes are adding dependency-policy fixtures, prompt-governance tests, encoding tests, cache-startup cases, and protected provider verification, making a fixed inventory obsolete as soon as those changes land.

Test infrastructure must land before `sensitive-cache-redaction` so that change can register its data-root, bootstrap, and cache-startup cases without creating a competing runner. Independent database paths, nested startup harnesses, import-time singletons, reused Playwright servers, and copied production algorithms can mutate workspace data or let tests pass after production behavior drifts.

## What Changes

- Add discovery-driven, extensible test registrations that assign every discovered Bun test exactly one supported execution profile without embedding a numeric inventory. Registration fragments also own support fixtures and parent-run startup cases; discovery fails for omissions, overlaps, stale registrations, or unsupported profiles.
- Make one authoritative parent runner allocate a unique absolute temporary root for every runner-owned child and Playwright server, export it as `APP_DATA_DIR`, and set explicit job, tool-cache, Orphadata, and audit leaves beneath it. The runner owns temporary-environment containment, not application `APP_DATA_DIR` resolution semantics.
- Keep base profiles cache-disabled with `TOOL_CACHE_TTL_MS=0`. Give each successful enabled `cache-enabled` or `cache-startup` child a positive TTL and a newly generated strict unpadded base64url `TOOL_CACHE_KEY_SECRET`; permit missing/invalid keys only in declared expected-failure startup cases, and keep integration, contract, and protected real-provider smoke classes separate and cache-free.
- Provide declarative parent-owned application startup cases so downstream bootstrap/cache lifecycle coverage can register without a nested `tool-cache.test.ts` harness.
- Extract and test a side-effect-free injected lifecycle/server composition seam that later startup changes can invoke; this change does not alter `index.ts`, set the process umask, or implement the `APP_DATA_DIR` resolver.
- Exercise injected production route, WebSocket, token, config, lifecycle, and frontend seams instead of copied algorithms or production singletons.
- Launch every Playwright run against a fresh owned server and data root with a dedicated port, loopback-only network policy, and `reuseExistingServer: false`.
- Add separate strict typecheck contracts for application code, Bun/frontend tests and support fixtures, and Playwright configuration/tests.
- Add workspace-sentinel verification and package/CI guidance for the full non-live suite, environment-only integration and contract execution, and a separately protected real-provider smoke.

## Capabilities

### New Capabilities

- `test-integrity-and-hermeticity`: Defines exhaustive extensible test ownership, process-level data isolation, parent-owned startup execution, production-seam fidelity, network policy, strict test typechecking, and workspace-sentinel protection.

### Modified Capabilities

- `devops-improvements`: Adds CI requirements for discovery-driven classification, profile execution policy, downstream registration, separate strict test typechecks, and explicit live/protected gates without changing the dependency-cache requirement.

## Impact

- **Test infrastructure**: package scripts, registration fragments, the authoritative parent runner, startup-case fixtures, profile definitions, network guards, sentinel checks, and temporary-root cleanup.
- **Tests and active changes**: existing tests and future dependency-advisory, clinician-prompt, delimiter-encoding, sensitive-cache, provenance, consultation-budget, export, form, and release-parity coverage register through the same discovery contract rather than competing explicit lists.
- **TypeScript and CI**: strict application, Bun/frontend/support, and Playwright contracts become distinct gates; CI selects non-live, environment-only live, contract, and protected smoke classes according to policy.
- **Application composition**: a side-effect-free injected lifecycle/server module becomes available for the later sensitive-cache-owned `index.ts` bootstrap. Public HTTP and WebSocket behavior does not change.
