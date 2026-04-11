# Tasks

## Active

### 🔴 P0 — Critical Security Issues

- [x] **Eliminate `(global as any).jobProgress` state** — Replace the fragile global mutable state used for progress tracking ([diagnostic-workflow.ts:101–108](src/backend/workflows/diagnostic-workflow.ts), [index.ts:27–34](index.ts), [index.ts:100–103](index.ts)) with a proper event-driven mechanism. Use Bun's built-in `WebSocket` support to push progress events to the frontend in real time instead of polling + global map.
  - Create a `ProgressStore` class with typed events (e.g., `EventEmitter` / `EventTarget`)
  - Wire WebSocket upgrade in `Bun.serve()` to subscribe clients to a jobId's progress stream
  - Remove all `(global as any).jobProgress` references
  - Update `WaitingRoom.tsx` to consume WebSocket messages instead of HTTP polling

- [x] **Replace HTTP polling with WebSocket streaming** — The frontend polls `/v1/status/:jobId` every 3 seconds ([usePolling.ts](src/frontend/hooks/usePolling.ts)). This is wasteful and introduces latency. Migrate to a WebSocket-based push model where progress and completion events are streamed in real time.
  - Create a `useJobStream(jobId)` hook that opens a WebSocket connection
  - Server pushes progress, completion, and error events
  - Fall back to polling only if WebSocket fails to connect

- [x] **Add concurrency controls for specialist agent calls** — In `diagnostic-workflow.ts:175–193`, all specialist agents are called via `Promise.all` with no concurrency limit. If the CMO requests many specialists (e.g., 10+), this can overload the LLM provider with simultaneous requests, causing rate-limit errors or timeouts.
  - Implement a `pLimit`-style concurrency limiter (e.g., max 3–5 concurrent specialist calls)
  - Add per-specialist retry with exponential backoff
  - Emit progress updates per-specialist as they complete (not all at once)

- [x] **In-memory job store lacks persistence and resilience** — The `diagnoses` Map in `index.ts:16` is entirely in-memory. Server restarts lose all job state. For now, use `bun:sqlite` to persist jobs and results, which is consistent with the project conventions.
  - Create a `JobStore` abstraction backed by `bun:sqlite`
  - Store job status, progress events, and final results
  - Replace the `diagnoses` Map and the global cleanup interval

---

### 🟠 P1 — Code Quality & Maintainability

- [x] **Extract agent definitions via a factory pattern** — All 36 specialist agent files follow an identical structure: `import Agent` → `import SPECIALIST_MODEL` → `import getToolsForSpecialist` → `new Agent({id, name, model, tools, description, instructions})`. Only `id`, `name`, `description`, and `instructions` differ. This is massive copy-paste boilerplate.
  - Create a `createSpecialistAgent(config: { id, name, description, instructions })` factory that auto-applies the model and tools
  - Reduce each agent file to just the domain-specific config (description + instructions)
  - Consider moving agent configs to a single data file or directory of `.ts` config objects

- [x] **Deduplicate `fetchJSON` helper** — There are 4 separate `fetchJSON` implementations across tool files ([pubmed-search.ts:6](src/backend/tools/pubmed-search.ts), [drug-interaction.ts:6](src/backend/tools/drug-interaction.ts), [open-fda.ts:6](src/backend/tools/open-fda.ts), [clinical-trials.ts:6](src/backend/tools/clinical-trials.ts)), each with slightly different error handling (open-fda handles 404 specially, others throw).
  - Extract a shared `src/backend/tools/utils/fetch.ts` with a single `fetchJSON` that accepts retry/error config
  - Add proper rate-limiting for NCBI APIs (3 req/sec without API key)
  - Add request timeout handling

- [x] **Type-safe tool assignments** — The `getToolsForSpecialist` function in [tools/index.ts](src/backend/tools/index.ts) uses `type AnyTool = any` and multiple hardcoded `Set` lookups of specialist IDs as strings. This is error-prone and can silently fail if agent IDs change.
  - Define a `SpecialistId` union type from the agent registry
  - Replace `AnyTool` with proper Mastra tool types
  - Consider a declarative config map (e.g., `Record<SpecialistId, ToolCategory[]>`) instead of imperative `if` chains

- [x] **The CMO agent has no tools** — The `chiefMedicalOfficer` agent ([chief-medical-officer.ts](src/backend/agents/chief-medical-officer.ts)) has no `tools` assigned, unlike all specialist agents. While it delegates rather than researching directly, it might benefit from tools for verifying specialist availability or accessing evidence.

- [x] **`ConsultNotes` renders raw JSON** — The "Full Report" tab ([ConsultNotes.tsx](src/frontend/components/diagnosis/ConsultNotes.tsx)) just does `JSON.stringify(report, null, 2)`. This should render a properly formatted, human-readable clinical report with markdown sections, not a raw JSON dump.

