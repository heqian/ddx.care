## Context

`package.json:11-16` `test` omits `errors.test.ts`; `test:rest-token` is a separate script excluded from `test:all` and CI. `tests/routes-helpers.test.ts:3-125`, `tests/api.test.ts:738-865`, `tests/ws-origin.test.ts:9-21`, and `tests/shutdown.test.ts:78-189` reimplement production logic; the copied CORS helper expects `GET, POST, OPTIONS` while production includes `DELETE` (`src/backend/api/routes.ts:38-45`). `tests/websocket.test.ts:37-46` runs `DELETE FROM jobs` against the singleton default database. Server-based tests do not set isolated `DB_PATH`/`TOOL_CACHE_TTL_MS=0`/`ORPHADATA_ENABLED=0`. `tsconfig.json:14` includes only `src/**` and `index.ts`, so tests are not typechecked.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Wire all suites into CI.
- Test real helpers, not copies.
- Make server-based tests hermetic.
- Typecheck tests.

**Non-Goals:**
- Adding new feature tests (covered by other proposals).
- Achieving 100% coverage thresholds (separate change).
- Replacing `bun:test` with another framework.

## Decisions

### D1: Export helpers and add an app factory

**Decision:** Export `corsHeaders`, `getClientIp`, `verifyJobToken`, and the origin-selection helper from `routes.ts`. Extract `shutdown()` into an injectable coordinator that accepts timers/server references. Add a `createApp({ config, stores })` factory for configuration-dependent route tests.

**Rationale:** Direct testing of exports eliminates stale copies. The factory lets tests inject temporary stores and config without module-registry caching issues.

### D2: Inject JobStore in WebSocket tests

**Decision:** Refactor `websocketHandlers` to accept a `JobStore` (or accept it via the `WsData`/context), and have `websocket.test.ts` construct a temporary in-memory `JobStore` instead of importing the singleton.

**Rationale:** Prevents tests from mutating developer databases and removes the `DELETE FROM jobs` pattern.

### D3: Hermetic env setup

**Decision:** Add a test setup module that sets unique temporary `DB_PATH`, `TOOL_CACHE_DB_PATH`, `ORPHADATA_DB_PATH`, `TOOL_CACHE_TTL_MS=0`, and `ORPHADATA_ENABLED=0` before any backend singleton is imported, and clean up temporary files afterward. All server-based test files import this setup first.

**Rationale:** Centralizes hermeticity and prevents accidental singleton import before env vars are set.

### D4: CI wiring and typecheck

**Decision:** Add `errors.test.ts` to the `test` script or a dedicated CI job; add `test:rest-token` to `test:all` and as a CI job. Add a `tsconfig.test.json` (or include `tests/**` in `tsconfig.json`) and a `typecheck:tests` script run in CI.

**Rationale:** Ensures every suite runs and tests are type-safe.

## Risks / Trade-offs

- **[Exporting helpers widens the public surface]** → Exports are internal but now testable. **Mitigation:** Mark them `@internal` in comments; they are not part of a published API.
- **[App factory is a refactor]** → Adds indirection. **Mitigation:** The factory is thin; `index.ts` calls it with the real singletons.
- **[Hermetic setup is order-sensitive]** → Importing a singleton before the setup module runs reverts to non-hermetic behavior. **Mitigation:** The setup module is the first import in every server-based test; a lint rule or convention enforces this.

## Migration Plan

1. Export helpers and add the app factory; update affected tests.
2. Add the test setup module and convert server-based tests.
3. Wire CI and typecheck tests.
4. Rollback: revert exports and CI jobs (tests become non-hermetic but still run).

## Open Questions

- Should `errors.test.ts` join the `test` script or remain a separate CI job? (Leaning: separate CI job to preserve the module-registry note about config caching; either works.)