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
- `bun run build` — Bundle frontend to `./dist` via `Bun.build` with the Tailwind plugin
- `bun run typecheck` — Run TypeScript type checking (`tsc --noEmit`)
- `bun run lint` — Run Biome linter on all files
- `bun run test` — Run backend unit tests (api, tools, workflow, progress-store, rate-limiter, logger, fetch-utils)
- `bun run test:frontend` — Run frontend component/hook tests (`tests/frontend.test.tsx`)
- `bun run test:e2e` — Run Playwright E2E tests (`bunx playwright test`)
- `bun run test:all` — Run unit + frontend + E2E tests
- `bun run test:contract` — Run API contract tests against live external APIs (`RUN_CONTRACT=1`); verifies response field shapes haven't drifted from what the tools expect. Skipped by default. Runs in CI (`ci.yml`) on every PR and push.

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
- Run: `bun run lint`

## Architecture

### Backend (`src/backend/`)

- **Mastra framework** (`@mastra/core`) — agent orchestration, workflows, tool definitions
- **AI Model**: Ollama Cloud (default: `ollama-cloud/gemma4:31b`), configured via `OLLAMA_API_KEY`. Other providers are supported — see [Mastra providers](https://mastra.ai/models/providers) for provider-specific API key env var names and supported models. Model string uses `provider/model-name` format as required by Mastra.
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

- **Drug interactions via FDA labels** (`drug-interaction.ts`): `drugLookupTool`, `drugInteractionTool`, `drugSpellingTool`
- **OpenFDA** (`open-fda.ts`): `adverseEventsTool`, `drugLabelingTool`, `drugRecallTool`, `substanceToxicologyTool`
- **ClinicalTrials.gov** (`clinical-trials.ts`): `clinicalTrialsSearchTool`
- **MedlinePlus** (`medlineplus.ts`): `medlinePlusSearchTool`

Tool categories (universal, prescribing, genetics, oncology, toxicology, education, trials, spelling) are composed declaratively per specialist in `toolAssignments`.

Shared utilities:
- `tools/utils/fetch.ts` — `fetchJSON()` with timeout, abort controller, and 404 handling.

#### Workflows (`src/backend/workflows/`)

- `diagnostic-workflow.ts` — Two-step Mastra workflow: `runDiagnosis` → `formatReport`
  - **runDiagnosis**: Multi-round CMO supervisor loop. The CMO decides which specialists to consult per round, delegates via `limitConcurrency` (default: max 1 concurrent), and uses `withRetry` (3 attempts, exponential backoff). Continues up to `MAX_DIAGNOSIS_ROUNDS` (default 3) or until the CMO declares `isFinal`. Timeout: 900s (15 min). Supports agent-to-agent context sharing via `SPECIALIST_CONTEXT_MODE` — the CMO can provide per-specialist "context directives" so specialists see prior consultation findings.
  - **Report generation**: Uses one initial structured generation and one corrected structured generation. Valid output becomes an `available` outcome; exhausted validation, empty-response, or provider failures become `generation_failed` without fabricated medical content. Cancellation and timeout still propagate as workflow failures.
  - **formatReport**: Converts validated raw diagnosis data into the `available` variant with ranked diagnoses, urgency levels, evidence arrays, generation metadata, and a disclaimer. It passes `generation_failed` through unchanged.
- Shared runtime schemas and derived types (`DiagnosisReport`, `ReportOutcome`, error codes) live in `src/shared/report-outcome.ts`.
- **Mock mode**: When `MOCK_LLM=1`, `runDiagnosis` returns a canned response without calling real LLMs.
- Utility exports: `limitConcurrency`, `withRetry`, `splitToList` (also used in tests).

#### Utilities (`src/backend/utils/`)

- `rate-limiter.ts` — `RateLimiter` class: per-IP sliding window rate limiting + global concurrent workflow cap. In-memory (resets on restart, logs a warning on first request post-restart). Configurable via `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`, `MAX_CONCURRENT_WORKFLOWS`. Per-IP recording happens immediately after `check()` succeeds (before body parsing), so malformed requests count against the limit to prevent bypass.
- `logger.ts` — Structured logger with `info`, `warn`, `error`, `request`, `workflowStart`, `workflowComplete`, `workflowFail`, `specialistCall` methods. Supports `LOG_FORMAT=json` env var for JSON-line output (for log aggregation). Default: human-readable text.
- `ws-token.ts` — Durable job capability + short-lived WebSocket ticket primitives using HMAC-SHA256 with `WS_TOKEN_SECRET`:
  - `generateToken(jobId, ttlMs?, now?)` signs `jobId.expiry` where `expiry = now + JOB_TTL_MS` (default). Returns `<expiryMs>.<hmacHex>`. Empty string in dev mode (empty `WS_TOKEN_SECRET`).
  - `verifyToken(jobId, token, now?)` parses `<expiryMs>.<hmacHex>`, rejects expired tokens, and uses a timing-safe comparison. Requires exactly 64 ASCII hex characters before any `Buffer` work to avoid the malformed-Unicode `RangeError`. Returns `true` in dev mode.
  - `generateWsTicket(jobId, ttlSec?, now?)` and `verifyWsTicket(jobId, ticket, now?)` — short-lived (default 120s), stateless, single-use WebSocket upgrade ticket. Same `<expiryMs>.<hmacHex>` format but with an independent, shorter TTL so the two capabilities are not interchangeable.
  When `WS_TOKEN_SECRET` is empty (dev mode), tokens/tickets are not required for WebSocket connections, REST endpoints (`GET /v1/status/:jobId`, `DELETE /v1/diagnose/:jobId`), or the HTTP polling fallback.
- `abort-controller-store.ts` — `Map<string, AbortController>` with exported `set`, `get`, `remove` functions. Stores abort controllers for running workflows, enabling cancellation via `DELETE /v1/diagnose/:jobId`.

#### Tool Cache (`src/backend/tools/utils/tool-cache.ts`)

- SQLite-backed URL→response cache for tool API calls. Avoids redundant HTTP requests when multiple specialists query the same endpoint during a diagnosis.
- `initToolCache()` — Opens DB, creates table, prepares statements. Called on server startup.
- `getCached(url)` — Returns cached response or `null` on miss/expiry. Increments hit/miss counters.
- `setCached(url, response)` — Stores successful HTTP 200 response with timestamp.
- `cleanupExpired()` — Deletes entries older than `TOOL_CACHE_TTL_MS`. Called every 10 minutes.
- `getCacheStats()` — Returns `{ entries, hits, misses }` for health endpoint.
- Cache lookup happens in `fetchJSON` before the HTTP call — a cache hit skips the HTTP call entirely.
- Only HTTP 200 responses are cached. Errors (429, 4xx, 5xx, timeout) and `ignore404` sentinel responses are never cached.
- Set `TOOL_CACHE_TTL_MS=0` to disable caching entirely.

#### Progress Store (`src/backend/progress-store.ts`)

- `JobStore` class (extends `EventTarget`) — SQLite-backed (`bun:sqlite`) job persistence.
- Stores job status (`pending` | `completed` | `failed`), progress events (JSON array), and a schema-validated `ReportOutcome` result for completed jobs. Both `available` and `generation_failed` are completed jobs; cancellation, timeout, and unrecoverable workflow errors are failed jobs.
- Pub/sub via `CustomEvent` dispatch for real-time WebSocket updates.
- TTL-based cleanup: `cleanupExpired()` called every 5 minutes, scrubs (`result`, `progress`, `error`) and removes **terminal** jobs (`completed`, `failed`) older than `JOB_TTL_MS`. Pending jobs are never TTL-deleted; they are governed by `timeoutPending()`.
- `timeoutPending(PENDING_JOB_TIMEOUT_MS)` called every cleanup interval, aborts and fails pending jobs older than the timeout (`failed("Diagnosis timed out")`), releasing capacity via the workflow's `finally`.
- `markStalePending()` called on startup, marks all `pending` jobs as `failed("Server restarted — job interrupted")`. `cleanupExpired(JOB_TTL_MS)` also runs once on startup to remove terminal jobs that expired during downtime.
- Singleton exported as `progressStore`.

#### Configuration (`src/backend/config.ts`)

All constants centralized here, read from environment variables with defaults:
- `PORT` (3000), `ALLOWED_ORIGINS` (`*`), `TRUSTED_ORIGINS` (empty/dev-only), `JOB_TTL_MS` (60min, terminal jobs only), `PENDING_JOB_TIMEOUT_MS` (DIAGNOSIS_TIMEOUT_MS + 120s), `CLEANUP_INTERVAL_MS` (5min), `RATE_LIMIT_PRUNE_INTERVAL_MS` (10min)
- `SPECIALIST_MODEL`, `ORCHESTRATOR_MODEL` (both `ollama-cloud/gemma4:31b`)
- `DIAGNOSIS_TIMEOUT_MS` (900s / 15 min), `MAX_DIAGNOSIS_ROUNDS` (3). `validateConfig()` rejects `JOB_TTL_MS` or `PENDING_JOB_TIMEOUT_MS` below `DIAGNOSIS_TIMEOUT_MS`.
- `RATE_LIMIT_MAX_REQUESTS` (5), `RATE_LIMIT_WINDOW_MS` (60s / 1 min), `MAX_CONCURRENT_WORKFLOWS` (3)
- `MAX_INPUT_FIELD_LENGTH` (50,000 chars), `MAX_PAYLOAD_BYTES` (1MB)
- `MOCK_LLM`, `LOG_FORMAT`, `SPECIALIST_CONTEXT_MODE`, `SPECIALIST_CONTEXT_MAX_CHARS`, `CMO_CONTEXT_MAX_CHARS`
- `WS_TOKEN_SECRET` (empty = dev mode, no token required; set for production — secures WebSocket, REST status/cancel endpoints, and HTTP polling fallback)
- `TOOL_CACHE_TTL_MS` (86400000 / 24h), `TOOL_CACHE_DB_PATH` (`tool-cache.sqlite`), `TOOL_CACHE_CLEANUP_INTERVAL_MS` (10min). Set `TOOL_CACHE_TTL_MS=0` to disable tool API response caching.

### Frontend (`src/frontend/`)

- **React 19** with **Tailwind CSS v4** (via `bun-plugin-tailwind`)
- Entry: `src/frontend/main.tsx` (loaded via `<script type="module">` in `index.html`)
- Google Fonts: DM Serif Display
- Built by Bun's bundler via HTML imports — no Vite.

#### Pages (`src/frontend/pages/`)

1. **InputDashboard** — Case submission form with three text areas (medical history, conversation transcript, lab results). Includes speech-to-text input (Web Speech API with typed `SpeechRecognition` interfaces in `types/speech.d.ts`), file drop zones for uploading text files, and agent grid showing available specialists.
2. **WaitingRoom** — Real-time progress display during diagnosis. Shows agent status cards with progress events streamed via WebSocket. Displays a warning banner if agent list fails to load.
3. **ResultsView** — Branches on `ReportOutcome` before reading report data. `available` renders ranked diagnoses, confidence and urgency badges, consult notes, and print/share controls. `generation_failed` renders only unavailable-report, retry, and professional-evaluation guidance.

#### Components (`src/frontend/components/`)

- **agents/**: `AgentGrid`, `AgentIcon`, `AgentStatusCard`
- **diagnosis/**: `ConfidenceBadge`, `ConsultNotes` (with print/export, CSP-hardened print window), `DiagnosisCard`, `UrgencyBadge`
- **layout/**: `AppShell`, `Footer`, `Header` (with "Differential Diagnosis" label)
- **ui/**: `Button`, `Card`, `FileDropZone`, `Spinner`

#### Hooks (`src/frontend/hooks/`)

- `useJobStream` — WebSocket connection with exponential backoff reconnection (5 attempts: 1s → 2s → 4s → 8s → 16s) and pre-reconnect status check via `getJobStatus()`, before HTTP polling fallback. Prefers the short-lived `wsTicket` for the WebSocket URL; the long-lived `token` is used for REST polling via the `X-Job-Token` header.
- `usePolling` — Interval-based status polling
- `useAutoLogout` — Inactivity timeout with `timeoutMs` (input screen, default 10 min) and `waitingTimeoutMs` (waiting/results, default 15 min) options. The timer is never paused; it runs on all screens so an unattended terminal screen triggers the sensitive-session purge. The `screen` option selects which timeout applies. User activity (mousemove, keydown, click, scroll, touchstart) resets the timer.
- `useRouter` — Hash-based client-side routing. `navigate()` uses `replaceState` when navigating between capability-bearing routes (waiting → results, results → waiting) so credential URLs don't accumulate in browser history. Navigating from a clean route (input) to a capability route uses `pushState` so the user can go back to the clean input page. Callers can override via `{ replace: boolean }`.

#### Other Frontend Files

- `components/layout/Header.tsx` — Persistent light/dark mode toggle
- `api/client.ts` — API client functions (`submitDiagnosis`, `getJobStatus`, `getAgents`, `cancelDiagnosis`). `getJobStatus` and `cancelDiagnosis` send the job token via an `X-Job-Token` header (not in the URL), leaving `Authorization` available for Caddy's HTTP Basic credentials. Completed status responses are runtime-validated with the shared `reportOutcomeSchema`.
- `api/types.ts` — Frontend API types (`DiagnoseRequest`, `StatusResponse`, `WsMessage`, etc.). `DiagnosisReport` and `ReportOutcome` are re-exported from the shared schema module rather than duplicated.
- `types/speech.d.ts` — Ambient type declarations for `SpeechRecognition`, `SpeechRecognitionEvent`, etc.

### Server (`index.ts`)

Entry point. Creates the `Bun.serve()` instance with:

**Routes** (defined in `src/backend/api/routes.ts`):
- `POST /v1/diagnose` — Submit a diagnostic case. Validates input (Zod schema, payload size limit), checks rate limit (per-IP + concurrent workflow cap), starts async workflow, returns `202 Accepted` with `jobId`, `token`, and `wsTicket`.
- `GET /v1/status/:jobId` — Poll job status and progress events. A completed response contains a direct `result: ReportOutcome`; there is no nested workflow-result wrapper. Requires an `X-Job-Token: <token>` header when `WS_TOKEN_SECRET` is set (403 on missing/invalid token); a `?token=<hmac>` query parameter is accepted as a dev fallback during migration. Token is verified before job existence lookup to prevent enumeration (ordering: format check 400 → token check 403 → existence 404). The 200 response includes `Cache-Control: no-store, private` so shared and intermediary caches do not retain PHI-bearing payloads.
- `DELETE /v1/diagnose/:jobId` — Cancel a running diagnostic workflow. Requires an `X-Job-Token: <token>` header when `WS_TOKEN_SECRET` is set (403 on missing/invalid token); a `?token=<hmac>` query parameter is accepted as a dev fallback. Aborts the workflow's `AbortController` and marks the job as `failed("Cancelled by user")`; the workflow keeps its concurrent slot until its promise settles.
- `GET /v1/health` — Health check endpoint (uptime, active workflows, SQLite connectivity).
- `GET /v1/agents` — List available specialist agents (id, name, description).
- `GET /ws?jobId=...&ticket=...` — WebSocket for real-time progress streaming. Completion messages are `{ type: "completed", jobId, result: ReportOutcome }`. Validates `Origin` header against `TRUSTED_ORIGINS` (or `ALLOWED_ORIGINS` when not set). When `WS_TOKEN_SECRET` is set, prefers a short-lived `ticket` parameter (120s TTL, single-use) and also accepts the long-lived `token` parameter for a bounded migration period; rejects expired/invalid credentials with 403. Replays history on connect, subscribes to live updates.
- `OPTIONS /v1/*` — CORS preflight catch-all.
- `/*` — SPA fallback (serves the bundled `index.html` via Bun's HTMLBundle route value; security headers applied by Caddy in production, since HTMLBundle routes bypass the app's `corsHeaders()`).

**CORS**: When `TRUSTED_ORIGINS` is set, reflects the request's `Origin` header if it matches the whitelist. When not set, falls back to `ALLOWED_ORIGINS` (default `*`). All `/v1/*` API responses include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Content-Security-Policy` headers via `corsHeaders()`. `Access-Control-Allow-Headers` includes `Content-Type, Authorization, X-Job-Token`; Caddy exempts credential-free `OPTIONS` requests from HTTP Basic auth so preflights reach these handlers. HTML responses (`"/"` and `"/*"`) are served as Bun HTMLBundle route values, which bypass `corsHeaders()` — security headers for HTML are applied by the Caddy reverse proxy.

**Content-Security-Policy**: The CSP (`CSP_VALUE` in `src/backend/api/routes.ts`) is applied to all `/v1/*` API responses via `corsHeaders()`. It enforces: `default-src 'self'`, `script-src 'self'` (no `'unsafe-inline'`), `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` (Google Fonts CSS allowlisted; `'unsafe-inline'` retained for Tailwind v4 runtime styles), `font-src 'self' https://fonts.gstatic.com`, `img-src 'self' data:`, `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`, `object-src 'none'`. HTML security headers are applied by the production Caddyfile, which adds its configured WebSocket origin for browser interoperability. HSTS is scoped to the configured host rather than committing every subdomain to preload requirements.

**Capability transport hardening**: Job credentials (HMAC tokens) travel via `X-Job-Token` headers for REST endpoints and short-lived `wsTicket` query parameters (120s TTL) for WebSocket upgrades — never in URL path segments or long-lived query parameters. The dedicated header avoids colliding with Caddy's HTTP Basic `Authorization` header. The Caddyfile removes `X-Job-Token` and redacts `token` and `ticket` query parameters from access logs. The token format is `<expiryMs>.<hmacHex>` where `expiry = now + JOB_TTL_MS` (default), so tokens do not outlive the data they protect. `verifyToken` and `verifyWsTicket` reject expired credentials and require exactly 64 ASCII hex characters before any `Buffer` comparison (prevents the malformed-Unicode `RangeError`). `useRouter.navigate()` uses `replaceState` for capability-bearing routes (waiting, results) so credential URLs are not retained in browser history.

**WebSocket** (defined in `src/backend/api/websocket.ts`):
- On open: validates job exists, replays progress history, and either replays the terminal `ReportOutcome` or subscribes to live events.
- On close: unsubscribes from progress store.

**Report outcome deployment:**
- Deploy backend and frontend together because the direct `ReportOutcome` response is a breaking wire change.
- Clear legacy persisted jobs during deployment or allow the default one-hour job TTL to expire before serving them to the new client.
- Roll back backend and frontend together. Do not restore the historical 0%-confidence, `Routine` fake diagnosis fallback.
- Monitor job terminal status separately from report outcome status: `completed` can contain either `available` or `generation_failed`.

**Graceful shutdown**:
- Handles `SIGINT` and `SIGTERM` signals.
- Stops accepting new connections, clears cleanup intervals, waits for in-flight workflows (30s timeout), then exits.

**Background tasks**:
- Job cleanup interval (every 5 minutes, removes jobs older than 60 minutes)
- Rate limiter prune interval (every 10 minutes)
- Tool cache cleanup interval (every 10 minutes, removes entries older than `TOOL_CACHE_TTL_MS`)
- `progressStore.markStalePending()` on startup marks all pending jobs as failed

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_API_KEY` | *required* | LLM provider API key. Env var name varies by provider — see [Mastra providers](https://mastra.ai/models/providers) |
| `PORT` | `3000` | Server port |
| `ALLOWED_ORIGINS` | `*` | CORS + WebSocket origin whitelist (comma-separated, used when `TRUSTED_ORIGINS` is not set) |
| `TRUSTED_ORIGNS` | (empty) | Production CORS + WebSocket origin whitelist (comma-separated). When set, `ALLOWED_ORIGINS` is ignored |
| `WS_TOKEN_SECRET` | (empty) | HMAC secret for WebSocket + REST endpoint authentication. When empty, tokens are not required (dev mode). Set for production — secures WebSocket (short-lived ticket + long-lived token fallback), `GET /v1/status/:jobId`, `DELETE /v1/diagnose/:jobId` (via `X-Job-Token`), and HTTP polling fallback. |
| `JOB_TTL_MS` | `3600000` (60 min) | Terminal-job (completed/failed) TTL before scrub + delete. Must be >= `DIAGNOSIS_TIMEOUT_MS`. Pending jobs are not affected; see `PENDING_JOB_TIMEOUT_MS`. |
| `PENDING_JOB_TIMEOUT_MS` | `1020000` (17 min) | Max lifetime of a pending job before it is aborted and failed (`Diagnosis timed out`). Defaults to `DIAGNOSIS_TIMEOUT_MS + 120000`. Must be >= `DIAGNOSIS_TIMEOUT_MS`. |
| `SPECIALIST_MODEL` | `ollama-cloud/gemma4:31b` | Override specialist agent model. See [Mastra providers](https://mastra.ai/models/providers) for supported models |
| `ORCHESTRATOR_MODEL` | `ollama-cloud/gemma4:31b` | Override CMO agent model. See [Mastra providers](https://mastra.ai/models/providers) for supported models |
| `MAX_DIAGNOSIS_ROUNDS` | `3` | Max CMO consultation rounds |
| `RATE_LIMIT_MAX_REQUESTS` | `10` | Max diagnosis requests per IP per window (counts all requests, valid and invalid) |
| `RATE_LIMIT_WINDOW_MS` | `60000` (1 min) | Rate limit sliding window |
| `MAX_CONCURRENT_WORKFLOWS` | `3` | Max concurrent diagnostic workflows |
| `MOCK_LLM` | — | Set to `1` for mock mode (testing) |
| `LOG_FORMAT` | — | Set to `json` for JSON-structured log output |
| `SPECIALIST_CONTEXT_MODE` | `none` | Agent-to-agent context sharing: `none`, `prior_rounds`, `cmo_curated`, `full` |
| `SPECIALIST_CONTEXT_MAX_CHARS` | `2000` | Max characters of context injected per specialist call |
| `CMO_CONTEXT_MAX_CHARS` | `60000` | Max characters of context maintained in CMO history |
| `AUDIT_LOG_PATH` | — | Path to persistent audit log file (e.g., `./logs/audit.log`). When set, all log events are appended as JSON Lines. |
| `AUDIT_LOG_MAX_SIZE_MB` | `10` | Max audit log file size in MB before rotation. |
| `TOOL_CACHE_TTL_MS` | `86400000` (24h) | Tool API response cache TTL. Set to `0` to disable caching. |
| `TOOL_CACHE_DB_PATH` | `tool-cache.sqlite` | Path to the tool cache SQLite database file |
| `AUDIT_LOG_MAX_FILES` | `5` | Number of rotated audit log files to retain. |
| `AUDIT_LOG_RETENTION_HOURS` | `168` (7 days) | Time-based audit log retention. Entries older than this are purged automatically. |
| `AUDIT_LOG_REDACT_TOOL_ARGS` | `1` (enabled) | When `1`, tool-call events in the audit log record only the tool name, arg count, and presence indicator — not raw argument values. Set to `0` for debugging. |
| `RATE_LIMIT_MAX_ENTRIES` | `10000` | Max rate limiter entries before evicting oldest |
| `MAX_SPECIALIST_CONCURRENCY` | `1` | Max concurrent specialist agents per round |
| `AGENT_GENERATE_MAX_RETRIES` | `3` | Max retries for agent generation calls |
| `AGENT_GENERATE_RETRY_BASE_DELAY` | `1000` | Base delay in ms between agent generation retries |
| `DIAGNOSIS_TIMEOUT_MS` | `900000` (15 min) | Diagnosis workflow timeout |
| `DB_PATH` | `jobs.sqlite` | Path to SQLite job database |
| `ORPHADATA_DB_PATH` | `orphadata.sqlite` | Path to SQLite Orphadata cache database |

## PHI Data Retention

ddx.care is explicitly labeled "RESEARCH PROOF-OF-CONCEPT ONLY. NOT a medical device. NOT HIPAA-compliant." However, defense-in-depth principles warrant minimizing PHI-derived data exposure at rest. The following protections are in place:

### Job Data (SQLite `jobs` table)

- **TTL**: Terminal jobs (completed/failed) persist for `JOB_TTL_MS` (default 60 min) and are then scrubbed and deleted. Pending jobs are never TTL-deleted; they are governed by `PENDING_JOB_TIMEOUT_MS` (default `DIAGNOSIS_TIMEOUT_MS + 120s`). For sensitive deployments, reduce `JOB_TTL_MS` (e.g., `JOB_TTL_MS=300000` for 5-minute **terminal** retention) — this only affects results after a diagnosis finishes, not active workflows. Both `JOB_TTL_MS` and `PENDING_JOB_TIMEOUT_MS` must be >= `DIAGNOSIS_TIMEOUT_MS`; `validateConfig()` enforces this.
- **Scrub-before-delete**: `cleanupExpired()` nulls the `result` and `error` columns and resets `progress` to `'[]'` before the `DELETE`, reducing recoverability from disk images where SQLite has not yet reclaimed pages. Applies only to terminal jobs.
- **In-memory only**: The `jobs` SQLite database is file-backed but transient — data is lost on server restart. `markStalePending()` on startup marks all pending jobs as failed. `cleanupExpired(JOB_TTL_MS)` also runs once on startup to remove terminal jobs that expired during downtime.

### Audit Log

- **Tool-arg redaction**: When `AUDIT_LOG_REDACT_TOOL_ARGS=1` (default), tool-call events record only the tool name, argument count, and a presence indicator (`argsPresent`/`argCount`) — not raw argument values (drug names, condition names, search queries). Set `AUDIT_LOG_REDACT_TOOL_ARGS=0` for debugging sessions.
- **Time-based purge**: The `AuditLogger.purgeOlderThan(hours)` method removes JSON Lines entries older than `AUDIT_LOG_RETENTION_HOURS` (default 168h / 7 days). A timer calls this at most once per hour (every `AUDIT_LOG_RETENTION_HOURS / 4`, minimum 1 hour). This complements the existing size-based rotation (`AUDIT_LOG_MAX_SIZE_MB` × `AUDIT_LOG_MAX_FILES`).
- **Startup logging**: The server logs PHI retention settings on startup.

### Frontend

- **sessionStorage**: The input form auto-saves to `sessionStorage` every 500ms, cleared on successful submission. Data persists if the user abandons the form but is cleared on tab close. A visible disclosure note under the form states drafts are auto-saved for this tab and cleared on inactivity or tab close.
- **Inactivity session purge**: When the inactivity timeout fires, a centralized `purgeSensitiveSession()` function in `src/frontend/main.tsx` stops any active voice dictation (via the `InputDashboardHandle.stopVoiceInput` ref), clears the form fields and draft (via `InputDashboardHandle.clearAll`), removes job credentials and the draft from `sessionStorage`, clears in-memory job contexts, replaces the current history entry with the neutral `/` route via `history.replaceState` (so browser back navigation cannot recover case content or capability URLs), and renders a "Session Locked" view instead of navigating to a still-populated input page. Tapping "Continue" dismisses the lock and returns to a blank input form.
- **Extended timeout on waiting/results**: The auto-logout timer is never paused. On the input screen it uses a 10-minute timeout; on the waiting and results screens it uses an extended 15-minute timeout (`waitingTimeoutMs`) so an unattended terminal screen still triggers the purge. User activity resets the timer on all screens.

### What is NOT covered (operator's responsibility)

- **Disk-level encryption**: Use LUKS or equivalent host-level encryption for SQLite database files at rest.
- **Database encryption**: Full column-level encryption (e.g., SQLCipher) is not implemented. Access control is via `WS_TOKEN_SECRET` (token auth for WebSocket/REST endpoints).
- **Network encryption**: TLS is terminated by the Caddy reverse proxy in production.

## Testing

### Unit Tests (`bun run test`)

Backend test files in `tests/`:
- `api.test.ts` — API route handler tests
- `tools.test.ts` — Medical tool execution tests
- `api-contract.test.ts` — API contract tests (live API with `RUN_CONTRACT=1`); fetches one real record per external API and asserts the exact fields each tool reads. Catches API schema drift. Runs in CI on PRs and nightly.
- `workflow.test.ts` — Diagnostic workflow, `limitConcurrency`, `withRetry`, `splitToList` tests
- `progress-store.test.ts` — `JobStore` CRUD, pub/sub, cleanup, scrub-before-delete tests
- `rate-limiter.test.ts` — Rate limiting, concurrent workflow cap, prune tests
- `logger.test.ts` — Logger output format, JSON mode, tool-arg redaction tests
- `fetch-utils.test.ts` — `fetchJSON` timeout, error handling tests
- `audit-logger.test.ts` — Audit logger rotation, tool-arg redaction, time-based purge tests
- `ws-origin.test.ts` — WebSocket origin validation tests

### REST/WS Token Integration Tests (`bun run test:rest-tokens`)

These files start a server with `WS_TOKEN_SECRET` set and must run separately from `bun run test` (Bun shares the module registry; the main suite's dev-mode server caches an empty secret).

- `rest-token.test.ts` — REST endpoint `Authorization` header acceptance, query-param fallback, expired-token rejection, `Cache-Control: no-store` presence, malformed-Unicode (403 not 500), and unit-level `generateToken`/`verifyToken` primitives. Run: `bun run test:rest-token`.
- `ws-ticket.test.ts` — `/ws` ticket validation: valid ticket within TTL, expired ticket rejected, invalid/cross-job ticket rejected, missing-credential 403, long-lived token fallback, ticket precedence. Run: `bun run test:ws-ticket`.

### Frontend Tests (`bun run test:frontend`)

- `frontend.test.tsx` — React component and hook tests using `@testing-library/react` + `happy-dom`

### E2E Tests (`bun run test:e2e`)

- `full-flow.spec.ts` — Full diagnostic workflow via Playwright (Chromium)
- `job-context.spec.ts` — Frontend job context isolation (refresh, expiry, back/forward navigation)
- `error-states.spec.ts` — Error states & edge paths (deep-link, agent-list failure, cancel, retry, report-generation failure)
- `inactivity-purge.spec.ts` — Inactivity session purge (unattended results/waiting/input screens, back navigation, autosave disclosure, activity reset). Uses Playwright's `page.clock` to fast-forward through the extended timeout.
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
- `@playwright/test` (^1.59.1) — E2E testing
- `@testing-library/react` (^16.3.2) — Component testing
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
- Run the full test suite (`bun run test:all`) after every code change.

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
