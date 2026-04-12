# ddx.care — AI-Powered Differential Diagnosis System

Uses AI agents (via Mastra) to simulate a panel of medical specialists analyzing patient cases. 36+ specialist agents consult on cases, orchestrated by a Chief Medical Officer agent that synthesizes findings into a ranked differential diagnosis.

## Runtime & Tooling

Default to using Bun instead of Node.js. You should NEVER use Python or any Python-based tools (including for testing or scripting). Always use Bun tools.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads `.env`, so don't use `dotenv`.

## Scripts

- `bun run dev` — Start dev server with HMR on port 3000 (or `PORT` env var)
- `bun run build` — Bundle frontend to `./dist`
- `bun run test` — Run unit tests (api, tools, api-integration)
- `bun run test:e2e` — Run Playwright E2E tests
- `bun run test:all` — Run both unit and E2E tests
- `bun run test:integration` — Run integration tests against live APIs (`RUN_INTEGRATION=1`)

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile.
- Bun.$`ls` instead of execa.

## Architecture

### Backend (`src/backend/`)

- **Mastra framework** (`@mastra/core`) — agent orchestration, workflows, tool definitions
- **AI Model**: Google Gemini (default: `gemini-3.1-pro-preview`), configured via `GOOGLE_GENERATIVE_AI_API_KEY`
- **Agents** (`src/backend/agents/`) — 36+ medical specialist agents + Chief Medical Officer. Created via factory pattern in `factory.ts`. Listed in `index.ts`.
- **Tools** (`src/backend/tools/`) — Medical API integrations:
  - PubMed/NCBI literature search
  - OpenFDA drug safety & adverse events
  - ClinicalTrials.gov trial matching
  - RxNav drug interactions
  - MedlinePlus patient education
- **Workflows** (`src/backend/workflows/`) — Multi-step diagnostic workflow with concurrency control (max 3 concurrent specialist calls) and retry logic
- **Progress Store** (`src/backend/progress-store.ts`) — SQLite-backed job persistence with pub/sub for real-time updates and TTL-based cleanup
- **PII Detection** (`src/backend/utils/pii-detector.ts`) — Server-side check for patient health information before processing

### Frontend (`src/frontend/`)

- **React 19** with Tailwind CSS v4
- Entry: `src/frontend/main.tsx` (loaded via `<script>` in `index.html`)
- **Pages**: InputDashboard (case submission) → WaitingRoom (real-time progress) → ResultsView (diagnosis report)
- **Hooks**: `useJobStream` (WebSocket with HTTP polling fallback), `usePolling`, `useAutoLogout`
- **Context**: `ThemeContext` (light/dark mode)
- Built by Bun's bundler via HTML imports — no Vite.

### Server (`index.ts`)

Routes:
- `POST /v1/diagnose` — Submit a diagnostic case (validates input, checks PII, starts workflow)
- `GET /v1/status/:jobId` — Poll job status
- `GET /v1/agents` — List available specialist agents
- `GET /ws?jobId=...` — WebSocket for real-time progress streaming (replays history on connect)
- `/` — Serves the frontend SPA

### Environment Variables

- `GOOGLE_GENERATIVE_AI_API_KEY` — Required. Google AI API key.
- `PORT` — Server port (default: 3000)
- `SPECIALIST_MODEL` — Override specialist agent model
- `ORCHESTRATOR_MODEL` — Override CMO agent model
- `MAX_DIAGNOSIS_ROUNDS` — Max consultation rounds (default: 3)
- `MOCK_LLM` — Set to `1` for mock mode (testing)

## Testing

- **Unit tests**: `bun test` — files in `tests/` (`api.test.ts`, `tools.test.ts`, `api-integration.test.ts`)
- **E2E tests**: Playwright (`bun run test:e2e`) — `tests/full-flow.spec.ts`, runs on port 3999 with `MOCK_LLM=1`
- Test server configured in `playwright.config.ts`

## Key Dependencies

- `@mastra/core` — Agent/workflow framework
- `react` / `react-dom` (v19) — UI
- `tailwindcss` (v4) + `bun-plugin-tailwind` — Styling
- `zod` — Input validation schemas
- `marked` — Markdown rendering
- `isomorphic-dompurify` — HTML sanitization
- `@heroicons/react` — Icon library
- `@playwright/test` — E2E testing
