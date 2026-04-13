# Tasks — Week of Apr 13–19, 2026

> Full project review conducted Apr 12. Tasks ranked by impact and risk.

## P0 — Critical / Ship-Blocking

- [x] **Remove misleading "HIPAA Mode" badge** — [Header.tsx](src/frontend/components/layout/Header.tsx) displays a `ShieldCheckIcon` + "HIPAA Mode" label, but there is zero HIPAA compliance behind it. This is legally misleading for a medical tool. Either remove the badge entirely, or replace it with a neutral label like "Clinical Decision Support" or "Research Only".

- [x] **Remove stale PII docs from CLAUDE.md** — [CLAUDE.md](CLAUDE.md) still references `src/backend/utils/pii-detector.ts` and the routes description mentions "checks PII". It also still lists PII Detection in the Architecture section and describes the diagnose route as "checks PII". PII detection was deleted in commit `a79b4e9`. Update both files to match reality.

- [x] **Fix `limitConcurrency` race condition** — [diagnostic-workflow.ts](src/backend/workflows/diagnostic-workflow.ts) uses `index++` across concurrent async workers. Under V8 microtask scheduling this is safe today (JS is single-threaded and `index++` is atomic at the instruction level), but the code relies on an implicit engine guarantee that isn't expressed in the type system or documented. Add a comment explaining *why* it's safe, or restructure to use a single dispatcher (`for` loop) that feeds a bounded queue — this makes the concurrency contract explicit and future-proof.

- [x] **Fix `tsconfig.json` include pattern** — [tsconfig.json](tsconfig.json) includes `"frontend/**/*"` but the frontend directory is at `src/frontend/`. This means `bun run typecheck` will never check frontend files. Change to `"src/**/*"` (which already covers it) and remove the redundant `"frontend/**/*"` entry. Verify that `bun run typecheck` passes clean after the fix.

## P1 — High Priority / Quality

- [x] **Add CORS headers for production deployment** — The API has no CORS configuration. Any cross-origin frontend deployment (e.g. SPA on a CDN) will fail silently. Add configurable CORS middleware with an `ALLOWED_ORIGINS` env var (comma-separated whitelist, default `*` for dev). Apply to all `/v1/*` routes. Include `Access-Control-Allow-Headers` for `Content-Type`.

- [x] **Harden WebSocket handler: validate origin on upgrade** — [routes.ts](src/backend/api/routes.ts) upgrades any connection with a `jobId` query param. [websocket.ts](src/backend/api/websocket.ts) does check if the job exists and closes if not, which is reasonable defense. However, there's no origin validation on the upgrade request. Add an `Origin` header check against `ALLOWED_ORIGINS` (same env var as CORS) to prevent cross-site WebSocket hijacking.

- [x] **Replace `recognitionRef: any` with proper SpeechRecognition types** — [InputDashboard.tsx](src/frontend/pages/InputDashboard.tsx) uses `useRef<any>`, casts `window as any`, and uses `any` for event types. Add a `src/frontend/types/speech.d.ts` ambient type declaration file for `SpeechRecognition`, `SpeechRecognitionEvent`, and `SpeechRecognitionResultList`. Remove all `any` casts.

- [x] **Surface network failures to the user instead of silently catching** — Network failures are silently caught with `.catch(() => {})` in [WaitingRoom.tsx](src/frontend/pages/WaitingRoom.tsx) (getAgents) and [main.tsx](src/frontend/main.tsx) (getJobStatus for deep links). Instead of swallowing errors: (1) show a dismissable warning banner when agents fail to load, (2) show a "could not load results" message with a retry button when deep-link status fetch fails. No need for a full React Error Boundary — these are the only two silent catch sites.

- [x] **Implement graceful server shutdown** — [index.ts](index.ts) starts two `setInterval` timers that are never cleaned up. No `SIGINT`/`SIGTERM` handler exists. Add signal handlers that: (1) stop accepting new connections via `server.stop()`, (2) wait for in-flight workflows to finish (with a timeout), (3) clear the cleanup intervals. This prevents corrupted progress-store state on deploy/restart.

## P2 — Medium Priority / Robustness

- [x] **Add health check endpoint (`GET /v1/health`)** — Essential for deployment behind a load balancer or container orchestrator. Should return `200 OK` with JSON body: `{ status: "ok", uptime: <seconds>, activeWorkflows: <count> }`. Optionally check SQLite connectivity (`progressStore.getJob("__health__")` returning `null` is sufficient proof).

- [x] **Deduplicate report type definitions** — The `DiagnosisReport` shape is defined in three places: [diagnostic-workflow.ts](src/backend/workflows/diagnostic-workflow.ts) (Zod schema), [api/types.ts](src/frontend/api/types.ts) (TS interface), and [ConsultNotes.tsx](src/frontend/components/diagnosis/ConsultNotes.tsx) (imports the type). The Zod schema is the source of truth. Generate the frontend interface using `z.infer<typeof reportSchema>` and re-export from a shared location, or at minimum add a compile-time assertion that the TS interface extends the Zod-inferred type so drift is caught.

