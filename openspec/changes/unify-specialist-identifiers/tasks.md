## 1. Canonical Manifest

- [ ] 1.1 Create a dependency-neutral specialist manifest with canonical camelCase IDs
- [ ] 1.2 Export `SpecialistId` and specialist metadata from the manifest
- [ ] 1.3 Type the registered-agent record and tool assignment map as exhaustive `SpecialistId` records

## 2. Agent and Tool Alignment

- [ ] 2.1 Update the eight kebab-case runtime agent IDs to canonical camelCase values
- [ ] 2.2 Type specialist factory configuration so only canonical IDs are accepted
- [ ] 2.3 Build CMO allowed IDs and agent-list API metadata from the canonical manifest
- [ ] 2.4 Remove silent fallback tool assignment from registered-agent construction

## 3. Runtime Invariants

- [ ] 3.1 Add startup validation for manifest, registry, runtime ID, and assignment key equality
- [ ] 3.2 Fail startup with a precise non-sensitive error for missing, duplicate, or orphaned IDs
- [ ] 3.3 Add a startup log containing only the validated specialist count

## 4. Verification

- [ ] 4.1 Replace non-empty tool tests with exact expected category assertions for all specialists
- [ ] 4.2 Add explicit regression tests for the eight previously mismatched specialists
- [ ] 4.3 Add workflow tests proving every CMO-allowed ID resolves to the intended runtime agent
- [ ] 4.4 Verify agent API and progress event IDs remain canonical and stable
- [ ] 4.5 Run `bun run lint`, `bun run typecheck`, backend tests, frontend tests, and relevant E2E tests