- [ ] **Separate route handlers from `index.ts`** — The server entry point `index.ts` mixes server setup, job management, cleanup logic, WebSocket handlers, and route handlers in a single file. The `src/backend/api/` directory exists but is empty.
  - Extract route handlers into `src/backend/api/routes.ts`
  - Extract WebSocket handler into `src/backend/api/websocket.ts`
  - Keep `index.ts` as a thin orchestrator that wires everything together

---

### 🟡 P2 — Security & Robustness

- [x] **Add PII detection/scrubbing before LLM submission** — The frontend shows a PII warning modal ([InputDashboard.tsx:286–322](src/frontend/pages/InputDashboard.tsx)), but there is zero server-side PII detection. Patient identifiers could be sent to external LLM providers.
  - Implement a lightweight PII detection layer (regex for SSN, MRN, DOB patterns, names from common patterns)
  - Warn or reject submissions with detected PII
  - Log PII detection events (without the PII itself) for audit

- [ ] **Add rate limiting to API endpoints** — No rate limiting exists on `/v1/diagnose`. A single user can submit unlimited diagnosis jobs, each of which triggers expensive multi-agent LLM workflows.
  - Add per-IP rate limiting (e.g., 5 diagnoses per hour)
  - Add global concurrency limiting (e.g., max 3 concurrent workflows)
  - Return 429 with `Retry-After` header

- [ ] **Add request/response logging and audit trail** — No logging exists beyond `console.log("ddx.care API server running on port 3000")`. For a medical decision-support tool, an audit trail is critical.
  - Log all API requests (method, path, status code, latency)
  - Log workflow start/completion/failure events with timing
  - Log specialist consultations performed and their durations
  - Ensure no PHI is logged

- [ ] **Consolidate config into `config.ts`** — Server port is in `index.ts`, model names in `config.ts`, and the log message hardcodes "port 3000". Move `PORT` and `JOB_TTL_MS` into `config.ts` alongside existing env vars.

- [ ] **Add input size validation** — No limits on the size of `medicalHistory`, `conversationTranscript`, or `labResults`. Extremely large inputs could exceed LLM context windows or cause memory issues.
  - Add `z.string().max(50000)` or similar constraints on the Zod schema
  - Add total payload size middleware

---

### 🟢 P3 — Frontend UX Improvements

- [ ] **Generic, forgettable design** — The UI uses generic Inter font and basic blue color scheme with minimal creative expression. No distinctive visual identity.
  - Consider a medical-themed aesthetic: clean, professional, with subtle clinical design elements
  - Use distinctive typography pairing (e.g., display font for headings)
  - Add meaningful micro-interactions and animations
  - Create visual hierarchy with proper use of whitespace

- [ ] **Implement real-time specialist status in WaitingRoom** — The `AgentGrid` marks all agents as `active` ([AgentGrid.tsx:17](src/frontend/components/agents/AgentGrid.tsx)) regardless of whether they're actually being consulted. Use WebSocket progress events to show which specialists are:
  - `idle` — not yet consulted
  - `active` — currently being consulted
  - `completed` — finished their analysis

- [ ] **Add error retry and cancellation to WaitingRoom** — There's no way to cancel a running diagnosis or retry a failed one from the waiting room. The user must go back and re-submit.
  - Add a "Cancel" button that stops polling and returns to input
  - Add a "Retry" button on failure
  - Optionally: add a server-side cancellation endpoint

- [ ] **Improve the "Full Report" tab** — Currently dumps JSON. Render it as a proper formatted report:
  - Specialists consulted as a summary list
  - Each diagnosis with collapsible detail sections
  - Cross-specialty observations in a callout
  - Recommended immediate actions with urgency highlighting
  - Export as PDF functionality

- [ ] **Add form validation and UX polish to InputDashboard** — The form lacks inline validation. Users get a generic error on failure. Add:
  - Character counts on textareas showing proximity to limits
  - Inline validation messages for required fields
  - A "Clear All" button
  - Persist draft data to `sessionStorage` so accidental refreshes don't lose work

- [ ] **Add a client-side router** — Currently uses `useState<Screen>` in `main.tsx` for navigation. This breaks browser back/forward and doesn't support deep-linking to results.
  - Use `history.pushState` / `popstate` for basic routing
  - Enable direct links to `/results/:jobId`

---

### 🔵 P4 — Testing & DevEx

- [ ] **Add unit tests for workflow steps** — The `diagnostic-workflow.ts` step functions (`parseInput`, `runDiagnosis`, `formatReport`) are not unit tested. The existing `api.test.ts` does E2E testing only (requires a running server + LLM).
  - Test `parseInput` with various input formats
  - Test `formatReport` with mock diagnosis data
  - Test `splitToList` edge cases (already a pure function)
  - Mock `mastra.getAgent()` to test `runDiagnosis` logic without LLM calls

