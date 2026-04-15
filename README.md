# ddx.care

AI-powered differential diagnosis system that simulates a panel of medical specialists analyzing patient cases. Uses AI agents (via Mastra) to orchestrate 36+ specialist agents, coordinated by a Chief Medical Officer agent that synthesizes findings into a ranked differential diagnosis.

## Architecture

### Backend (`src/backend/`)
- **Mastra framework** (`@mastra/core`) — agent orchestration, workflows, tool definitions
- **AI Model**: Together AI (`togetherai/openai/gpt-oss-120b` by default), configured via `TOGETHER_API_KEY`
- **Agents** — 36+ medical specialist agents + Chief Medical Officer. Created via factory pattern in `factory.ts`
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
# Edit .env and add your Together AI API key
bun run dev
```

The app runs on `http://localhost:3000` by default.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server with HMR |
| `bun run build` | Bundle frontend to `./dist` |
| `bun run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `bun run test` | Run backend unit tests |
| `bun run test:frontend` | Run frontend component tests |
| `bun run test:e2e` | Run Playwright E2E tests |
| `bun run test:all` | Run all tests (unit, frontend, and e2e) |
| `bun run test:integration` | Run integration tests against live APIs |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TOGETHER_API_KEY` | — | **Required.** Together AI API key |
| `PORT` | `3000` | Server port |
| `SPECIALIST_MODEL` | `togetherai/openai/gpt-oss-120b` | Model for specialist agents |
| `ORCHESTRATOR_MODEL` | `togetherai/openai/gpt-oss-120b` | Model for CMO orchestrator |
| `MAX_DIAGNOSIS_ROUNDS` | `3` | Max consultation rounds per diagnosis |
| `RATE_LIMIT_MAX_REQUESTS` | `5` | Max requests per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `3600000` | Rate limit window (1 hour) |
| `MAX_CONCURRENT_WORKFLOWS` | `3` | Max concurrent diagnostic workflows |
| `MOCK_LLM` | — | Set to `1` for mock mode (testing) |

See [`.env.example`](.env.example) for a template.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/diagnose` | Submit a diagnostic case (validates input size up to 1MB max payload) |
| `GET` | `/v1/status/:jobId` | Poll job status |
| `GET` | `/v1/agents` | List available specialist agents |
| `GET` | `/ws?jobId=...` | WebSocket for real-time progress streaming |

## Tech Stack

- **Runtime:** Bun
- **AI Framework:** Mastra (`@mastra/core`)
- **AI Model:** Together AI
- **Frontend:** React 19, Tailwind CSS v4
- **Validation:** Zod
- **Testing:** `bun:test`, Playwright, `@testing-library/react`
- **Database:** `bun:sqlite`
