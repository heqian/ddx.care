## Purpose

Provides exhaustive lock-node advisory evidence, structured and expiring JavaScript exceptions, artifact-bound compatibility proof, and cumulative release/rollback eligibility so incomplete coverage or stale artifact evidence cannot pass as safe.

## ADDED Requirements

### Requirement: Stable non-dependency machinery precedes the advisory baseline

Before baseline capture, the project SHALL first apply the generic test-integrity runner/profiles/temporary environment/injected server seams, then apply the sensitive-cache `APP_DATA_DIR` resolver, `index.ts` bootstrap split, and downstream startup registrations. It SHALL then stabilize all non-dependency package scripts, the behaviorally selected Bun pin, advisory evaluator, dependency-owned test and provider-assertion registrations, CI and scheduled workflows, protected provider workflow/status, and evidence format without changing dependency ranges or `bun.lock`. The fresh baseline SHALL be captured from the exact stabilized commit and lock digest as the final operation immediately before dependency ranges or the lockfile are edited. It SHALL record package-manifest and lock digests, Bun version and binary digest, UTC time, commands, normalized findings, and raw evidence digests.

#### Scenario: Stable inputs are baselined
- **WHEN** all non-dependency package, CI, test-runner, Bun, provider-workflow, and evidence-format changes are complete while dependency ranges and `bun.lock` remain unchanged
- **THEN** the baseline records that exact commit and lock digest immediately before dependency remediation begins

#### Scenario: Non-remediation machinery changes after baseline
- **WHEN** a package script, Bun pin, test manifest/runner, CI/provider workflow, evaluator, non-dependency package-manifest field, or lockfile input changes after baseline outside the one planned dependency-range/lock refresh transaction
- **THEN** the baseline SHALL be invalid and SHALL be recaptured before remediation continues

#### Scenario: Planned dependency refresh follows the baseline
- **WHEN** the next operation after baseline capture is the one planned transaction that edits dependency ranges and refreshes `bun.lock`
- **THEN** those candidate dependency changes are compared against the frozen baseline and do not invalidate it merely by performing the remediation it was captured to measure

#### Scenario: Point-in-time plan data is not acceptance evidence
- **WHEN** an advisory count or candidate package version recorded before implementation differs from current registry or lockfile data
- **THEN** acceptance SHALL use the fresh baseline and refreshed lockfile rather than the earlier count or target

### Requirement: OSV batch coverage is exhaustive and one-to-one

The advisory evaluator SHALL submit one exact OSV query for every resolved npm lock node using ecosystem `npm`, exact package name, and exact resolved version. Distinct lock nodes SHALL remain distinct query positions even when package and version are equal. Each batch response SHALL contain exactly one ordered result per query position; pagination SHALL be completed for its corresponding position, and every returned vulnerability ID SHALL have a schema-valid detail record. Missing, extra, null, reordered, malformed, incomplete, withdrawn, or unresolvable results SHALL fail coverage. Severity SHALL use the highest valid supported value; missing or malformed severity SHALL become blocking `unknown`.

#### Scenario: Every exact npm node receives a result
- **WHEN** the lock contains resolved npm nodes, including duplicate package/version pairs at distinct node locators
- **THEN** OSV receives one query per node and the evaluator binds one response position back to each original node without deduplication

#### Scenario: Batch cardinality differs
- **WHEN** an OSV batch returns fewer or more result objects than submitted queries or any position is absent or malformed
- **THEN** the entire advisory evaluation SHALL fail rather than treating an unmatched node as clean

#### Scenario: Query has another page
- **WHEN** one ordered result contains a next-page token
- **THEN** the evaluator SHALL retrieve and validate every page for that indexed query before coverage can complete

#### Scenario: OSV detail severity is unusable
- **WHEN** a returned vulnerability has no valid supported severity or has conflicting severities
- **THEN** the evaluator SHALL use the highest valid severity or classify it as blocking `unknown` when none is valid

#### Scenario: OSV operation is uncertain
- **WHEN** an OSV request has a command, DNS, TLS, timeout, HTTP, JSON, schema, pagination, detail, or snapshot-consistency failure
- **THEN** evaluation SHALL fail closed and SHALL NOT emit a clean result

### Requirement: Dependency paths are structured and root-scoped

Every root-to-node path SHALL be represented as a structured JSON array. Its first and only root element SHALL contain `kind: "root"`, exact workspace identity, and `rootScope`; each later element SHALL contain only `kind: "package"`, exact npm `name`, and exact `version`. The final package element SHALL equal the finding package/version. Root scopes `dependencies`, `optionalDependencies`, and `peerDependencies` SHALL derive `production`; `devDependencies` SHALL derive `development`. All simple paths SHALL be enumerated without truncation, and a node reachable from multiple roots SHALL retain each path separately.

