## Purpose

Resolves reachable dependency vulnerabilities by patching direct dependencies, adds a CI audit gate with a documented allowlist, and records a reachability triage so the runtime path is free of known critical/high advisories and new vulnerabilities are caught before merge.

## ADDED Requirements

### Requirement: Reachable critical and high advisories are resolved

The project SHALL have zero reachable critical or high advisories in its runtime path (server and browser bundle) after upgrades, or SHALL document each remaining one as a time-bound exception with rationale. Direct dependencies SHALL be upgraded to versions that resolve reachable high-severity transitives (e.g., `@mastra/core` and `isomorphic-dompurify`).

#### Scenario: No reachable critical/high advisories after upgrade
- **WHEN** `bun audit` runs after upgrades
- **THEN** no critical or high advisory is reachable in the runtime path, or each remaining one is documented as a time-bound exception

#### Scenario: Upgrade preserves behavior
- **WHEN** `@mastra/core` and `isomorphic-dompurify` are upgraded
- **THEN** `bun run test`, `bun run test:frontend`, and E2E tests pass without behavior changes

### Requirement: CI audit gate with allowlist

CI SHALL run `bun audit` and SHALL fail on new critical or high advisories. An allowlist SHALL permit documented, time-bound exceptions (advisory ID, rationale, expiry). The allowlist SHALL be reviewed at each exception's expiry.

#### Scenario: New critical advisory fails CI
- **WHEN** a new critical advisory is introduced via a dependency
- **THEN** CI fails the audit job

#### Scenario: Documented exception passes CI
- **WHEN** an advisory is listed in the allowlist with a valid rationale and unexpired date
- **THEN** CI does not fail for that advisory

#### Scenario: Expired exception fails CI
- **WHEN** an allowlisted exception's expiry has passed
- **THEN** CI fails and the exception must be renewed or the dependency patched

### Requirement: Reachability triage is documented

A reachability triage SHALL record, for each advisory: whether it is reachable in the server runtime, the browser bundle, dev-only, or not applicable; and the rationale. The triage SHALL be maintained as advisories change.

#### Scenario: Triage distinguishes runtime from dev-only
- **WHEN** the triage is inspected
- **THEN** each advisory is classified as server-runtime, browser-bundle, dev-only, or not-applicable with rationale

### Requirement: Scheduled advisory review

A scheduled workflow SHALL run `bun audit` and `bun outdated` weekly and SHALL open an issue when new advisories or outdated dependencies are found.

#### Scenario: New advisory creates an issue
- **WHEN** the weekly workflow finds a new advisory
- **THEN** an issue is opened with the advisory details

#### Scenario: Outdated dependency reported
- **WHEN** the weekly workflow finds outdated direct dependencies
- **THEN** an issue or report is generated for review