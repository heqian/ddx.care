## MODIFIED Requirements

### Requirement: CI workflow caches node_modules

The CI workflow SHALL cache `node_modules` keyed on the lockfile hash for all jobs. CI SHALL run a `bun audit` job that fails on new critical or high advisories, with an allowlist for documented, time-bound exceptions. A scheduled workflow SHALL run `bun audit` and `bun outdated` weekly and open an issue on new findings.

#### Scenario: node_modules cached across runs
- **WHEN** a CI run starts and `bun.lock` is unchanged
- **THEN** `node_modules` is restored from cache

#### Scenario: Audit gate runs in CI
- **WHEN** CI completes
- **THEN** the `bun audit` job has run and any new critical/high advisory fails the build

#### Scenario: Weekly advisory review runs
- **WHEN** the scheduled workflow runs
- **THEN** `bun audit` and `bun outdated` execute and new findings open an issue