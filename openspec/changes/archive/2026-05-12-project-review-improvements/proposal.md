## Why

A comprehensive codebase review identified reliability bugs, security gaps, agent orchestration weaknesses, and frontend UX deficiencies that undermine the diagnostic system's correctness and user experience. P0-level race conditions can corrupt job state or bypass concurrency limits; a security gap allows unbounded request body reading; agent quality issues prevent the CMO from correctly identifying specialists; and the frontend lacks progress feedback and markdown rendering. Fixing these items hardens the system for production use.

## What Changes

- **Workflow Safety (§1a, §1b, §1c)**: Distinguish user cancellation from timeout in workflow error handling. Guard against double-releasing the concurrency slot. Prevent `progressStore.complete()` from overwriting a `failed` (cancelled) job.
- **Body Size Enforcement (§2b)**: Enforce `maxRequestBodySize` at the Bun HTTP server level so spoofed `Content-Length` headers cannot bypass the payload limit.
- **Agent Orchestration Fixes (§4a, §4b, §4c)**: Deduplicate specialist requests within a single round. Inject available specialist IDs into the CMO prompt as an enum constraint. Change `SPECIALIST_CONTEXT_MODE` default from `none` to `prior_rounds`.
- **Specialist Tool Tiers (§3a, §3b)**: Assign tools per specialist by category (universal, prescribing, rare disease, toxicology, trials) instead of giving all 17 tools to every agent. Reduce the CMO's tool set to a minimal orchestration-only set. **BREAKING**: Modifies the `tool-use-progress` spec requirement that "all 17 tools are available to all 36 specialists and the CMO."
- **Frontend UX Improvements (§5a, §5b)**: Add a progress bar with step indicators on the WaitingRoom. Render markdown in `crossSpecialtyObservations` and `recommendedImmediateActions` fields using `marked` + `DOMPurify`.
- **DevOps Improvements (§7a, §7b, §7c, §7d)**: Pin the Bun version in the Dockerfile. Add volume declarations for persistent SQLite databases. Add a `docker-compose.yml`. Add CI dependency caching for `bun install`.

## Capabilities

### New Capabilities

- `workflow-safety`: Guard concurrency slot release against double-decrement. Prevent `complete()` from overwriting `failed` job status. Distinguish cancellation from timeout in abort error handling.
- `body-size-enforcement`: Enforce a hard byte limit on request bodies at the HTTP server level using Bun's `maxRequestBodySize`.
- `agent-orchestration-fixes`: Deduplicate specialist IDs within a CMO round. Inject the actual specialist ID list into the CMO prompt as a constrained enum. Default `SPECIALIST_CONTEXT_MODE` to `prior_rounds`.
- `frontend-ux-improvements`: Phase-based progress indicator on the WaitingRoom page. Markdown-to-HTML rendering for text fields that contain markdown in the ResultsView.
- `devops-improvements`: Pinned Bun version in Dockerfile, SQLite volume declarations, `docker-compose.yml`, and CI `node_modules` caching.

### Modified Capabilities

- `tool-use-progress`: Replace the requirement "all 17 tools are available to all 36 specialists and the CMO" with per-specialist tool tiers (universal, prescribing, rare disease, toxicology, trials, lab/phenotype) and a minimal CMO tool set (only `drug-interaction` and `medlineplus-search`).

## Impact

- **Backend**: `src/backend/workflows/diagnostic-workflow.ts`, `src/backend/agents/factory.ts`, `src/backend/agents/chief-medical-officer.ts`, `src/backend/api/routes.ts`, `src/backend/progress-store.ts`, `src/backend/tools/index.ts`, `src/backend/config.ts`, `index.ts`
- **Frontend**: `src/frontend/pages/WaitingRoom.tsx`, `src/frontend/pages/ResultsView.tsx`, `src/frontend/components/`
- **Infrastructure**: `Dockerfile`, `docker-compose.yml` (new), `.github/workflows/` CI config
- **Specs**: `tool-use-progress` delta required
