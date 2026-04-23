# ddx.care — AI-Powered Differential Diagnosis System

Uses AI agents (via Mastra) to simulate a panel of medical specialists analyzing patient cases. 36 specialist agents consult on cases, orchestrated by a Chief Medical Officer (CMO) agent that synthesizes findings into a ranked differential diagnosis.

## Runtime & Tooling

Default to using Bun instead of Node.js. You should NEVER use Python or any Python-based tools (including for testing or scripting). Always use Bun tools.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads `.env`, so don't use `dotenv`.
- **Always run the linter (`bun run lint`) after making any code changes.**

## Scripts

- `bun run dev` — Start dev server with HMR on port 3000 (or `PORT` env var). Uses `bun --hot index.ts`.
- `bun run build` — Bundle frontend to `./dist` via `bun build ./index.html --outdir ./dist`
- `bun run typecheck` — Run TypeScript type checking (`tsc --noEmit`)
- `bun run lint` — Run Biome linter on `src/`
- `bun run test` — Run backend unit tests (api, tools, api-integration, workflow, progress-store, rate-limiter, logger, fetch-utils)
- `bun run test:frontend` — Run frontend component/hook tests (`tests/frontend.test.tsx`)
- `bun run test:e2e` — Run Playwright E2E tests (`bunx playwright test`)
- `bun run test:all` — Run unit + frontend + E2E tests
- `bun run test:integration` — Run integration tests against live APIs (`RUN_INTEGRATION=1`)

## Bun APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile.
- Bun.$`ls` instead of execa.

## Linting

- **Biome** (`@biomejs/biome`) — configured in `biome.json`
- Rules: `noExplicitAny` (error), `noUnusedVariables` (error), `useConst` (error)
- `noExplicitAny` is relaxed to `off` for test files (`tests/**/*.ts`, `tests/**/*.tsx`)
- CSS parser: Tailwind directives enabled, CSS modules enabled
- Formatter: 2-space indent, double quotes for JS/TS
- Run: `bun run lint` (checks `src/` only)

## Architecture

### Backend (`src/backend/`)

- **Mastra framework** (`@mastra/core`) — agent orchestration, workflows, tool definitions
- **AI Model**: OpenCode Go (default: `opencode-go/qwen3.6-plus`), configured via `OPENCODE_API_KEY`. Model string uses `provider/model-name` format as required by Mastra.
- **Mastra instance** (`src/backend/index.ts`) — Registers all agents (CMO + 36 specialists) and the `diagnosticWorkflow` into a single `Mastra` instance.

#### Agents (`src/backend/agents/`)

36 specialist agents + 1 Chief Medical Officer (CMO), organized by category:

- **Primary Care**: generalist, pediatrician, geriatrician
- **Internal Medicine**: cardiologist, dermatologist, endocrinologist, gastroenterologist, hematologist, infectiologist, nephrologist, neurologist, oncologist, pulmonologist, rheumatologist
- **Surgical**: generalSurgeon, cardiothoracicSurgeon, neurosurgeon, orthopedist, otolaryngologist, urologist, vascularSurgeon
- **Diagnostic & Support**: pathologist, radiologist, geneticist
- **Reproductive**: obstetricianGynecologist, andrologist, maternalFetalMedicine
- **Mental Health**: psychiatrist
- **Critical Care & Emergency**: intensivist, toxicologist
- **Other**: allergistImmunologist, ophthalmologist, emergencyPhysician, sportsMedicinePhysician, podiatrist

Key files:
- `factory.ts` — `createSpecialistAgent()` factory function. Accepts `SpecialistConfig`, assigns model and tools per specialist.
- `index.ts` — Exports `specialists` record (all 36), `SpecialistId` type, and `agentList` (metadata for `/v1/agents`).
- `chief-medical-officer.ts` — CMO agent (`chiefMedicalOfficer`) with supervisor instructions for multi-round orchestration.

#### Tools (`src/backend/tools/`)

Medical API integrations, assigned per-specialist via `getToolsForSpecialist()` in `tools/index.ts`:

- **PubMed/NCBI** (`pubmed-search.ts`): `pubmedSearchTool`, `relatedArticlesTool`, `omimSearchTool`, `geneReviewsSearchTool`, `clinVarSearchTool`
- **RxNav drug interactions** (`drug-interaction.ts`): `drugLookupTool`, `drugInteractionTool`, `drugSpellingTool`
- **OpenFDA** (`open-fda.ts`): `adverseEventsTool`, `drugLabelingTool`, `drugRecallTool`, `substanceToxicologyTool`
- **ClinicalTrials.gov** (`clinical-trials.ts`): `clinicalTrialsSearchTool`
- **MedlinePlus** (`medlineplus.ts`): `medlinePlusSearchTool`