- [ ] **Add frontend component tests** — Zero frontend tests exist. Add tests for:
  - `DiagnosisCard` rendering with various urgency/confidence values
  - `useAutoLogout` timer behavior
  - `useJobStream` with mocked WebSocket messages
  - `FileDropZone` file handling

- [ ] **Fix the `scripts/` directory — it's empty** — Remove or populate with useful dev scripts (e.g., seed data generation, mock server, lint, format).

- [ ] **Eliminate remaining `any` casts** — `tsconfig.json` has `strict: true` but several files use `any`:
  - `progress-store.ts:48` — `stmt.get() as any` should use a typed `JobRow` interface
  - `index.ts:67` — `(req: any)` on the status GET handler; use Bun's typed route params
  - `index.ts:136,142` — `(ws as any).unsubscribe`; use `Bun.serve<WsData>` generic to type `ws.data`
  - `diagnostic-workflow.ts:166` — `as CmoDecision` bypasses the Zod schema type
  - `tools/index.ts:25` — `type AnyTool = any`
  - Tool implementations: numerous `(t: any)`, `(a: any)` callbacks in pubmed/open-fda/clinical-trials

- [ ] **Add a `.env.example` file** — The project uses env vars (`SPECIALIST_MODEL`, `ORCHESTRATOR_MODEL`, `MAX_DIAGNOSIS_ROUNDS`, `PORT`) but has no `.env.example` documenting them. The `.env` file is only 69 bytes and likely contains a single API key.

- [ ] **No linting/typecheck scripts** — `package.json` has no `lint` or `typecheck` scripts.
  - Add `bunx tsc --noEmit` for type checking
  - Add `bunx eslint` or `bunx @biomejs/biome check` for linting
  - Add pre-commit hooks to run these checks

- [ ] **Outdated README** — Current README is minimal and doesn't explain system architecture, usage, or setup requirements.

---

### 🟣 P5 — Performance & Efficiency

- [ ] **Eliminate unnecessary DB reads in progress-store** — `emitMessage()`, `complete()`, and `fail()` all call `getJob()` (full row read + JSON parse) before writing. For `complete()` and `fail()` the read is entirely unnecessary. For `emitMessage()`, the progress array can be appended directly via SQL string manipulation (`progress = progress || ?`) instead of read-modify-write.
  - `complete()` and `fail()`: remove the `getJob()` guard, just run the UPDATE
  - `emitMessage()`: use `UPDATE jobs SET progress = progress || ? WHERE id = ?` to append a JSON event without reading first
  - Pre-prepare all SQL statements in the constructor for hot-path performance

- [ ] **Parallelize PubMed esummary and efetch calls** — In [pubmed-search.ts:50–72](src/backend/tools/pubmed-search.ts), the esummary and efetch HTTP requests are independent and run sequentially. They should use `Promise.all` to cut latency ~50% per search.

- [ ] **Remove unused `ServerWebSocket` import in progress-store** — [progress-store.ts:1](src/backend/progress-store.ts) imports `ServerWebSocket` from `bun` but never uses it.

---

### 🟤 P6 — Mastra-Specific

- [ ] **Verify model string format** — Using `google/gemini-3.1-pro-preview` but Mastra docs suggest format is `"provider/model-name"`. Verify this is correct for current version.
  - Run `node .agents/skills/mastra/scripts/provider-registry.mjs --provider google` to verify available models
  - Update model strings if needed

- [ ] **Agent registry could use Mastra's built-in features** — Consider if Mastra's agent registration patterns could simplify agent setup.

---

## Waiting On

## Someday

- [ ] **Add database persistence for diagnosis history** — Allow users to review past diagnoses, compare results over time, and export case data. Use `bun:sqlite` for MVP, migrate to Postgres (`Bun.sql`) later.
- [ ] **Add authentication and user accounts** — Required before any multi-user deployment. Use session-based auth with secure cookies.
- [ ] **Implement SSE or streaming for LLM responses** — Stream specialist agent responses as they generate, rather than waiting for the complete response. This would give the user real-time visibility into the analysis.
- [ ] **Add a "second opinion" feature** — Allow re-running the diagnosis with a different model or different specialist selection to compare results.
- [ ] **HIPAA compliance audit** — The header shows "HIPAA Mode" ([Header.tsx:21–22](src/frontend/components/layout/Header.tsx)) but there's no actual HIPAA compliance. This label is misleading and should be removed or backed by real compliance measures.
- [ ] **Implement agent-to-agent communication** — Currently specialists don't communicate with each other; they each analyze the case independently. Allow specialists to build on each other's findings within a round.

## Done
