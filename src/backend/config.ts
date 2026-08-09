export const PORT = parseInt(process.env.PORT ?? "3000", 10);
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? "*";
export const TRUSTED_ORIGINS = process.env.TRUSTED_ORIGINS ?? "";
export const WS_TOKEN_SECRET = process.env.WS_TOKEN_SECRET ?? "";
export const JOB_TTL_MS = parseInt(
  process.env.JOB_TTL_MS ?? String(60 * 60 * 1000),
  10,
);
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export const RATE_LIMIT_PRUNE_INTERVAL_MS = 10 * 60 * 1000;
export const RATE_LIMIT_MAX_ENTRIES = parseInt(
  process.env.RATE_LIMIT_MAX_ENTRIES ?? "10000",
  10,
);
export const SPECIALIST_MODEL =
  process.env.SPECIALIST_MODEL ?? "ollama-cloud/gemma4:31b";
export const ORCHESTRATOR_MODEL =
  process.env.ORCHESTRATOR_MODEL ?? "ollama-cloud/gemma4:31b";
export const DIAGNOSIS_TIMEOUT_MS = parseInt(
  process.env.DIAGNOSIS_TIMEOUT_MS ?? String(15 * 60 * 1000),
  10,
);
export const PENDING_JOB_TIMEOUT_MS = parseInt(
  process.env.PENDING_JOB_TIMEOUT_MS ?? String(DIAGNOSIS_TIMEOUT_MS + 120_000),
  10,
);
export const MAX_DIAGNOSIS_ROUNDS = parseInt(
  process.env.MAX_DIAGNOSIS_ROUNDS ?? "3",
  10,
);
export const RATE_LIMIT_MAX_REQUESTS = parseInt(
  process.env.RATE_LIMIT_MAX_REQUESTS ?? "10",
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
export const MAX_SPECIALIST_CONCURRENCY = parseInt(
  process.env.MAX_SPECIALIST_CONCURRENCY ?? "1",
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
  const raw = process.env.SPECIALIST_CONTEXT_MODE ?? "prior_rounds";
  if (VALID_CONTEXT_MODES.includes(raw as ContextMode))
    return raw as ContextMode;
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `Invalid SPECIALIST_CONTEXT_MODE "${raw}". Defaulting to "prior_rounds". Valid: ${VALID_CONTEXT_MODES.join(", ")}`,
    );
  }
  return "prior_rounds";
})();

export const SPECIALIST_CONTEXT_MAX_CHARS = parseInt(
  process.env.SPECIALIST_CONTEXT_MAX_CHARS ?? "2000",
  10,
);

export const CMO_CONTEXT_MAX_CHARS = parseInt(
  process.env.CMO_CONTEXT_MAX_CHARS ?? "60000",
  10,
);

export const ORPHADATA_ENABLED = process.env.ORPHADATA_ENABLED !== "0";

export const TOOL_CACHE_TTL_MS = parseInt(
  process.env.TOOL_CACHE_TTL_MS ?? String(24 * 60 * 60 * 1000),
  10,
);
export const TOOL_CACHE_ENABLED = TOOL_CACHE_TTL_MS > 0;
export const TOOL_CACHE_DB_PATH =
  process.env.TOOL_CACHE_DB_PATH || "tool-cache.sqlite";
export const TOOL_CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

export const AUDIT_LOG_PATH = process.env.AUDIT_LOG_PATH ?? "";
export const AUDIT_LOG_MAX_SIZE_MB = parseInt(
  process.env.AUDIT_LOG_MAX_SIZE_MB ?? "10",
  10,
);
export const AUDIT_LOG_MAX_FILES = parseInt(
  process.env.AUDIT_LOG_MAX_FILES ?? "5",
  10,
);
export const AUDIT_LOG_RETENTION_HOURS = parseInt(
  process.env.AUDIT_LOG_RETENTION_HOURS ?? "168",
  10,
);
export const AUDIT_LOG_REDACT_TOOL_ARGS =
  process.env.AUDIT_LOG_REDACT_TOOL_ARGS !== "0";

