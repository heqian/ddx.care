## 1. Patch Direct Dependencies

- [ ] 1.1 Upgrade `@mastra/core` to the latest compatible 1.x (e.g., 1.55.0) in `package.json`
- [ ] 1.2 Upgrade `isomorphic-dompurify` to 3.21.0
- [ ] 1.3 Run `bun install` to update `bun.lock`
- [ ] 1.4 Run `bun run test`, `bun run test:frontend`, and E2E to verify compatibility; fix any API changes using the Mastra embedded docs

## 2. CI Audit Gate

- [ ] 2.1 Add a `bun audit` job to `.github/workflows/ci.yml` that fails on critical/high advisories not in an allowlist
- [ ] 2.2 Add a `.audit-allowlist.json` with `{ id, reason, expires }` entries for any accepted exceptions
- [ ] 2.3 Make expired allowlist entries fail CI

## 3. Reachability Triage

- [ ] 3.1 Create `docs/dependency-audit-triage.md` classifying each advisory as server-runtime, browser-bundle, dev-only, or not-applicable, with rationale and action
- [ ] 3.2 Maintain the triage as advisories change

## 4. Scheduled Weekly Workflow

- [ ] 4.1 Add `.github/workflows/audit.yml` on a weekly cron running `bun audit` and `bun outdated`
- [ ] 4.2 Open an issue on new findings

## 5. Documentation and Verification

- [ ] 5.1 Document the audit gate, allowlist, and triage process in `AGENTS.md`
- [ ] 5.2 Run `bun run lint`, `bun run typecheck`, `bun run test`, and `bun audit`