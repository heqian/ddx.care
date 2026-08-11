## ADDED Requirements

### Requirement: CI enforces dependency advisory policy

GitHub Actions SHALL use exhaustive OSV batch queries as the fail-closed JavaScript advisory coverage source, submitting exact npm package/version input for every resolved lock node and validating one ordered result per query. It SHALL derive production/development paths from parsed lock roots and run behaviorally qualified, pinned `bun audit --json` only as additive consistency input. Critical, high, and unknown findings in either path scope SHALL fail unless exactly excepted by the JavaScript authority. Evaluator and issue tests SHALL both use canonical `hermetic-bun`, with distinct required CI statuses selecting their owner registrations. Dependency-owned provider assertions SHALL use canonical `real-provider-smoke` inside one protected workflow/status bound to the exact source revision, lock digest, qualified Bun binary, and deployed models. Scheduled review SHALL idempotently maintain one issue with deterministic fingerprinting and least-privilege permissions.

#### Scenario: Required exhaustive advisory check runs
- **WHEN** CI evaluates a pull request or protected-branch commit
- **THEN** every exact npm lock node SHALL receive one validated OSV batch result, Bun JSON consistency SHALL run with the qualified pin, and all structured paths SHALL report the evaluated lock digest

#### Scenario: Blocking finding is not exactly excepted
- **WHEN** either root-derived path scope contains a critical, high, or unknown finding without a schema-valid exact unexpired exception
- **THEN** the dependency-advisory CI requirement SHALL fail

#### Scenario: Audit operation is uncertain
- **WHEN** an OSV/Bun command, network request, one-to-one response check, parser, detail lookup, lock traversal, structured-path derivation, or JavaScript allowlist validation fails
- **THEN** CI SHALL fail rather than treat the result as zero findings

#### Scenario: New dependency tests are classified
- **WHEN** CI discovers the evaluator and issue-updater tests
- **THEN** the authoritative manifest SHALL classify both exactly once as `hermetic-bun`, distinct required statuses SHALL select their owner registrations, and both SHALL run without external network

#### Scenario: Candidate has not passed protected provider verification
- **WHEN** dependency inputs change and `real-provider-smoke` has not passed the exact candidate revision, lock digest, qualified Bun binary, and deployed model configuration
- **THEN** provider compatibility SHALL remain unverified even when non-live checks pass

#### Scenario: Provider evidence inputs drift
- **WHEN** protected provider smoke passed one revision/lock/Bun/model tuple but a different tuple is proposed
- **THEN** that evidence SHALL be rejected and `real-provider-smoke` SHALL rerun for the replacement tuple

#### Scenario: Scheduled findings are unchanged
- **WHEN** weekly or manual review computes the same fingerprint as the identified dependency-review issue
- **THEN** the workflow SHALL make no issue mutation and SHALL NOT create a duplicate

#### Scenario: Scheduled findings change
- **WHEN** review computes a different fingerprint
- **THEN** the workflow SHALL update or reopen the one identified issue, or create it only when no prior identified issue exists

#### Scenario: Scheduled workflow lacks safe issue access
- **WHEN** `contents: read` and `issues: write` permissions are unavailable, multiple identified issues exist, or the GitHub API response is malformed
- **THEN** the workflow SHALL fail without silently skipping or duplicating the review issue
