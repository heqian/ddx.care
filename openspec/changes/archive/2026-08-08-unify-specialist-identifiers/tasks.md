## 1. Canonical Manifest

- [x] 1.1 Create a dependency-neutral specialist manifest with canonical camelCase IDs
- [x] 1.2 Export `SpecialistId` and specialist metadata from the manifest
- [x] 1.3 Type the registered-agent record and tool assignment map as exhaustive `SpecialistId` records

## 2. Agent and Tool Alignment

- [x] 2.1 Update the eight kebab-case runtime agent IDs to canonical camelCase values
- [x] 2.2 Type specialist factory configuration so only canonical IDs are accepted
- [x] 2.3 Build CMO allowed IDs and agent-list API metadata from the canonical manifest
- [x] 2.4 Remove silent fallback tool assignment from registered-agent construction

## 3. Runtime Invariants

- [x] 3.1 Add startup validation for manifest, registry, runtime ID, and assignment key equality
- [x] 3.2 Fail startup with a precise non-sensitive error for missing, duplicate, or orphaned IDs
- [x] 3.3 Add a startup log containing only the validated specialist count

## 4. Verification

- [x] 4.1 Replace non-empty tool tests with exact expected category assertions for all specialists
- [x] 4.2 Add explicit regression tests for the eight previously mismatched specialists
- [x] 4.3 Add workflow tests proving every CMO-allowed ID resolves to the intended runtime agent
- [x] 4.4 Verify agent API and progress event IDs remain canonical and stable
- [x] 4.5 Run `bun run lint`, `bun run typecheck`, backend tests, frontend tests, and relevant E2E tests
