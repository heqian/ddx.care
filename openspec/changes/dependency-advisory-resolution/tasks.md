## 1. Establish Cross-Portfolio Prerequisites

- [ ] 1.1 Apply and verify the generic `test-integrity-and-hermeticity` parent runner, canonical profile registry, temporary environment, discovery, and injected route/lifecycle/server seams without assigning it ownership of `APP_DATA_DIR` resolution or the `index.ts` bootstrap split.
- [ ] 1.2 Apply and verify `sensitive-cache-redaction` second so it owns the canonical data-root resolver and bootstrap/dynamic-server split and registers its `server-test` and `cache-enabled` cases into the existing runner.
- [ ] 1.3 Define one dependency-owned protected `real-provider-smoke` workflow/status bound to the exact source revision, lock digest, qualified Bun binary, and deployed model identifiers.

## 2. Implement Exhaustive Advisory Evaluation Without Dependency Edits

- [ ] 2.1 Parse every workspace root and resolved npm node from `bun.lock`, retain stable node locators plus exact names/versions, and derive production from dependency/optional/peer roots and development from dev roots.
- [ ] 2.2 Emit every simple root-to-node path as a closed JSON array with one root `{ kind, workspace, rootScope }` element followed by exact `{ kind, name, version }` package elements; reject ambiguity, truncation, unsupported locators, and path/graph loss.
- [ ] 2.3 Implement deterministic OSV batch requests with one exact npm name/version query per resolved node, including duplicate package/version nodes, and retain original node indexes across request chunks.
- [ ] 2.4 Validate HTTP/JSON/schema success, exact query/result cardinality and order, per-position pagination, unique vulnerability detail records, npm package alignment, withdrawn/snapshot consistency, and complete node coverage.
- [ ] 2.5 Normalize aliases and the highest valid CVSS or npm severity, classify missing/unparseable severity as blocking `unknown`, and expand each node finding to every structured root path.
- [ ] 2.6 Implement the full-tree `bun audit --json` adapter as additive consistency input that maps findings to lock nodes, never derives scope or removes OSV findings, and fails on command/network/schema/mapping/lock drift.
- [ ] 2.7 Add `.github/javascript-advisory-allowlist.json` with closed validation for exact advisory, package, version, structured path, derived scope, rationale, owner, and UTC expiry; enforce uniqueness by advisory/package/version/scope/canonical-path JSON.
- [ ] 2.8 Reject wildcard/range/string paths, malformed root/package nodes, field/path disagreement, and duplicate or stale merge exceptions.

## 3. Add Authoritative Test Profiles and Automation

- [ ] 3.1 Add `tests/dependency-advisory.test.ts` and classify it exactly once as `hermetic-bun` with temporary lock/allowlist/evidence paths, injected OSV/Bun fixtures and clock, loopback only, and no credentials or external network; select its owner registration through a distinct required dependency-advisory status.
- [ ] 3.2 Cover OSV duplicates, cardinality/order, pagination, details, severity conflicts/unknowns, command/network/malformed failures, structured multi-root paths, exact exceptions, lock races, and Bun-only/OSV-only consistency cases in that hermetic profile.
- [ ] 3.3 Add `tests/dependency-review-issue.test.ts` and classify it exactly once as `hermetic-bun` with a fake GitHub API, deterministic clock/fingerprint, temporary state, loopback only, and no credentials or external network; select its owner registration through a distinct required dependency-review status.
- [ ] 3.4 Cover first issue creation, unchanged no-op, changed update, close/reopen recurrence, duplicate identity, permission denial, and malformed API responses in the issue hermetic profile.
- [ ] 3.5 Add `tests/dependency-provider-smoke.test.ts` to the authoritative manifest under canonical `real-provider-smoke`; own the protected workflow/status, synthetic case, real specialist/CMO assertions, report validation, and non-disclosing revision/lock-bound evidence criteria.
- [ ] 3.6 Add package scripts and CI checks for manifest discovery, the two distinct owner-registration statuses using `hermetic-bun`, exhaustive OSV policy, pinned Bun consistency, and the protected provider status without changing any dependency range or `bun.lock`.
- [ ] 3.7 Add the weekly/manual issue workflow with `contents: read`, `issues: write`, serialized concurrency, stable label/marker, canonical structured-path fingerprinting, and fail-closed GitHub API behavior.
- [ ] 3.8 Stabilize the dependency-owned provider assertion interface and revision/lock/Bun/model/redacted evidence criteria before baseline; require a clean frozen install of that exact revision and reject mismatched or dirty inputs.

