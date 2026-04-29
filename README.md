# ddx.care

AI-powered differential diagnosis system that simulates a panel of medical specialists analyzing patient cases. Uses AI agents (via Mastra) to orchestrate 35 specialist agents and a Chief Medical Officer (CMO), which synthesizes findings into a ranked differential diagnosis.

## Architecture

### Backend (`src/backend/`)
- **Mastra framework** (`@mastra/core`) — agent orchestration, workflows, tool definitions
- **AI Model**: Ollama Cloud (`ollama-cloud/gemma4:31b` by default), configured via `OLLAMA_API_KEY`. Other providers are supported — see [Mastra providers](https://mastra.ai/models/providers) for available API key env var names and supported models.
- **Agents** — 35 medical specialist agents + Chief Medical Officer (CMO). Created via factory pattern in `factory.ts`
- **Tools** — Medical API integrations:
  - PubMed/NCBI literature search
  - OpenFDA drug safety & adverse events
  - ClinicalTrials.gov trial matching
  - RxNav drug interactions
  - MedlinePlus patient education
- **Workflows** — Multi-step diagnostic workflow with concurrency control (max 3 concurrent specialist calls) and retry logic
- **Progress Store** — SQLite-backed job persistence with pub/sub for real-time WebSocket updates and TTL-based cleanup

### Frontend (`src/frontend/`)
- **React 19** with Tailwind CSS v4
- **Real-time Updates** — WebSocket progress streaming with fallback to HTTP polling
- **Context** — `ThemeContext` for light/dark mode support
- Built by Bun's bundler via HTML imports — no Vite.

### Server (`index.ts`)
- `Bun.serve()` with HTTP routes and WebSocket support for real-time progress updates

## Setup

```bash
bun install
cp .env.example .env
# Edit .env and add your LLM provider API key (see https://mastra.ai/models/providers)
bun run dev
```

The app runs on `http://localhost:3000` by default.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server with HMR |
| `bun run build` | Bundle frontend to `./dist` |
| `bun run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `bun run lint` | Run Biome linter on `src/` |
| `bun run test` | Run backend unit tests |
| `bun run test:frontend` | Run frontend component tests |
| `bun run test:e2e` | Run Playwright E2E tests |
| `bun run test:all` | Run all tests (unit, frontend, and e2e) |
| `bun run test:integration` | Run integration tests against live APIs |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_API_KEY` | — | **Required.** LLM provider API key. Env var name varies by provider — see [Mastra providers](https://mastra.ai/models/providers) |
| `PORT` | `3000` | Server port |
| `SPECIALIST_MODEL` | `ollama-cloud/gemma4:31b` | Model for specialist agents. See [Mastra providers](https://mastra.ai/models/providers) for supported models |
| `ORCHESTRATOR_MODEL` | `ollama-cloud/gemma4:31b` | Model for CMO orchestrator. See [Mastra providers](https://mastra.ai/models/providers) for supported models |
| `MAX_DIAGNOSIS_ROUNDS` | `3` | Max consultation rounds per diagnosis |
| `RATE_LIMIT_MAX_REQUESTS` | `5` | Max requests per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (1 minute) |
| `MAX_CONCURRENT_WORKFLOWS` | `3` | Max concurrent diagnostic workflows |
| `MOCK_LLM` | — | Set to `1` for mock mode (testing) |
| `ALLOWED_ORIGINS` | `*` | CORS + WebSocket origin whitelist (comma-separated) |
| `LOG_FORMAT` | — | Set to `json` for JSON-structured log output |
| `SPECIALIST_CONTEXT_MODE` | `none` | Agent-to-agent context sharing: `none`, `prior_rounds`, `cmo_curated`, `full` |
| `SPECIALIST_CONTEXT_MAX_CHARS` | `2000` | Max characters of context injected per specialist call |
| `CMO_CONTEXT_MAX_CHARS` | `60000` | Max characters of context maintained in CMO history |
| `AGENT_GENERATE_MAX_RETRIES` | `3` | Max retries for agent generation calls |
| `MAX_SPECIALIST_CONCURRENCY` | `3` | Max concurrent specialist calls per round |

See [`.env.example`](.env.example) for a template.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/diagnose` | Submit a diagnostic case (validates input size up to 1MB max payload) |
| `GET` | `/v1/status/:jobId` | Poll job status |
| `GET` | `/v1/health` | Health check (uptime, active workflows, DB connectivity) |
| `GET` | `/v1/agents` | List available specialist agents |
| `GET` | `/ws?jobId=...` | WebSocket for real-time progress streaming |

## Tech Stack

- **Runtime:** Bun
- **AI Framework:** Mastra (`@mastra/core`)
- **AI Model:** Ollama Cloud (`ollama-cloud/gemma4:31b`). Other providers supported — see [Mastra providers](https://mastra.ai/models/providers)
- **Frontend:** React 19, Tailwind CSS v4
- **Validation:** Zod
- **Markdown / Sanitization:** `marked`, `isomorphic-dompurify`
- **Icons:** `@heroicons/react`
- **Testing:** `bun:test`, Playwright, `@testing-library/react`, `happy-dom`
- **Database:** `bun:sqlite`
