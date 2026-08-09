## Context

`bun audit` reports 51 advisories (1 critical, 14 high, 30 moderate, 6 low). High-severity runtime transitive paths include `@mastra/core` → `ws`, `undici`, `fast-uri`, `hono`, `shell-quote`; `isomorphic-dompurify` → `dompurify`, `undici`; `mastra` CLI → `brace-expansion`, `js-yaml`, `shell-quote`. `bun outdated` shows `@mastra/core` 1.50.1 → 1.55.0 and `isomorphic-dompurify` 3.18.0 → 3.21.0 as available patches. No CI audit gate exists; no reachability triage is recorded.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Patch reachable high-severity runtime advisories.
- Add a CI audit gate with an allowlist.
- Document a reachability triage.
- Add a weekly scheduled review.

**Non-Goals:**
- Upgrading to breaking major versions (e.g., `marked` 17 → 18, `typescript` 5 → 7) without compatibility work.
- Eliminating all dev-only advisories (lower priority; the gate focuses on runtime critical/high).
- Replacing `@mastra/core` with another framework.

## Decisions

### D1: Patch direct dependencies within compatible ranges

**Decision:** Upgrade `@mastra/core` to the latest 1.x that resolves reachable transitives and `isomorphic-dompurify` to 3.21.0. Run the full test suite and E2E to verify compatibility. Avoid jumping to a new major unless tests pass.

**Rationale:** Patch upgrades within the declared `^` range are the lowest-risk way to pull in transitive fixes. `bun outdated` confirms patches are available.

**Alternatives considered:**
- `bun update --latest` — pulls breaking majors; requires per-package compatibility work; defer.
- Manual transitive overrides via `overrides`/`resolutions` — fragile; patching the direct dependency is cleaner when available.

### D2: CI audit job with allowlist

**Decision:** Add a CI job running `bun audit` with a parser that fails on critical/high not in an allowlist file (e.g., `.audit-allowlist.json`: `{ "GHSA-xxx": { "reason": "...", "expires": "2026-12-01" } }`). Expired entries fail.

**Rationale:** A hard fail on all advisories blocks progress on unrelated work; an allowlist with expiry forces conscious acceptance and review.

### D3: Reachability triage document

**Decision:** Add a `docs/dependency-audit-triage.md` recording, per advisory: ID, severity, package, path, reachability (server-runtime / browser-bundle / dev-only / not-applicable), and action (patched / accepted / dev-only). Maintain it as advisories change.

**Rationale:** Distinguishing `shell-quote` (dev-only via `mastra` CLI, not in the server or browser bundle) from `ws` (runtime via `@mastra/core`) focuses effort.

### D4: Scheduled weekly workflow

**Decision:** Add a `.github/workflows/audit.yml` on `schedule: cron: '0 6 * * 1'` running `bun audit` and `bun outdated`, opening an issue on new findings.

**Rationale:** Catches advisories introduced between PRs and surfaces outdated dependencies for review.

## Risks / Trade-offs

- **[Patch upgrades may change behavior]** → `@mastra/core` 1.55.0 could alter agent/workflow APIs. **Mitigation:** Run the full suite and E2E; the Mastra skill's embedded-docs check verifies API usage against the installed version.
- **[Allowlist can accumulate stale entries]** → Expired exceptions could be ignored. **Mitigation:** Expired entries fail CI, forcing renewal or patching.
- **[Dev-only advisories remain]** → The gate focuses on runtime critical/high; moderate dev-only advisories may persist. **Mitigation:** The weekly workflow surfaces them; dev-only advisories do not reach end users.

## Migration Plan

1. Upgrade `@mastra/core` and `isomorphic-dompurify`; run tests.
2. Add the audit CI job and allowlist; add the triage document.
3. Add the scheduled workflow.
4. Rollback: revert the upgrades (advisories return but CI still runs).

## Open Questions

- Should the audit gate also fail on moderate runtime advisories, or only critical/high? (Leaning: critical/high for the gate; moderate is reported weekly.)
- Should `bun audit --prod` be used to focus on runtime dependencies? (Leaning: yes for the gate; a separate dev audit runs weekly.)