#### Scenario: Production and development paths reach one node
- **WHEN** the same resolved node is reachable from both a production root section and `devDependencies`
- **THEN** the evaluator SHALL emit separate structured paths with production and development scope derived from their respective root elements

#### Scenario: Path contains ambiguous text
- **WHEN** a proposed path is a string, omits a versioned package node, has multiple root elements, or disagrees with the parsed lock graph
- **THEN** path validation SHALL fail before findings or exceptions are evaluated

#### Scenario: One advisory has multiple paths
- **WHEN** one advisory affects a node reachable through multiple structured paths
- **THEN** every path SHALL be independently enforced and one path's disposition SHALL NOT cover another

#### Scenario: Critical high or unknown path remains
- **WHEN** a refreshed production or development path has an unexcepted critical, high, or unknown finding
- **THEN** policy SHALL fail; moderate and low findings SHALL remain visible without failing solely for severity

### Requirement: JavaScript advisory exceptions are exact and independently governed

The merge-time JavaScript allowlist SHALL use a closed versioned schema and SHALL apply only to npm findings from OSV or the pinned Bun consistency input. Each exception SHALL require `advisoryId`, exact `package`, exact `version`, structured `path`, derived `scope`, non-empty `rationale`, accountable `owner`, and future RFC 3339 UTC `expiresAt` ending in `Z`. Its unique key SHALL be `advisoryId + package + version + scope + canonical JSON(path)`. The path final node and root-derived scope SHALL match the duplicated package/version/scope fields. Wildcards, ranges, string paths, unknown fields, duplicate keys, invalid timestamps, expired entries, and merge-time entries unmatched by current findings SHALL fail.

#### Scenario: Exact unexpired exception matches
- **WHEN** a current finding exactly matches every key field of one schema-valid exception whose UTC expiry is in the future
- **THEN** that finding alone SHALL be excepted and its owner and rationale SHALL appear in review evidence

#### Scenario: Structured path differs
- **WHEN** an exception matches advisory, package, version, and scope but any root or versioned path node differs
- **THEN** the finding SHALL remain unexcepted and the gate SHALL fail

#### Scenario: Exception is expired
- **WHEN** `expiresAt` is equal to or earlier than the gate's UTC evaluation time
- **THEN** allowlist validation SHALL fail before any exception is applied

### Requirement: Pinned Bun JSON audit is additive defense in depth

The project SHALL select an exact Bun version only after a hermetic behavioral fixture verifies the required full-tree JSON audit command's clean, finding, malformed-response, HTTP-failure, connection-failure, output-schema, and exit behavior. The selected binary and digest SHALL be shared by package metadata, CI, and protected provider verification. Its `bun audit --json` result SHALL be strictly parsed after OSV and SHALL only add findings or consistency evidence. It SHALL NOT define production/development scope, remove an OSV finding, or establish exhaustive coverage.

#### Scenario: Bun candidate passes behavioral fixture
- **WHEN** a candidate binary produces every expected clean, finding, and failure behavior against the hermetic audit fixture
- **THEN** that exact version and binary digest SHALL be eligible for the shared pin

#### Scenario: No Bun candidate passes
- **WHEN** every candidate fails at least one required fixture behavior
- **THEN** implementation SHALL remain blocked and SHALL NOT select a version based on assumed behavior

#### Scenario: Bun reports an additional finding
- **WHEN** valid Bun JSON reports a lock-node finding absent from OSV
- **THEN** the finding SHALL be added to policy and enforced on its root-derived structured paths

#### Scenario: OSV finding is absent from Bun
- **WHEN** an OSV finding does not appear in valid Bun JSON
- **THEN** the OSV finding SHALL remain enforced and the consistency difference SHALL be recorded

#### Scenario: Bun consistency input fails
- **WHEN** the pinned command, registry request, JSON parser, schema mapper, node mapper, or lock-digest check fails
- **THEN** policy SHALL fail rather than proceed with OSV alone or treat Bun as clean

### Requirement: Dependency verification uses authoritative test profiles

Every new matching test SHALL have exactly one classification in the authoritative test-integrity manifest. Evaluator and GitHub issue-updater tests SHALL both use canonical profile `hermetic-bun` and SHALL run in fresh isolated processes with fixtures or fake APIs, no credentials, and no external network. Distinct required CI statuses SHALL select the two owner registrations without defining profile aliases. Dependency-owned provider assertions SHALL use canonical `real-provider-smoke` and this capability SHALL own its single protected revision/lock-bound workflow and required status. Provider verification SHALL NOT run as an ordinary non-live, integration, or contract class.

#### Scenario: Evaluator test is added
- **WHEN** `tests/dependency-advisory.test.ts` is discovered
- **THEN** it SHALL be classified exactly once as `hermetic-bun`, selected by the dependency-advisory required status, and SHALL run without live OSV, registry, GitHub, or provider access

