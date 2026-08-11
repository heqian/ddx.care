## Why

Dependency advisories and package-manager audit behavior change independently of this plan, while CI has no exhaustive lock-node coverage or protected compatibility proof. Point-in-time counts, assumed CLI semantics, and mock tests cannot prove that the refreshed revision and lock graph remain compatible with deployed providers.

## What Changes

- Apply the generic test-integrity runner, profiles, temporary environment, and injected server seams first; apply the sensitive-cache data-root/bootstrap work second; then stabilize dependency tooling and a behaviorally qualified Bun pin before capturing a fresh baseline immediately ahead of dependency range and lockfile edits.
- Query OSV in exhaustive batches for every resolved npm lock node by exact package and version, validate one ordered response per query, and derive production/development paths from parsed lock roots.
- Use pinned `bun audit --json` output only as a fail-closed defense-in-depth consistency input; it neither defines dependency scope nor establishes complete coverage.
- Represent canonical paths as structured root-scope plus versioned-node arrays and require exact, owned, UTC-expiring JavaScript exceptions keyed to that structure.
- Add a weekly review that deterministically updates at most one dependency-review issue and fails when its required GitHub permissions are unavailable.
- Register evaluator and issue-updater tests under canonical `hermetic-bun`, with distinct required CI statuses selecting their owner registrations, and run dependency-owned provider assertions under canonical `real-provider-smoke` against the exact source revision, lock digest, Bun binary, and deployed model configuration.

## Capabilities

### New Capabilities

- `dependency-advisory-resolution`: Defines exhaustive OSV lock-node coverage, structured path policy, exact JavaScript exceptions, hermetic test registrations, and revision/lock-bound provider assertions.

### Modified Capabilities

- `devops-improvements`: Adds an independent OSV-backed dependency-advisory CI, protected revision/lock-bound provider gate, and scheduled-review requirement without changing existing cache or test-integrity requirements.

## Impact

- **Dependencies and tooling**: `package.json`, `bun.lock`, OSV evaluator, pinned Bun consistency adapter, structured JavaScript allowlist, and authoritative test manifest.
- **Automation**: `.github/workflows/ci.yml`, scheduled dependency review, one dependency-owned protected provider workflow/status, and issue-update permissions.
- **Documentation**: dependency triage and exception procedures, plus the duplicated inventories in `AGENTS.md` and `README.md`.
- **Portfolio prerequisites**: generic test-integrity runner/seams first; sensitive-cache data-root/bootstrap and startup registrations second.
- **Verification**: hermetic policy fixtures, the application matrix, and canonical `real-provider-smoke` bound to the candidate revision and lock digest.
