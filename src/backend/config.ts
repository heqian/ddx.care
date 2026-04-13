export const PORT = parseInt(process.env.PORT ?? "3000", 10);
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? "*";
export const JOB_TTL_MS = 30 * 60 * 1000;
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export const RATE_LIMIT_PRUNE_INTERVAL_MS = 10 * 60 * 1000;
export const SPECIALIST_MODEL =
  process.env.SPECIALIST_MODEL ?? "google/gemini-3.1-pro-preview";
export const ORCHESTRATOR_MODEL =
  process.env.ORCHESTRATOR_MODEL ?? "google/gemini-3.1-pro-preview";
export const DIAGNOSIS_TIMEOUT_MS = 300_000;
export const MAX_DIAGNOSIS_ROUNDS = parseInt(process.env.MAX_DIAGNOSIS_ROUNDS ?? "3", 10);
export const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "5", 10);
export const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? String(60 * 60 * 1000), 10);
export const MAX_CONCURRENT_WORKFLOWS = parseInt(process.env.MAX_CONCURRENT_WORKFLOWS ?? "3", 10);
export const MAX_INPUT_FIELD_LENGTH = 50_000;
export const MAX_PAYLOAD_BYTES = 1_000_000;
