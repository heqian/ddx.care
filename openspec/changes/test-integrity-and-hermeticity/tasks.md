## 1. Export Helpers and App Factory

- [ ] 1.1 Export `corsHeaders`, `getClientIp`, `verifyJobToken`, and the origin-selection helper from `src/backend/api/routes.ts`
- [ ] 1.2 Extract `shutdown()` from `index.ts` into an injectable coordinator accepting timers/server references
- [ ] 1.3 Add a `createApp({ config, stores })` factory for configuration-dependent route tests

## 2. Hermetic Test Setup

- [ ] 2.1 Add a `tests/setup-hermetic.ts` module that sets unique temporary `DB_PATH`, `TOOL_CACHE_DB_PATH`, `ORPHADATA_DB_PATH`, `TOOL_CACHE_TTL_MS=0`, and `ORPHADATA_ENABLED=0` before any backend singleton import, with cleanup
- [ ] 2.2 Make all server-based test files import the setup module first
- [ ] 2.3 Refactor `websocket.test.ts` to inject a temporary `JobStore` instead of deleting from the singleton

## 3. Replace Copied Logic with Direct Tests

- [ ] 3.1 Update `tests/routes-helpers.test.ts` to import and test the real `corsHeaders` and `getClientIp`
- [ ] 3.2 Update `tests/api.test.ts` CORS sections to exercise the real helper
- [ ] 3.3 Update `tests/ws-origin.test.ts` to exercise the real origin-selection helper
- [ ] 3.4 Update `tests/shutdown.test.ts` to import the real `shutdown()` or spawn the server and send a signal

## 4. CI Wiring and Typecheck

- [ ] 4.1 Add `errors.test.ts` to the `test` script or a dedicated CI job
- [ ] 4.2 Add `test:rest-token` to `test:all` and as a CI job in `.github/workflows/ci.yml`
- [ ] 4.3 Add a `tsconfig.test.json` (or include `tests/**` in `tsconfig.json`) and a `typecheck:tests` script; run it in CI

## 5. Verification

- [ ] 5.1 Run `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run test:rest-token` with hermetic env
- [ ] 5.2 Confirm no workspace `jobs.sqlite` is touched by `bun run test`