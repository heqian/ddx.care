## Why

`bun audit` reports 51 advisories: 1 critical, 14 high, 30 moderate, and 6 low. Several are development-only, but high-severity runtime transitive paths exist through `@mastra/core` (e.g., `ws`, `undici`, `fast-uri`, `hono`, `shell-quote`), `isomorphic-dompurify` (`dompurify`, `undici`), and the `mastra` CLI (`brace-expansion`, `js-yaml`, `shell-quote`). Direct patch upgrades are available for `@mastra/core` (1.50.1 → 1.55.0) and `isomorphic-dompurify` (3.18.0 → 3.21.0). There is no CI gate preventing merge of new vulnerable dependencies, and no documented triage of which advisories are reachable in this project's runtime path.

## What Changes

- **Patch direct dependencies**: upgrade `@mastra/core` and `isomorphic-dompurify` to versions that resolve reachable high-severity transitives, after verifying compatibility.
- **Audit gate in CI**: CI SHALL run `bun audit` and SHALL fail on new critical or high advisories, with an allowlist for documented, time-bound exceptions.
- **Reachability triage**: document which advisories are reachable in the project's runtime path (server + browser bundle) versus dev-only, and record accepted exceptions with rationale and expiry.
- **Regular review**: add a scheduled workflow that runs `bun audit` and `bun outdated` weekly and opens an issue on new advisories.

## Capabilities

### New Capabilities

- `dependency-advisory-resolution`: Resolves reachable dependency vulnerabilities by patching direct dependencies, adds a CI audit gate with an allowlist, and records a reachability triage with time-bound exceptions.

### Modified Capabilities

- `devops-improvements`: CI SHALL run `bun audit` and fail on new critical/high advisories; a scheduled workflow SHALL review advisories weekly.

## Impact

- **Dependencies**: `package.json`/`bun.lock` (`@mastra/core`, `isomorphic-dompurify` upgrades).
- **CI**: `.github/workflows/ci.yml` (audit job), new scheduled workflow.
- **Documentation**: `AGENTS.md` (dependency hygiene, exception allowlist).
- **Tests**: compatibility verification after upgrades.