Tool categories (universal, prescribing, genetics, oncology, toxicology, education, trials, spelling) are composed declaratively per specialist in `toolAssignments`.

Shared utilities:
- `tools/utils/fetch.ts` — `fetchJSON()` with timeout, abort controller, NCBI rate limiting (~3 req/s), and 404 handling.

#### Workflows (`src/backend/workflows/`)

- `diagnostic-workflow.ts` — Two-step Mastra workflow: `runDiagnosis` → `formatReport`
  - **runDiagnosis**: Multi-round CMO supervisor loop. The CMO decides which specialists to consult per round, delegates via `limitConcurrency` (max 3 concurrent), and uses `withRetry` (3 attempts, exponential backoff). Continues up to `MAX_DIAGNOSIS_ROUNDS` (default 3) or until the CMO declares `isFinal`. Timeout: 900s (15 min). Supports agent-to-agent context sharing via `SPECIALIST_CONTEXT_MODE` — the CMO can provide per-specialist "context directives" so specialists see prior consultation findings.
  - **formatReport**: Transforms raw diagnosis into frontend-friendly format with ranked diagnoses, urgency levels, evidence arrays, and a disclaimer.
- Exports `reportSchema` (Zod schema for the formatted report) and `diagnosticWorkflow`.
- **Mock mode**: When `MOCK_LLM=1`, `runDiagnosis` returns a canned response without calling real LLMs.
- Utility exports: `limitConcurrency`, `withRetry`, `splitToList` (also used in tests).

#### Utilities (`src/backend/utils/`)

- `rate-limiter.ts` — `RateLimiter` class: per-IP sliding window rate limiting + global concurrent workflow cap. In-memory (resets on restart, logs a warning on first request post-restart). Configurable via `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`, `MAX_CONCURRENT_WORKFLOWS`.
- `logger.ts` — Structured logger with `info`, `warn`, `error`, `request`, `workflowStart`, `workflowComplete`, `workflowFail`, `specialistCall` methods. Supports `LOG_FORMAT=json` env var for JSON-line output (for log aggregation). Default: human-readable text.

#### Progress Store (`src/backend/progress-store.ts`)

- `JobStore` class (extends `EventTarget`) — SQLite-backed (`bun:sqlite`) job persistence.
- Stores job status (`pending` | `completed` | `failed`), progress events (JSON array), and results.
- Pub/sub via `CustomEvent` dispatch for real-time WebSocket updates.
- TTL-based cleanup: `cleanupExpired()` called every 5 minutes, removes jobs older than 30 minutes.
- Singleton exported as `progressStore`.

#### Configuration (`src/backend/config.ts`)

All constants centralized here, read from environment variables with defaults:
- `PORT` (3000), `ALLOWED_ORIGINS` (`*`), `JOB_TTL_MS` (30min), `CLEANUP_INTERVAL_MS` (5min), `RATE_LIMIT_PRUNE_INTERVAL_MS` (10min)
- `SPECIALIST_MODEL`, `ORCHESTRATOR_MODEL` (both `opencode-go/qwen3.6-plus`)
- `DIAGNOSIS_TIMEOUT_MS` (900s / 15 min), `MAX_DIAGNOSIS_ROUNDS` (3)
- `RATE_LIMIT_MAX_REQUESTS` (5), `RATE_LIMIT_WINDOW_MS` (60s / 1 min), `MAX_CONCURRENT_WORKFLOWS` (3)
- `MAX_INPUT_FIELD_LENGTH` (50,000 chars), `MAX_PAYLOAD_BYTES` (1MB)
- `MOCK_LLM`, `LOG_FORMAT`, `SPECIALIST_CONTEXT_MODE`, `SPECIALIST_CONTEXT_MAX_CHARS`, `CMO_CONTEXT_MAX_CHARS`

### Frontend (`src/frontend/`)

- **React 19** with **Tailwind CSS v4** (via `bun-plugin-tailwind`)
- Entry: `src/frontend/main.tsx` (loaded via `<script type="module">` in `index.html`)
- Google Fonts: DM Serif Display
- Built by Bun's bundler via HTML imports — no Vite.

#### Pages (`src/frontend/pages/`)

1. **InputDashboard** — Case submission form with three text areas (medical history, conversation transcript, lab results). Includes speech-to-text input (Web Speech API with typed `SpeechRecognition` interfaces in `types/speech.d.ts`), file drop zones for uploading text files, and agent grid showing available specialists.
2. **WaitingRoom** — Real-time progress display during diagnosis. Shows agent status cards with progress events streamed via WebSocket. Displays a warning banner if agent list fails to load.
3. **ResultsView** — Diagnosis report with ranked diagnoses, confidence badges, urgency badges, specialist consult notes, and print/export functionality.

#### Components (`src/frontend/components/`)

