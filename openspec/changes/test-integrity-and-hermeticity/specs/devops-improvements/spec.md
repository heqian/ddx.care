## MODIFIED Requirements

### Requirement: CI workflow caches node_modules

The CI workflow SHALL cache `node_modules` keyed on the lockfile hash for all jobs. CI SHALL run `errors.test.ts` and `test:rest-token` in dedicated jobs. `test:all` SHALL include `test:rest-token`. CI SHALL typecheck test files and Playwright configuration.

#### Scenario: node_modules cached across runs
- **WHEN** a CI run starts and `bun.lock` is unchanged
- **THEN** `node_modules` is restored from cache

#### Scenario: REST token tests run in CI
- **WHEN** CI completes
- **THEN** the `test:rest-token` job has run

#### Scenario: Test files are typechecked
- **WHEN** CI completes
- **THEN** the typecheck step has covered `tests/**` and `playwright.config.ts`