#### Scenario: Issue-updater test is added
- **WHEN** `tests/dependency-review-issue.test.ts` is discovered
- **THEN** it SHALL be classified exactly once as `hermetic-bun`, selected by the dependency-review required status, and SHALL use a fake GitHub API and deterministic fingerprint inputs

#### Scenario: Provider smoke is selected
- **WHEN** `tests/dependency-provider-smoke.test.ts` is invoked
- **THEN** manifest policy SHALL require canonical `real-provider-smoke`, the protected workflow SHALL verify exact revision/lock/Bun/model inputs, and execution SHALL reject dirty or mismatched inputs, missing trusted approval, credentials, or provider allowlist

### Requirement: Triage and dependency inventories remain synchronized

The project SHALL maintain baseline and refreshed triage tied to source commit, package-manifest digest, lock digest, Bun binary digest, OSV/Bun raw evidence digests, and structured findings. Triage SHALL record source, advisory ID and aliases, severity, exact package/version, derived scope, structured path array, server/browser/build reachability annotation, disposition, and exact exception key when present. `package.json` and `bun.lock` SHALL remain dependency-version sources of truth, and duplicated documentation inventories SHALL match or omit exact versions.

#### Scenario: Evidence joins one candidate
- **WHEN** a reviewer inspects triage, CI policy, and provider-smoke evidence
- **THEN** every record SHALL identify the same source revision, lock digest, and qualified Bun binary

#### Scenario: Documentation inventory drifts
- **WHEN** a documented dependency range or resolved version differs from `package.json` or `bun.lock`
- **THEN** verification SHALL fail until the duplicate is synchronized or removed

### Requirement: Provider compatibility is proven for the exact revision and lock

This capability SHALL own the synthetic non-PHI case, real specialist and CMO assertions, available-report validation, evidence criteria, and the single protected `real-provider-smoke` workflow/status. The workflow SHALL check out the exact candidate revision, verify a clean tree and frozen lock digest, use the qualified Bun binary, require `MOCK_LLM` unset, and run with real credentials and deployed model identifiers. Evidence SHALL record revision, lock digest, Bun binary digest, model identifiers, UTC time, and workflow URL without prompts, responses, credentials, or PHI.

#### Scenario: Mock tests pass without protected smoke
- **WHEN** non-live checks pass but no valid `real-provider-smoke` evidence exists for the candidate revision and lock digest
- **THEN** provider compatibility SHALL remain unverified

#### Scenario: Protected smoke verifies candidate inputs
- **WHEN** the protected class starts
- **THEN** it SHALL reject a dirty tree or revision, lock, Bun, or model mismatch before invoking the provider assertions

#### Scenario: Provider gate cannot run safely
- **WHEN** revision/lock/Bun identity, credentials, approval, deployed model identifiers, provider access, or report validation is unavailable
- **THEN** provider compatibility SHALL remain unverified rather than substituting mock mode or another revision

### Requirement: Scheduled dependency review maintains one issue

A weekly and manually dispatchable review SHALL run exhaustive OSV coverage, pinned Bun consistency, and outdated direct-dependency review and maintain at most one repository issue identified by a stable label and body marker. Its deterministic SHA-256 fingerprint SHALL cover policy schema, lock digest, sorted finding sources/IDs/packages/versions/scopes/canonical structured paths, active exception metadata, and sorted outdated tuples while excluding timestamps and presentation order. The workflow SHALL use read-only contents permission, issues write permission, and serialized execution.

#### Scenario: First findings create one issue
- **WHEN** review finds advisories or outdated direct dependencies and no identified issue exists
- **THEN** exactly one issue SHALL be created with the fingerprint and workflow evidence

#### Scenario: Unchanged rerun is idempotent
- **WHEN** an identified issue exists and a rerun computes the same fingerprint
- **THEN** the workflow SHALL NOT create, comment on, reopen, or rewrite an issue

#### Scenario: Findings change
- **WHEN** an identified issue exists and the fingerprint changes
- **THEN** that same issue SHALL be updated and reopened if necessary without creating another issue

#### Scenario: Findings clear and later recur
- **WHEN** findings clear and subsequently return
- **THEN** the workflow SHALL close and later reopen the same identified issue rather than create a replacement

#### Scenario: Issue identity or permission is unsafe
- **WHEN** multiple identified issues exist or the workflow lacks required issue permissions or receives a malformed API response
- **THEN** scheduled review SHALL fail without silently selecting or creating an issue


#### Scenario: Historical source would be rebuilt
- **WHEN** the requested rollback digest is unavailable or operators propose rebuilding source, re-resolving dependencies, or using a mutable tag
- **THEN** rollback SHALL be rejected and a fully gated forward-fix digest SHALL be produced
