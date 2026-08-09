## Why

Normal CI omits `errors.test.ts` and `rest-token.test.ts`, so REST authorization, error classification, and retry-predicate regressions can merge with green CI. Several suites (`routes-helpers.test.ts`, `api.test.ts` CORS sections, `ws-origin.test.ts`, `shutdown.test.ts`) reimplement production logic rather than exercising exported helpers, and the copied CORS helper is already stale (expects `GET, POST, OPTIONS` while production includes `DELETE`). `websocket.test.ts` runs `DELETE FROM jobs` against the singleton default database before and after every test, so `bun run test` can erase a developer's persisted jobs. Server-based tests do not set isolated `DB_PATH`, `TOOL_CACHE_TTL_MS=0`, or `ORPHADATA_ENABLED=0`, so they make external requests and create workspace SQLite files.

## What Changes

- **Include all suites in CI**: `errors.test.ts` and `rest-token.test.ts` SHALL run in CI; `test:all` SHALL include `test:rest-token`.
- **Test production helpers, not copies**: suites SHALL import and exercise exported production helpers; copied logic SHALL be replaced with direct tests or an application factory.
- **Hermetic test isolation**: all server-based tests SHALL set unique temporary `DB_PATH`/`TOOL_CACHE_DB_PATH`/`ORPHADATA_DB_PATH`, `TOOL_CACHE_TTL_MS=0`, and `ORPHADATA_ENABLED=0` before importing backend singletons; `websocket.test.ts` SHALL inject a temporary `JobStore` instead of deleting from the singleton.
- **Typecheck tests**: `tsconfig` SHALL include test files or a separate test tsconfig SHALL typecheck them in CI.

## Capabilities

### New Capabilities

- `test-integrity-and-hermeticity`: Ensures CI runs every suite, tests exercise production code rather than copies, and server-based tests are hermetic with isolated temporary stores.

### Modified Capabilities

- `devops-improvements`: CI SHALL run `errors.test.ts` and `test:rest-token`; `test:all` SHALL include `test:rest-token`; CI SHALL typecheck test files.

## Impact

- **Tests**: `tests/websocket.test.ts` (inject store), `tests/routes-helpers.test.ts`, `tests/api.test.ts`, `tests/ws-origin.test.ts`, `tests/shutdown.test.ts` (test exports), `tests/rest-token.test.ts` and `tests/errors.test.ts` (CI wiring).
- **Config**: `package.json` (`test`, `test:all` scripts), `tsconfig.json` (include tests or add test tsconfig), `.github/workflows/ci.yml` (rest-token job, typecheck tests).
- **Backend**: export pure helpers (`getClientIp`, `corsHeaders`, shutdown coordinator) for direct testing; add an application factory for configuration-dependent route tests.