export function validateConfig() {
  if (!process.env.OLLAMA_API_KEY && process.env.MOCK_LLM !== "1") {
    throw new Error(
      "Missing OLLAMA_API_KEY environment variable. It must be set unless MOCK_LLM=1 is used.",
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
  if (Number.isNaN(DIAGNOSIS_TIMEOUT_MS) || DIAGNOSIS_TIMEOUT_MS <= 0) {
    throw new Error(
      `Invalid DIAGNOSIS_TIMEOUT_MS: ${process.env.DIAGNOSIS_TIMEOUT_MS}. Must be a positive number.`,
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
  if (Number.isNaN(RATE_LIMIT_MAX_ENTRIES) || RATE_LIMIT_MAX_ENTRIES <= 0) {
    throw new Error(
      `Invalid RATE_LIMIT_MAX_ENTRIES: ${process.env.RATE_LIMIT_MAX_ENTRIES}. Must be a positive number.`,
    );
  }
  if (Number.isNaN(MAX_CONCURRENT_WORKFLOWS) || MAX_CONCURRENT_WORKFLOWS <= 0) {
    throw new Error(
      `Invalid MAX_CONCURRENT_WORKFLOWS: ${process.env.MAX_CONCURRENT_WORKFLOWS}. Must be a positive number.`,
    );
  }
  if (
    Number.isNaN(MAX_SPECIALIST_CONCURRENCY) ||
    MAX_SPECIALIST_CONCURRENCY <= 0
  ) {
    throw new Error(
      `Invalid MAX_SPECIALIST_CONCURRENCY: ${process.env.MAX_SPECIALIST_CONCURRENCY}. Must be a positive number.`,
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
  if (Number.isNaN(CMO_CONTEXT_MAX_CHARS) || CMO_CONTEXT_MAX_CHARS <= 0) {
    throw new Error(
      `Invalid CMO_CONTEXT_MAX_CHARS: ${process.env.CMO_CONTEXT_MAX_CHARS}. Must be a positive number.`,
    );
  }
  if (Number.isNaN(AUDIT_LOG_MAX_SIZE_MB) || AUDIT_LOG_MAX_SIZE_MB <= 0) {
    throw new Error(
      `Invalid AUDIT_LOG_MAX_SIZE_MB: ${process.env.AUDIT_LOG_MAX_SIZE_MB}. Must be a positive number.`,
    );
  }
  if (Number.isNaN(AUDIT_LOG_MAX_FILES) || AUDIT_LOG_MAX_FILES < 0) {
    throw new Error(
      `Invalid AUDIT_LOG_MAX_FILES: ${process.env.AUDIT_LOG_MAX_FILES}. Must be a non-negative number.`,
    );
  }
  if (
    Number.isNaN(AUDIT_LOG_RETENTION_HOURS) ||
    AUDIT_LOG_RETENTION_HOURS <= 0
  ) {
    throw new Error(
      `Invalid AUDIT_LOG_RETENTION_HOURS: ${process.env.AUDIT_LOG_RETENTION_HOURS}. Must be a positive number.`,
    );
  }
  if (Number.isNaN(JOB_TTL_MS) || JOB_TTL_MS <= 0) {
    throw new Error(
      `Invalid JOB_TTL_MS: ${process.env.JOB_TTL_MS}. Must be a positive number.`,
    );
  }
  if (JOB_TTL_MS < DIAGNOSIS_TIMEOUT_MS) {
    throw new Error(
      `JOB_TTL_MS (${JOB_TTL_MS}) must be greater than or equal to DIAGNOSIS_TIMEOUT_MS (${DIAGNOSIS_TIMEOUT_MS}) so terminal results remain retrievable after a workflow that runs to its full timeout. Raise JOB_TTL_MS to at least ${DIAGNOSIS_TIMEOUT_MS}.`,
    );
  }
  if (Number.isNaN(PENDING_JOB_TIMEOUT_MS) || PENDING_JOB_TIMEOUT_MS <= 0) {
    throw new Error(
      `Invalid PENDING_JOB_TIMEOUT_MS: ${process.env.PENDING_JOB_TIMEOUT_MS}. Must be a positive number.`,
    );
  }
  if (PENDING_JOB_TIMEOUT_MS < DIAGNOSIS_TIMEOUT_MS) {
    throw new Error(
      `PENDING_JOB_TIMEOUT_MS (${PENDING_JOB_TIMEOUT_MS}) must be greater than or equal to DIAGNOSIS_TIMEOUT_MS (${DIAGNOSIS_TIMEOUT_MS}) so a workflow running to its full timeout is not failed prematurely. Raise PENDING_JOB_TIMEOUT_MS to at least ${DIAGNOSIS_TIMEOUT_MS}.`,
    );
  }
  if (Number.isNaN(TOOL_CACHE_TTL_MS) || TOOL_CACHE_TTL_MS < 0) {
    throw new Error(
      `Invalid TOOL_CACHE_TTL_MS: ${process.env.TOOL_CACHE_TTL_MS}. Must be a non-negative number. Set to 0 to disable tool caching.`,
    );
  }
}
