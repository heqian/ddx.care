## ADDED Requirements

### Requirement: CI enforces exhaustive test classification

CI SHALL discover every `tests/**/*.test.ts` and `tests/**/*.test.tsx` file and resolve it through extensible typed registrations before applying selection filters. It SHALL reject unclassified or multiply classified tests, stale or escaping executable/support registrations, duplicate startup-case IDs, unsupported profiles, and Playwright specs excluded by configured discovery. Validation SHALL compare discovered paths rather than a hard-coded file count.

#### Scenario: Repository inventory is owned dynamically
- **WHEN** CI discovers the repository's current Bun tests, Playwright specs, and registered support/startup modules
- **THEN** every executable resolves to exactly one supported policy and every registered path or case is valid without comparing against a fixed numeric inventory

#### Scenario: Future test cannot be silently omitted
- **WHEN** a new `tests/**/*.test.ts` or `tests/**/*.test.tsx` file exists without a manifest classification
- **THEN** the discovery gate fails before test selection or execution

#### Scenario: Downstream registration is composable
- **WHEN** an active downstream change adds a test, support fixture, startup case, or protected execution registration
- **THEN** discovery merges that registration with the existing inventory and fails on omission or overlap rather than requiring a replacement explicit list

### Requirement: CI runs isolated and policy-specific test classes

Required merge checks SHALL run discovery first, every required non-live Bun profile, token-secret profiles, frontend tests, isolated Playwright tests, workspace-sentinel verification, and separate strict application, Bun/frontend/support, and Playwright typechecks. Every runner-owned test or startup child and every Playwright server SHALL receive a unique temporary root exported as `APP_DATA_DIR` plus explicit database/audit leaf environment values beneath it. The runner SHALL own temporary-environment containment, not application data-root resolution. Base profiles SHALL use cache TTL zero; cache-enabled profiles SHALL use a positive TTL and a generated strict base64url cache key.

#### Scenario: Required non-live classes run
- **WHEN** required merge CI completes successfully
- **THEN** every discovered required non-live registration, parent-owned startup case, frontend class, isolated Playwright spec, and sentinel gate has passed under its declared profile

#### Scenario: Test environments are typechecked separately
- **WHEN** required merge CI completes successfully
- **THEN** strict application, Bun/frontend/support, and Playwright typecheck contracts have each passed as distinct checks

#### Scenario: Cache-enabled class receives a valid key
- **WHEN** CI launches a cache-enabled registration
- **THEN** the child receives a positive cache TTL and a newly generated strict unpadded base64url key while base-profile children receive TTL zero and no cache key

### Requirement: Live and protected verification remains explicit

Integration, contract, and `real-provider-smoke` execution SHALL remain separate from the default non-live suite. Integration SHALL be an environment-only command with documented provider access prerequisites. Contract tests SHALL retain their declared CI policy. This capability SHALL own only the canonical `real-provider-smoke` execution policy; dependency policy SHALL own its synthetic case/assertions and single protected revision/lock-bound workflow/status. Mock-mode success SHALL NOT substitute for that status.

#### Scenario: Live classes follow declared policy
- **WHEN** CI evaluates live test classes
- **THEN** contract tests run under their declared provider allowlist, integration runs only with its explicit environment trigger, and real-provider smoke runs only under its protected exact-candidate gate

#### Scenario: Integration environment is unavailable
- **WHEN** the complete non-live suite passes but required integration network access or credentials are unavailable
- **THEN** verification records an explicit environment-only integration skip and missing prerequisite without reporting integration as passed or weakening the non-live suite