- **agents/**: `AgentGrid`, `AgentIcon`, `AgentStatusCard`
- **diagnosis/**: `ConfidenceBadge`, `ConsultNotes` (with print/export, CSP-hardened print window), `DiagnosisCard`, `UrgencyBadge`
- **layout/**: `AppShell`, `Footer`, `Header` (with "Differential Diagnosis" label)
- **ui/**: `Badge`, `Button`, `Card`, `FileDropZone`, `Modal`, `Spinner`

#### Hooks (`src/frontend/hooks/`)

- `useJobStream` — WebSocket connection with exponential backoff reconnection (3 attempts: 1s → 2s → 4s) before HTTP polling fallback
- `usePolling` — Interval-based status polling
- `useAutoLogout` — Inactivity timeout
- `useRouter` — Simple hash-based client-side routing

#### Other Frontend Files

- `context/ThemeContext.tsx` — Light/dark mode toggle
- `api/client.ts` — API client functions (`submitDiagnosis`, `getJobStatus`, `getAgents`)
- `api/types.ts` — Shared TypeScript types (`DiagnoseRequest`, `StatusResponse`, `WsMessage`, etc.). `DiagnosisReport` type is derived from the backend Zod schema via `z.infer<typeof reportSchema>`.
- `types/speech.d.ts` — Ambient type declarations for `SpeechRecognition`, `SpeechRecognitionEvent`, etc.

### Server (`index.ts`)

Entry point. Creates the `Bun.serve()` instance with:

**Routes** (defined in `src/backend/api/routes.ts`):
- `POST /v1/diagnose` — Submit a diagnostic case. Validates input (Zod schema, payload size limit), checks rate limit (per-IP + concurrent workflow cap), starts async workflow, returns `202 Accepted` with `jobId`.
- `GET /v1/status/:jobId` — Poll job status and progress events.
- `GET /v1/health` — Health check endpoint (uptime, active workflows, SQLite connectivity).
- `GET /v1/agents` — List available specialist agents (id, name, description).
- `GET /ws?jobId=...` — WebSocket for real-time progress streaming. Validates `Origin` header against `ALLOWED_ORIGINS`. Replays history on connect, subscribes to live updates.
- `OPTIONS /v1/*` — CORS preflight catch-all.
- `/*` — SPA fallback (serves `index.html`).

**CORS**: Configurable via `ALLOWED_ORIGINS` env var (comma-separated whitelist, default `*`). Applied to all `/v1/*` routes.

**WebSocket** (defined in `src/backend/api/websocket.ts`):
- On open: validates job exists, replays progress history, subscribes to live events.
- On close: unsubscribes from progress store.

**Graceful shutdown**:
- Handles `SIGINT` and `SIGTERM` signals.
- Stops accepting new connections, clears cleanup intervals, waits for in-flight workflows (30s timeout), then exits.

**Background tasks**:
- Job cleanup interval (every 5 minutes, removes jobs older than 30 minutes)
- Rate limiter prune interval (every 10 minutes)

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENCODE_API_KEY` | *required* | OpenCode API key |
| `PORT` | `3000` | Server port |
| `ALLOWED_ORIGINS` | `*` | CORS + WebSocket origin whitelist (comma-separated) |
| `SPECIALIST_MODEL` | `opencode-go/qwen3.6-plus` | Override specialist agent model |
| `ORCHESTRATOR_MODEL` | `opencode-go/qwen3.6-plus` | Override CMO agent model |
| `MAX_DIAGNOSIS_ROUNDS` | `3` | Max CMO consultation rounds |
| `RATE_LIMIT_MAX_REQUESTS` | `5` | Max diagnosis requests per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` (1 min) | Rate limit sliding window |
| `MAX_CONCURRENT_WORKFLOWS` | `3` | Max concurrent diagnostic workflows |
| `MOCK_LLM` | — | Set to `1` for mock mode (testing) |
| `LOG_FORMAT` | — | Set to `json` for JSON-structured log output |
| `SPECIALIST_CONTEXT_MODE` | `none` | Agent-to-agent context sharing: `none`, `prior_rounds`, `cmo_curated`, `full` |
| `SPECIALIST_CONTEXT_MAX_CHARS` | `2000` | Max characters of context injected per specialist call |
| `CMO_CONTEXT_MAX_CHARS` | `60000` | Max characters of context maintained in CMO history |

## Testing

### Unit Tests (`bun run test`)

Backend test files in `tests/`:
- `api.test.ts` — API route handler tests
- `tools.test.ts` — Medical tool execution tests
- `api-integration.test.ts` — API integration tests (live API with `RUN_INTEGRATION=1`)
- `workflow.test.ts` — Diagnostic workflow, `limitConcurrency`, `withRetry`, `splitToList` tests
- `progress-store.test.ts` — `JobStore` CRUD, pub/sub, cleanup tests
- `rate-limiter.test.ts` — Rate limiting, concurrent workflow cap, prune tests
- `logger.test.ts` — Logger output format, JSON mode tests
- `fetch-utils.test.ts` — `fetchJSON` timeout, NCBI rate limiting, error handling tests
- `ws-origin.test.ts` — WebSocket origin validation tests
- `shutdown.test.ts` — Graceful shutdown signal handling tests

### Frontend Tests (`bun run test:frontend`)

- `frontend.test.tsx` — React component and hook tests using `@testing-library/react` + `happy-dom`

### E2E Tests (`bun run test:e2e`)

- `full-flow.spec.ts` — Full diagnostic workflow via Playwright (Chromium)
- Runs on port 3999 with `MOCK_LLM=1` (configured in `playwright.config.ts`)
- Covers: input submission, real-time progress updates, report rendering, print/export

## Key Dependencies

### Runtime
- `@mastra/core` (^1.24.1) — Agent/workflow framework
- `react` / `react-dom` (^19.2.5) — UI
- `zod` (^4.3.6) — Input validation schemas
- `marked` (^17.0.6) — Markdown rendering
- `isomorphic-dompurify` (^3.8.0) — HTML sanitization
- `@heroicons/react` (^2.2.0) — Icon library

### Dev
- `tailwindcss` (^4.2.2) + `bun-plugin-tailwind` (^0.1.2) — Styling
- `@biomejs/biome` (^2.4.11) — Linter
- `mastra` (^1.5.0) — Mastra CLI
- `@playwright/test` (^1.59.1) — E2E testing
- `@testing-library/react` (^16.3.2) + `@testing-library/jest-dom` (^6.9.1) — Component testing
- `happy-dom` (^20.8.9) — DOM environment for tests
- `typescript` (^5.9.3) — Type checking

## Skills (`.agents/skills/`)

10 Claude Code skills installed for this project (see `skills-lock.json`):

| Skill | Source | Description |
|---|---|---|
| `agent-development` | `anthropics/claude-code` | Agent structure, system prompts, triggering conditions, and development best practices |
| `code-review` | `anthropics/knowledge-work-plugins` | Review code for security, performance, correctness. Trigger with a PR URL or "review this" |
| `documentation` | `anthropics/knowledge-work-plugins` | Write/maintain technical docs — READMEs, API docs, runbooks, onboarding guides |
| `frontend-design` | `anthropics/skills` | Create production-grade frontend interfaces with high design quality |
| `mastra` | `mastra-ai/skills` | Mastra framework guide — agents, workflows, tools, documentation lookup strategies |
| `mastra-docs` | `mastra-ai/mastra` | Documentation guidelines for writing/editing Mastra docs |
| `system-design` | `anthropics/knowledge-work-plugins` | Design systems, APIs, data models, service boundaries, and architectures |
| `task-management` | `anthropics/knowledge-work-plugins` | Task tracking via shared `TASKS.md` file |
| `theme-factory` | `anthropics/skills` | Toolkit for styling artifacts with 10 pre-set themes (colors/fonts) |
| `webapp-testing` | `anthropics/skills` | Interact with and test local web apps using Playwright — screenshots, logs, verification |

## Best Practices

### Testing

- Every code change should account for tests. Update or add tests to cover new or modified behavior.
- Run the full test suite (`bun run test:all && bun run test:integration`) after every code change.

### Mastra API Verification

Mastra is a fast-moving framework — never assume API signatures from memory. When working with Mastra APIs:

1. Check embedded docs first: `ls node_modules/@mastra/*/dist/docs/`
2. Fall back to source type definitions if docs are unclear
3. Use remote docs (`https://mastra.ai/llms.txt`) only if packages aren't installed

### Agent Prompt Structure

Specialist agent prompts should follow this structure:

**Role → Responsibilities → Analysis Process → Output Format → Edge Cases**

Keep prompts 1,000–2,000 words with 2–4 concrete examples. Write in second person ("You are a cardiologist specializing in...").

### Code Review Dimensions

Code reviews should cover four axes:

- **Security**: SQL/XSS injection, auth flaws, secrets in code, SSRF
- **Performance**: N+1 queries, memory leaks, unnecessary complexity, missing indexes
- **Correctness**: Edge cases, race conditions, error handling, type safety
- **Maintainability**: Naming clarity, single responsibility, duplication, test coverage

### Frontend Design Philosophy

Avoid generic AI aesthetics — no Inter, Roboto, or purple gradients on white. Instead:

- Choose a bold, cohesive aesthetic direction and commit to it
- Use distinctive typography (pair a display font with a refined body font)
- Define color palettes via CSS variables for consistency
- Prefer CSS-first motion solutions over JS animation libraries
