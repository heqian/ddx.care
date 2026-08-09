## Purpose

Ensures CI runs every test suite, tests exercise exported production code rather than reimplemented copies, and server-based tests are hermetic with isolated temporary stores, so a green CI reliably reflects production behavior and tests never mutate developer workspaces.

## ADDED Requirements

### Requirement: CI runs every test suite

CI SHALL run `errors.test.ts` and `test:rest-token` in dedicated jobs. `test:all` SHALL include `test:rest-token`. No unit-test file outside an explicit opt-in integration set SHALL be absent from CI.

#### Scenario: REST token regressions are caught in CI
- **WHEN** a change breaks REST token verification
- **THEN** CI fails the `test:rest-token` job

#### Scenario: Error classification regressions are caught in CI
- **WHEN** a change breaks error classification or retry predicates
- **THEN** CI fails the `errors.test.ts` job

### Requirement: Tests exercise production helpers, not copies

Suites SHALL import and exercise exported production helpers (`corsHeaders`, `getClientIp`, token verification, origin selection, shutdown coordinator) rather than reimplementing them. Reimplemented logic SHALL be replaced with direct tests or an application factory that accepts injected configuration and stores.

#### Scenario: CORS test exercises the real helper
- **WHEN** a CORS test runs
- **THEN** it imports `corsHeaders` from the routes module and asserts against its real output

#### Scenario: Shutdown test exercises the real coordinator
- **WHEN** a shutdown test runs
- **THEN** it imports the exported shutdown function or spawns the server and sends a signal, rather than reproducing the wait loop

### Requirement: Server-based tests are hermetic

All tests that import backend singletons or start the server SHALL set unique temporary `DB_PATH`, `TOOL_CACHE_DB_PATH`, and `ORPHADATA_DB_PATH` values, `TOOL_CACHE_TTL_MS=0`, and `ORPHADATA_ENABLED=0` before importing the singletons. `websocket.test.ts` SHALL inject a temporary `JobStore` instead of running `DELETE FROM jobs` against the singleton default database.

#### Scenario: Tests do not touch the workspace database
- **WHEN** `bun run test` runs in a workspace with a populated `jobs.sqlite`
- **THEN** no test reads or mutates `jobs.sqlite`; all tests use temporary isolated databases

#### Scenario: Tests do not make external Orphadata requests
- **WHEN** server-based tests run
- **THEN** `ORPHADATA_ENABLED=0` prevents external Orphadata fetches

#### Scenario: WebSocket test is hermetic
- **WHEN** `websocket.test.ts` runs
- **THEN** it uses an injected temporary `JobStore` and does not delete from the singleton

### Requirement: Test files are typechecked

CI SHALL typecheck test files and Playwright configuration, either by including `tests/**` in the main `tsconfig.json` or via a dedicated test tsconfig.

#### Scenario: Invalid test helper fails CI
- **WHEN** a test helper uses an incorrect Playwright API
- **THEN** the typecheck step fails