- [x] **Add retry/reconnect to WebSocket client** — [useJobStream.ts](src/frontend/hooks/useJobStream.ts) falls back to polling on WebSocket error/close, but never attempts to reconnect. Add exponential backoff reconnection (3 attempts, 1s → 2s → 4s) before falling back to polling. Only reconnect on abnormal close codes (not 1000/1005).

- [x] **Harden PDF export against XSS** — [ConsultNotes.tsx](src/frontend/components/diagnosis/ConsultNotes.tsx) writes `reportRef.current.innerHTML` directly into a new window via `document.write`. While the report content is LLM-generated (not user-authored HTML), defense in depth is warranted. Add a CSP `<meta>` tag in the print template: `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`. This blocks script execution in the print window without affecting the inline styles.

- [x] **Rate limiter: log a warning on startup about in-memory state** — [rate-limiter.ts](src/backend/utils/rate-limiter.ts) uses an in-memory `Map`. Server restarts reset all rate limits. Rather than adding SQLite persistence now (over-engineering for current scale), add a `logger.warn("rate_limiter_reset")` on first request after startup so it's visible in logs if abuse coincides with a restart. Revisit persistence if the app gets real traffic.

- [x] **Add structured JSON logging option** — [logger.ts](src/backend/utils/logger.ts) outputs human-readable text. In production, JSON-structured logs are easier to ingest into log aggregation (Datadog, Grafana Loki). Add a `LOG_FORMAT=json` env var toggle. When set, `logger.info/warn/error` should output `JSON.stringify({ level, message, timestamp, ...meta })` on a single line.

## P3 — Improvements / Developer Experience

- [ ] **Fix and run `bun run typecheck` in CI** — The `tsconfig.json` include pattern fix (P0 above) is a prerequisite. After fixing it, run `bun run typecheck` and fix any type errors that surface. Add typecheck to the test pipeline (e.g. a `pretest` script or CI step).

- [ ] **Add `bun run lint` script with Biome** — No linter is configured. Add `@biomejs/biome` as a dev dependency with a minimal `biome.json` config focused on catching real bugs: `noExplicitAny`, `noUnusedVariables`, `useConst`. Don't enable stylistic rules — just bug-catching. Add `"lint": "biome check src/"` script to `package.json`.

- [ ] **Centralize environment variable validation** — [config.ts](src/backend/config.ts) does bare `parseInt` with no validation. Missing `GOOGLE_GENERATIVE_AI_API_KEY` silently fails at the first LLM call. Add a `validateConfig()` function that runs at server startup: assert `GOOGLE_GENERATIVE_AI_API_KEY` is set, assert parsed ints are positive numbers, assert `PORT` is in valid range. Fail fast with a clear error message.

- [ ] **Add `.editorconfig`** — Ensure consistent basic formatting across contributors (indent style, trailing newline, charset). No need for Prettier or a full formatting config yet — Biome can handle formatting if desired later.

- [ ] **Improve test isolation in progress-store tests** — Tests should use `:memory:` SQLite databases instead of the default `jobs.sqlite` file so tests don't contaminate each other or prod data. Pass the DB path via a constructor parameter or env var override.

- [ ] **Add CI pipeline (GitHub Actions)** — No CI is configured. Create a `.github/workflows/ci.yml` that runs on PR and push to main: (1) `bun install`, (2) `bun run typecheck`, (3) `bun run test`, (4) `bun run test:e2e`. Use the official `oven-sh/setup-bun` action. Run E2E with `MOCK_LLM=1`.

- [ ] **Add `Dockerfile` for containerized deployment** — Use `oven/bun:latest` base image, copy source, `bun install --frozen-lockfile`, expose `PORT`, `CMD ["bun", "index.ts"]`. Add `.dockerignore` for `node_modules`, `dist`, `test-results`, `.git`.

## P4 — Feature Work

- [ ] **Add database persistence for diagnosis history** — Allow users to review past diagnoses, compare results over time, and export case data. Use `bun:sqlite` for MVP. Schema: `diagnosis_history(id, jobId, createdAt, inputPayload, report, status)`. Add `GET /v1/history` and `GET /v1/history/:jobId` routes. Frontend: add a "History" tab in the app shell.

- [ ] **Implement SSE or streaming for LLM responses** — Stream specialist agent responses as they generate, rather than waiting for the complete response. This gives the user real-time visibility into the analysis. Requires Mastra streaming support investigation.

- [ ] **Add a "Case Examples" dropdown** — Pre-populate the InputDashboard with sample medical cases (e.g. classic cardiac, neurological, pediatric presentations) so users can instantly see how the system works. Store 3–5 curated example cases in `src/frontend/data/example-cases.ts`.

## P5 — Long-Term / Aspirational

- [ ] **Add authentication and user accounts** — Required before any multi-user deployment. Use session-based auth with secure cookies.

- [ ] **Add a "second opinion" feature** — Re-run the diagnosis with a different model or different specialist selection to compare results.

- [ ] **Implement agent-to-agent communication** — Currently specialists don't communicate; they each analyze the case independently. Allow specialists to build on each other's findings within a round.

- [ ] **Mobile-responsive polish** — The current layout works on mobile but hasn't been intentionally optimized. Review and fix: input card stacking, waiting room progress log scroll, results view tab navigation on small screens, PDF export on mobile Safari.
