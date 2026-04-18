export const PORT = parseInt(process.env.PORT ?? "3000", 10);
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? "*";
export const JOB_TTL_MS = 30 * 60 * 1000;
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export const RATE_LIMIT_PRUNE_INTERVAL_MS = 10 * 60 * 1000;
export const SPECIALIST_MODEL =
  process.env.SPECIALIST_MODEL ?? "opencode-go/qwen3.6-plus";
export const ORCHESTRATOR_MODEL =
  process.env.ORCHESTRATOR_MODEL ?? "opencode-go/qwen3.6-plus";
export const DIAGNOSIS_TIMEOUT_MS = 15 * 60 * 1000;
export const MAX_DIAGNOSIS_ROUNDS = parseInt(
  process.env.MAX_DIAGNOSIS_ROUNDS ?? "3",
  10,
);
export const RATE_LIMIT_MAX_REQUESTS = parseInt(
  process.env.RATE_LIMIT_MAX_REQUESTS ?? "5",
  10,
);
export const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_WINDOW_MS ?? String(60 * 1000),
  10,
);
export const MAX_CONCURRENT_WORKFLOWS = parseInt(
  process.env.MAX_CONCURRENT_WORKFLOWS ?? "3",
  10,
);
export const MAX_INPUT_FIELD_LENGTH = 50_000;
export const MAX_PAYLOAD_BYTES = 1_000_000;
export const AGENT_GENERATE_MAX_RETRIES = parseInt(
  process.env.AGENT_GENERATE_MAX_RETRIES ?? "3",
  10,
);
export const AGENT_GENERATE_RETRY_BASE_DELAY = 1000;

const VALID_CONTEXT_MODES = [
  "none",
  "prior_rounds",
  "cmo_curated",
  "full",
] as const;
type ContextMode = (typeof VALID_CONTEXT_MODES)[number];

export const SPECIALIST_CONTEXT_MODE: ContextMode = (() => {
  const raw = process.env.SPECIALIST_CONTEXT_MODE ?? "none";
  if (VALID_CONTEXT_MODES.includes(raw as ContextMode))
    return raw as ContextMode;
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `Invalid SPECIALIST_CONTEXT_MODE "${raw}". Defaulting to "none". Valid: ${VALID_CONTEXT_MODES.join(", ")}`,
    );
  }
  return "none";
})();

export const SPECIALIST_CONTEXT_MAX_CHARS = parseInt(
  process.env.SPECIALIST_CONTEXT_MAX_CHARS ?? "2000",
  10,
);

export function validateConfig() {
  if (!process.env.OPENCODE_API_KEY && process.env.MOCK_LLM !== "1") {
    throw new Error(
      "Missing OPENCODE_API_KEY environment variable. It must be set unless MOCK_LLM=1 is used.",
    );
  }
  if (Number.isNaN(PORT) || PORT <= 0 || PORT > 65535) {
    throw new Error(
      `Invalid PORT: ${process.env.PORT}. Must be a positive number between 1 and 65535.`,
    );
  }
  if (Number.isNaN(MAX_DIAGNOSIS_ROUNDS) || MAX_DIAGNOSIS_ROUNDS <= 0) {
    throw new Error(
      `Invalid MAX_DIAGNOSIS_ROUNDS: ${process.env.MAX_DIAGNOSIS_ROUNDS}. Must be a positive number.`,
    );
  }
  if (Number.isNaN(RATE_LIMIT_MAX_REQUESTS) || RATE_LIMIT_MAX_REQUESTS <= 0) {
    throw new Error(
      `Invalid RATE_LIMIT_MAX_REQUESTS: ${process.env.RATE_LIMIT_MAX_REQUESTS}. Must be a positive number.`,
    );
  }
  if (Number.isNaN(RATE_LIMIT_WINDOW_MS) || RATE_LIMIT_WINDOW_MS <= 0) {
    throw new Error(
      `Invalid RATE_LIMIT_WINDOW_MS: ${process.env.RATE_LIMIT_WINDOW_MS}. Must be a positive number.`,
    );
  }
  if (Number.isNaN(MAX_CONCURRENT_WORKFLOWS) || MAX_CONCURRENT_WORKFLOWS <= 0) {
    throw new Error(
      `Invalid MAX_CONCURRENT_WORKFLOWS: ${process.env.MAX_CONCURRENT_WORKFLOWS}. Must be a positive number.`,
    );
  }
  if (
    Number.isNaN(AGENT_GENERATE_MAX_RETRIES) ||
    AGENT_GENERATE_MAX_RETRIES < 0
  ) {
    throw new Error(
      `Invalid AGENT_GENERATE_MAX_RETRIES: ${process.env.AGENT_GENERATE_MAX_RETRIES}. Must be a non-negative number.`,
    );
  }
  if (
    Number.isNaN(SPECIALIST_CONTEXT_MAX_CHARS) ||
    SPECIALIST_CONTEXT_MAX_CHARS <= 0
  ) {
    throw new Error(
      `Invalid SPECIALIST_CONTEXT_MAX_CHARS: ${process.env.SPECIALIST_CONTEXT_MAX_CHARS}. Must be a positive number.`,
    );
  }
}
