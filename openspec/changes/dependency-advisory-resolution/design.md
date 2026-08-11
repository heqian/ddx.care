## Context

`package.json` and `bun.lock` are the dependency sources of truth, but advisory coverage cannot depend on undocumented package-manager filtering. OSV's batch API accepts exact ecosystem/name/version queries, guarantees response order, returns one result per query position, and exposes pagination; detailed vulnerability records are fetched separately for severity and aliases. Package-manager JSON audit behavior varies by Bun version and is therefore suitable only after a behavior fixture qualifies the exact binary.

This design composes with `test-integrity-and-hermeticity`, which owns every test classification, and `sensitive-cache-redaction`, which owns the application data root and secure startup boundary.

See `proposal.md` for motivation and the two delta specs for required behavior.

## Goals / Non-Goals

**Goals:**
- Query every resolved npm lock node exactly and fail when request/response coverage is not one-to-one.
- Derive production and development paths solely from parsed root scopes and preserve each path structurally.
- Qualify and pin Bun behavior before using its JSON audit output as a secondary consistency source.
- Put new tests only under canonical `hermetic-bun` or protected `real-provider-smoke`.
- Bind protected provider compatibility evidence to an exact source revision, lock digest, qualified Bun binary, and deployed model configuration.

**Non-Goals:**
- Guaranteeing zero moderate or low findings; they remain visible in triage and scheduled review.
- Treating package-manager output, a previous count, or reachability judgment as exhaustive coverage.
- Automatically upgrading every dependency or accepting broad transitive overrides.
- Defining deployment packaging, promotion, or rollback mechanics.

## Decisions

### D1: Stabilize non-dependency machinery before the baseline boundary

**Decision:** Implementation has an explicit pre-baseline phase in which dependency ranges and `bun.lock` remain unchanged. First apply `test-integrity-and-hermeticity` for the generic parent runner, canonical profile registry, temporary environment, and injected server seams. Second apply `sensitive-cache-redaction` for the canonical `APP_DATA_DIR` resolver, no-static-import `index.ts` bootstrap, dynamic server import, and its downstream startup registrations. Then complete and stabilize all non-dependency package scripts, the OSV/Bun evaluator, exception schema, dependency-owned test/assertion registrations, CI and scheduled workflows, protected provider workflow/status, Bun metadata, and evidence formats.

Only after those inputs pass their hermetic fixtures is the fresh baseline captured from the exact commit and lock digest. Baseline capture is the final operation before editing dependency ranges and refreshing `bun.lock`; any intervening package-script, Bun-pin, test-runner, CI, provider-workflow, evaluator, or lock-parser change invalidates it and requires recapture.

The baseline records commit, package-manifest digest, lock digest, selected Bun version and binary digest, OSV request/response digests, package-manager JSON audit digest, outdated output digest, UTC time, and normalized findings. It contains neither an expected count nor preselected target versions.

**Rationale:** Capturing before the machinery is stable makes the evidence describe a different evaluator or artifact pipeline from the one used after refresh.

### D2: Select the Bun pin only after a behavioral fixture passes

**Decision:** Do not prescribe an exact Bun version in this plan. Run each candidate binary against a hermetic temporary project and loopback audit endpoint that supplies: a clean response, a known finding, malformed JSON, HTTP failure, connection failure, and an exact fixture lock. The fixture verifies command invocation, JSON shape, package/version identity, stdout/stderr handling, finding exit behavior, and failure behavior. Select and commit `packageManager` and CI setup only after one candidate passes all cases; record its binary digest with the fixture result.

The selected binary runs only `bun audit --json` for defense in depth. A Bun upgrade repeats the fixture before changing the shared pin. If no candidate passes, implementation blocks rather than adapting policy to assumed semantics.

**Rationale:** A pin is useful only when the exact observed behavior is compatible with the parser and fail-closed policy.

### D3: Parse root scopes and represent paths as closed structured arrays

**Decision:** Parse every workspace root and every resolved npm node from `bun.lock`, retaining a stable internal node locator, exact npm name, and exact version. Root sections `dependencies`, `optionalDependencies`, and `peerDependencies` produce `production` paths; `devDependencies` produces `development` paths. Scope comes only from the root section, not OSV, Bun audit, install state, or reachability notes. A node reachable through multiple roots has multiple independently enforced paths.

Each canonical path is a JSON array with this closed structure:

```json
[
  { "kind": "root", "workspace": ".", "rootScope": "dependencies" },
  { "kind": "package", "name": "direct-package", "version": "1.2.3" },
  { "kind": "package", "name": "affected-package", "version": "4.5.6" }
]
```

The root element is first and unique. Every following element is a versioned package node, and the final element must equal the finding package/version. Canonical serialization uses the displayed key order, UTF-8, no insignificant whitespace, and preserves array order. Enumerate every simple root-to-node path without truncation; validate cycle edges separately and fail if graph ambiguity, unsupported locators, path limits, or parser loss prevent exhaustive representation. Server-runtime, browser-bundle, and build-tool reachability are triage annotations and never change root-derived scope.

**Rationale:** String paths are delimiter-ambiguous and cannot be safely deep-compared or fingerprinted. Structured paths make root scope and every resolved version explicit.

### D4: Make exhaustive OSV batch coverage authoritative

**Decision:** Create one ordered OSV query entry for every resolved npm lock node, including duplicate package/version pairs represented by distinct lock nodes. Each entry is exactly `{ package: { ecosystem: "npm", name }, version }`; do not deduplicate nodes or combine a versioned purl with `version`. Deterministically chunk requests only when needed, while retaining the original node index.

For every batch response:

- Require HTTP success, valid JSON, a `results` array whose length exactly equals that request's query count, and one object at every position.
- Bind each result to its input node solely by the API's guaranteed order and recorded index; reject missing, extra, reordered, null, or malformed entries.
- Follow each `next_page_token` only for its corresponding indexed query until absent; reject repeated tokens, dropped positions, or incomplete pagination.
- Fetch and schema-validate the detail record for every unique returned vulnerability ID, require the same ID and a matching npm affected package, and reject withdrawn or inconsistent records until a bounded whole-evaluation retry succeeds.
- Derive the highest supported severity from valid CVSS data and normalized npm ecosystem/database labels. Conflicts use the higher value; missing or unparseable severity becomes `unknown`, which is blocking like critical/high.

Every node finding is expanded to every structured path that reaches that node. Network, TLS, timeout, status, body, schema, cardinality, pagination, detail, severity, or lock-consistency errors fail the evaluation; no node may be silently skipped.

**Rationale:** Exact one-to-one node queries make the coverage proof independent of package-manager filtering and ensure an empty result means OSV evaluated that exact node.

### D5: Use pinned Bun JSON audit as additive defense in depth

**Decision:** Run the qualified Bun binary's full-tree JSON audit after OSV evaluation. Strictly validate its command result and output, map each finding to exact lock nodes, and reconcile advisory IDs and aliases where possible. Bun output never classifies production/development scope, removes an OSV finding, or proves a node clean.

The normalized policy set is the OSV set plus valid additional Bun findings. A Bun finding absent from OSV remains blocking according to its reported severity, with unknown severity blocking; an OSV finding absent from Bun remains fully enforced and is recorded as a consistency difference. Unmappable findings, malformed output, unsupported schema, command/network failure, or a changed lock digest fail closed.

**Rationale:** A second feed can add detection value without becoming a hidden coverage or scope authority.

### D6: Use exact JavaScript exceptions

**Decision:** `.github/javascript-advisory-allowlist.json` is the only merge-time exception store for npm findings from OSV or the Bun consistency input. Its closed schema requires `schemaVersion: 1` and entries with `advisoryId`, exact `package`, exact `version`, structured `path`, derived `scope` (`production` or `development`), non-empty `rationale`, accountable `owner`, and future RFC 3339 UTC `expiresAt` ending in `Z`.

The unique key is `advisoryId + package + version + scope + canonical JSON(path)`. The package/version must equal the path's final node and scope must agree with its root element. Wildcards, ranges, string paths, duplicate keys, unknown fields, malformed nodes, expired entries, and merge-time entries unmatched by the evaluated lock fail. One entry never covers another root, path, version, or scope.

**Rationale:** Exact lock-node identity prevents one approval from silently covering another package, version, root, or path.

### D7: Register canonical hermetic and provider verification profiles

**Decision:** `test-integrity-and-hermeticity` must be applied before adding tests. Extend its authoritative manifest with exactly one entry for each new test:

| Test | Profile | Policy |
| --- | --- | --- |
| `tests/dependency-advisory.test.ts` | `hermetic-bun` | Fresh process, temporary lock/allowlist/evidence paths, injected OSV and Bun command fixtures, fake clock, loopback only, no credentials or external network |
| `tests/dependency-review-issue.test.ts` | `hermetic-bun` | Fresh process, temporary state, fake GitHub API, deterministic clock/fingerprint, loopback only, no credentials or external network |
| `tests/dependency-provider-smoke.test.ts` | `real-provider-smoke` | Dependency-owned protected workflow, synthetic case, assertions, and evidence criteria bound to exact revision/lock/Bun/model inputs; real provider allowlist and credentials; no default/non-live execution |

Manifest discovery rejects missing, duplicate, stale, or unsupported classifications. Distinct required CI statuses select the advisory and issue owner registrations even though both use canonical `hermetic-bun`; status identity is not modeled as a profile. `real-provider-smoke` is distinct from `live-integration` and `live-contract` and does not run in ordinary untrusted CI.

**Rationale:** Security-policy and GitHub automation tests need deterministic failure simulation, while provider credentials require a separate trust boundary and artifact-oriented execution.

### D8: Enforce lock-specific policy and maintain one scheduled issue

**Decision:** Both production and development paths with critical, high, or unknown findings block unless exactly excepted. Moderate/low findings remain report-only and scheduled. The fresh baseline and post-refresh run use the same stable evaluator, and every post-refresh critical/high/unknown path must be removed or exactly excepted.

A weekly and manually dispatchable workflow runs exhaustive OSV coverage, pinned Bun consistency, and strictly parsed `bun outdated`. It fingerprints the policy schema, lock digest, sorted finding sources/IDs/packages/versions/scopes/canonical path arrays, active exception metadata, and sorted outdated tuples. Timestamps, raw response order, and presentation are excluded.

Use `permissions: { contents: read, issues: write }`, serialized concurrency with `cancel-in-progress: false`, label `dependency-review`, and marker `<!-- dependency-review:v1 -->`. Create once, update/reopen/close the same issue on fingerprint change, make no API mutation for an unchanged fingerprint, and fail on duplicate identity, permission/API errors, or malformed responses.

**Rationale:** One deterministic issue provides durable review state without weakening merge-time enforcement.

### D9: Protect provider compatibility for the exact revision and lock

**Decision:** This change owns `tests/dependency-provider-smoke.test.ts` and one protected workflow/status. The workflow checks out the exact candidate revision, verifies a clean tree and frozen lock digest, uses the behaviorally qualified Bun binary, keeps `MOCK_LLM` unset, supplies deployed model identifiers and real credentials, and invokes the bounded synthetic non-PHI specialist/CMO assertions. Evidence records the source revision, lock digest, Bun binary digest, model identifiers, workflow URL, and UTC time without prompts, responses, credentials, or PHI.

**Rationale:** Compatibility evidence must identify the exact dependency graph and runtime exercised without assuming a deployment package format.

## Risks / Trade-offs

- **[OSV or registry outage blocks merges]** -> Use bounded retries, retain raw error evidence, and remain fail closed.
- **[Exhaustive node/path expansion is larger]** -> Stream deterministic batches and paths, but fail rather than truncate coverage.
- **[OSV and Bun feeds disagree]** -> Enforce their union, record differences, and never let Bun subtract authoritative OSV findings.
- **[Bun upgrades change JSON behavior]** -> Require the behavioral fixture before changing the shared pin.
- **[Credentialed provider smoke costs money and needs approval]** -> Keep the case bounded and synthetic; allow rerun but no mock substitution.

## Migration Plan

1. Apply the generic test-integrity runner, profile registry, temporary environment, and injected server seams without taking ownership of the data-root resolver or `index.ts` bootstrap.
2. Apply sensitive-cache redaction so it owns the resolver/bootstrap split and registers `server-test` and `cache-enabled` cases into that runner.
3. Implement the evaluator, structured paths, JavaScript exception schema, issue updater, canonical test registrations, dependency-owned provider assertions, package scripts, and CI/scheduled policy without changing dependency ranges or `bun.lock`.
4. Run behavioral fixtures across candidate Bun binaries, select one passing version, and implement the revision/lock-bound protected provider workflow/status.
5. Freeze all non-dependency package/CI/test/provider-workflow metadata, then capture the fresh OSV/Bun/outdated baseline as the final operation before dependency edits.
6. Refresh only evidence-driven dependencies, rerun exhaustive policy, complete triage, and run normal compatibility checks.
7. Run the protected provider status against the exact refreshed revision, lock digest, qualified Bun binary, and deployed models.
