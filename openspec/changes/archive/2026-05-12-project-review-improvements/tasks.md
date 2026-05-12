## 1. Workflow Safety

- [x] 1.1 Guard `finishWorkflow()` against double-decrement: add a `releasedJobIds` Set to `RateLimiter`, check membership on entry, add on first release, clear in `prune()`
- [x] 1.2 Guard `progressStore.complete()` against overwriting `failed`: read current row status before UPDATE, skip with warning if status is `"failed"`
- [x] 1.3 Distinguish cancellation from timeout in workflow abort handler: inspect `abortController.signal.reason` in the catch block, throw distinct error messages for user cancellation vs timeout
- [x] 1.4 Update existing tests for rate-limiter and progress-store to cover double-release and complete-after-fail scenarios
- [x] 1.5 Run `bun run lint` and `bun run test` to verify changes

## 2. Body Size Enforcement

- [x] 2.1 Add `maxRequestBodySize: MAX_PAYLOAD_BYTES` to the `Bun.serve()` options in `index.ts`
- [x] 2.2 Verify existing payload size tests pass and add a test for oversized request rejection (413)
- [x] 2.3 Run `bun run lint` and `bun run test` to verify changes

## 3. Agent Orchestration Fixes

- [x] 3.1 Deduplicate specialist requests within a round: filter `newSpecialistRequests` by unique `id` before dispatching concurrent calls
- [x] 3.2 Build available specialist ID list at workflow init from `Object.keys(specialists)` and inject into CMO system prompt or instructions
- [x] 3.3 Add Zod `enum()` constraint on `id` field in CMO structured output schema using actual registered specialist IDs
- [x] 3.4 Change `SPECIALIST_CONTEXT_MODE` default from `"none"` to `"prior_rounds"` in `src/backend/config.ts`
- [x] 3.5 Update workflow tests to verify deduplication behavior and CMO ID constraint
- [x] 3.6 Run `bun run lint` and `bun run test` to verify changes

## 4. Per-Specialist Tool Tiers

- [x] 4.1 Define tool categories (universal, prescribing, rareDisease, toxicology, trials, labPhenotype) and mapping in `src/backend/tools/index.ts`
- [x] 4.2 Assign tool categories per specialist using the existing `toolAssignments` pattern for `getToolsForSpecialist()`
- [x] 4.3 Update `factory.ts` to call `getToolsForSpecialist(id)` instead of `getAllTools()`
- [x] 4.4 Reduce CMO tool set to only `drug-interaction` and `medlineplus-search` in `chief-medical-officer.ts`
- [x] 4.5 Update tool-related tests to verify per-specialist tool assignments
- [x] 4.6 Run `bun run lint` and `bun run test` to verify changes

## 5. Frontend UX Improvements

- [x] 5.1 Add phase-based progress step indicator component: derive current phase from progress event types (round_start, specialist_start/complete, cmo_final), render as horizontal step list with completed/current/pending states
- [x] 5.2 Show specialist consultation count during "Consulting Specialists" phase (X/Y consulted)
- [x] 5.3 Integrate progress phase indicator into `WaitingRoom.tsx`
- [x] 5.4 Render `crossSpecialtyObservations` and `recommendedImmediateActions` through `marked` + `DOMPurify` in `ResultsView.tsx` (use existing pattern from `ConsultNotes`)
- [x] 5.5 Run `bun run lint` and `bun run test:frontend` to verify changes

## 6. DevOps Improvements

- [x] 6.1 Pin Bun version in `Dockerfile` from `oven/bun:latest` to `oven/bun:1.3.13`
- [x] 6.2 Create `docker-compose.yml` with ddx.care service, port mapping, environment variables, and named volumes for SQLite databases
- [x] 6.3 Add `actions/cache@v5` step to CI workflow for `node_modules` with key on `bun.lock` hash; apply to all jobs (lint, typecheck, test, frontend-test, build, e2e)
- [x] 6.4 Verify Dockerfile builds successfully with `docker build .`
- [x] 6.5 Run `bun run lint` to verify no config issues