## 4. Qualify the Bun Pin and Freeze Baseline Inputs

- [ ] 4.1 Build a hermetic loopback behavioral fixture covering clean, known-finding, malformed JSON, HTTP error, connection error, output schema, package/version mapping, stdout/stderr, and exit behavior for candidate Bun binaries.
- [ ] 4.2 Run the fixture against candidate versions, select an exact version only after every case passes, record its binary digest, and block implementation if none qualifies.
- [ ] 4.3 Align `package.json#packageManager` and all setup-bun jobs to the qualified version without prescribing or retaining an earlier unverified pin.
- [ ] 4.4 After the test-integrity and sensitive-cache foundations are applied, freeze non-dependency package scripts, the Bun pin, authoritative manifest/runner, evaluator, CI/scheduled workflows, protected provider workflow/assertions, and evidence schemas; verify dependency ranges and `bun.lock` are still unchanged.

## 5. Capture the Fresh Baseline and Refresh Dependencies

- [ ] 5.1 As the final operation before dependency edits, record the stabilized commit, package-manifest digest, lock digest, Bun version/binary digest, UTC time, and command set in `docs/dependency-audit-triage.md`.
- [ ] 5.2 From a clean frozen install, query OSV for every exact npm lock node, run pinned Bun JSON consistency and strictly parsed `bun outdated`, and retain raw request/response/output digests plus normalized structured findings.
- [ ] 5.3 Select the smallest compatible dependency changes supported by the fresh evidence, document any major-version or override trade-off, then perform the immediately following planned remediation transaction by editing dependency ranges and refreshing `bun.lock` exactly once; treat unrelated manifest/lock or machinery edits as baseline-invalidating
- [ ] 5.4 Rerun exhaustive OSV and Bun consistency against the refreshed lock and verify every production/development critical, high, or unknown structured path is removed or exactly excepted.
- [ ] 5.5 Complete before/after triage for added, removed, unchanged, and reclassified structured paths, lower-severity findings, active JavaScript exceptions, and refreshed commit/package/lock digests.

## 6. Verify and Smoke the Exact Candidate Revision

- [ ] 6.1 Run `bun run lint`, all strict typecheck classes, `bun run build`, every required non-live profile, isolated Playwright, token classes, integration, and contract checks against the refreshed lock and record commit/lock evidence.
- [ ] 6.2 Obtain protected approval and require `real-provider-smoke` to verify the clean source revision, frozen lock digest, qualified Bun binary, and deployed model identifiers with `MOCK_LLM` unset before executing the synthetic non-PHI specialist/CMO assertions.
- [ ] 6.3 Record the successful provider workflow URL, UTC time, source revision, lock digest, Bun binary digest, and specialist/orchestrator model identifiers without retaining prompts, responses, credentials, or PHI.

## 7. Synchronize Documentation and Scheduled Review

- [ ] 7.1 Document OSV authority, Bun defense-in-depth behavior, root-derived scopes, structured path schema, JavaScript exception lifecycle, named test profiles, and issue identity in `AGENTS.md` and triage guidance.
- [ ] 7.2 Reconcile dependency inventories in `AGENTS.md`, `README.md`, and repository search results with `package.json`/`bun.lock`, removing redundant exact versions where practical.
- [ ] 7.3 Dispatch scheduled review twice with unchanged inputs and prove the second run makes no issue mutation; verify changed and cleared fixture fingerprints update, close, and reopen the same issue.
- [ ] 7.4 Review every active JavaScript exception with its owner and UTC expiry and verify no malformed, wildcard, stale, scanner-owned, or unowned entry remains.

## 8. Final Policy Verification

- [ ] 8.1 Run both owner-registration statuses under canonical `hermetic-bun`, authoritative manifest discovery, exhaustive live OSV evaluation, and pinned Bun consistency from a clean frozen install; archive lock-bound normalized and raw evidence digests.
- [ ] 8.2 Confirm branch protection requires exhaustive dependency policy plus the advisory and issue owner-registration statuses, while protected compatibility verification requires revision/lock-bound `real-provider-smoke`.
- [ ] 8.3 Inject OSV, Bun, parser, cardinality, pagination, lock-graph, exception, GitHub permission, revision/lock mismatch, and expiry failures and verify each blocks its applicable policy or provider gate.
