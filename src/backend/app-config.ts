/**
 * Immutable configuration value and loader.
 *
 * The loader can be built from explicit environment input and validated
 * without cache-busting imports or process-global mutation in tests. Tests
 * build a config value from an explicit env record and pass it to the
 * injected route/WebSocket/lifecycle seams, rather than mutating
 * `process.env` and re-importing the singleton config module.
 *
 * The legacy `src/backend/config.ts` continues to read `process.env` at
 * import time for the production entrypoint. This module exposes the same
 * values as an immutable record plus a validator that does not touch the
 * process environment.
 */

export interface AppConfig {
  readonly port: number;
  readonly allowedOrigins: string;
  readonly trustedOrigins: string;
  readonly wsTokenSecret: string;
  readonly jobTtlMs: number;
  readonly cleanupIntervalMs: number;
  readonly rateLimitPruneIntervalMs: number;
  readonly rateLimitMaxEntries: number;
  readonly specialistModel: string;
  readonly orchestratorModel: string;
  readonly diagnosisTimeoutMs: number;
  readonly pendingJobTimeoutMs: number;
  readonly maxDiagnosisRounds: number;
  readonly rateLimitMaxRequests: number;
  readonly rateLimitWindowMs: number;
  readonly maxConcurrentWorkflows: number;
  readonly maxSpecialistConcurrency: number;
  readonly maxInputFieldLength: number;
  readonly maxPayloadBytes: number;
  readonly agentGenerateMaxRetries: number;
  readonly agentGenerateRetryBaseDelay: number;
  readonly specialistContextMode:
    | "none"
    | "prior_rounds"
    | "cmo_curated"
    | "full";
  readonly specialistContextMaxChars: number;
  readonly cmoContextMaxChars: number;
  readonly orphadataEnabled: boolean;
  readonly toolCacheTtlMs: number;
  readonly toolCacheEnabled: boolean;
  readonly toolCacheDbPath: string;
  readonly toolCacheCleanupIntervalMs: number;
  readonly auditLogPath: string;
  readonly auditLogMaxSizeMb: number;
  readonly auditLogMaxFiles: number;
  readonly auditLogRetentionHours: number;
  readonly auditLogRedactToolArgs: boolean;
  readonly mockLlm: boolean;
  readonly ollamaApiKey: string;
  readonly dbPath: string;
  readonly orphadataDbPath: string;
}

export type EnvRecord = Record<string, string | undefined>;

function parseInt(env: EnvRecord, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  // Preserve NaN so validateBuiltConfig rejects invalid values rather than
  // silently replacing them with the fallback.
  return Number.isNaN(n) ? NaN : n;
}

function parseBool(env: EnvRecord, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined) return fallback;
  return raw !== "0";
}

function parseContextMode(
  env: EnvRecord,
  key: string,
  fallback: AppConfig["specialistContextMode"],
): AppConfig["specialistContextMode"] {
  const raw = env[key] ?? fallback;
  const valid = ["none", "prior_rounds", "cmo_curated", "full"] as const;
  return (valid as readonly string[]).includes(raw)
    ? (raw as AppConfig["specialistContextMode"])
    : fallback;
}

export function buildConfig(env: EnvRecord = process.env): AppConfig {
  const port = parseInt(env, "PORT", 3000);
  const diagnosisTimeoutMs = parseInt(env, "DIAGNOSIS_TIMEOUT_MS", 900_000);
  const jobTtlMs = parseInt(env, "JOB_TTL_MS", 60 * 60 * 1000);
  const pendingJobTimeoutMs = parseInt(
    env,
    "PENDING_JOB_TIMEOUT_MS",
    diagnosisTimeoutMs + 120_000,
  );
  const toolCacheTtlMs = parseInt(
    env,
    "TOOL_CACHE_TTL_MS",
    24 * 60 * 60 * 1000,
  );
  return {
    port,
    allowedOrigins: env.ALLOWED_ORIGINS ?? "*",
    trustedOrigins: env.TRUSTED_ORIGINS ?? "",
    wsTokenSecret: env.WS_TOKEN_SECRET ?? "",
    jobTtlMs,
    cleanupIntervalMs: 5 * 60 * 1000,
    rateLimitPruneIntervalMs: 10 * 60 * 1000,
    rateLimitMaxEntries: parseInt(env, "RATE_LIMIT_MAX_ENTRIES", 10_000),
    specialistModel: env.SPECIALIST_MODEL ?? "ollama-cloud/gemma4:31b",
    orchestratorModel: env.ORCHESTRATOR_MODEL ?? "ollama-cloud/gemma4:31b",
    diagnosisTimeoutMs,
    pendingJobTimeoutMs,
    maxDiagnosisRounds: parseInt(env, "MAX_DIAGNOSIS_ROUNDS", 3),
    rateLimitMaxRequests: parseInt(env, "RATE_LIMIT_MAX_REQUESTS", 10),
    rateLimitWindowMs: parseInt(env, "RATE_LIMIT_WINDOW_MS", 60_000),
    maxConcurrentWorkflows: parseInt(env, "MAX_CONCURRENT_WORKFLOWS", 3),
    maxSpecialistConcurrency: parseInt(env, "MAX_SPECIALIST_CONCURRENCY", 1),
    maxInputFieldLength: 50_000,
    maxPayloadBytes: 1_000_000,
    agentGenerateMaxRetries: parseInt(env, "AGENT_GENERATE_MAX_RETRIES", 3),
    agentGenerateRetryBaseDelay: 1000,
    specialistContextMode: parseContextMode(
      env,
      "SPECIALIST_CONTEXT_MODE",
      "prior_rounds",
    ),
    specialistContextMaxChars: parseInt(
      env,
      "SPECIALIST_CONTEXT_MAX_CHARS",
      2000,
    ),
    cmoContextMaxChars: parseInt(env, "CMO_CONTEXT_MAX_CHARS", 60_000),
    orphadataEnabled: parseBool(env, "ORPHADATA_ENABLED", true),
    toolCacheTtlMs,
    toolCacheEnabled: toolCacheTtlMs > 0,
    toolCacheDbPath: env.TOOL_CACHE_DB_PATH || "tool-cache.sqlite",
    toolCacheCleanupIntervalMs: 10 * 60 * 1000,
    auditLogPath: env.AUDIT_LOG_PATH ?? "",
    auditLogMaxSizeMb: parseInt(env, "AUDIT_LOG_MAX_SIZE_MB", 10),
    auditLogMaxFiles: parseInt(env, "AUDIT_LOG_MAX_FILES", 5),
    auditLogRetentionHours: parseInt(env, "AUDIT_LOG_RETENTION_HOURS", 168),
    auditLogRedactToolArgs: parseBool(env, "AUDIT_LOG_REDACT_TOOL_ARGS", true),
    mockLlm: env.MOCK_LLM === "1",
    ollamaApiKey: env.OLLAMA_API_KEY ?? "",
    dbPath: env.DB_PATH || "jobs.sqlite",
    orphadataDbPath: env.ORPHADATA_DB_PATH || "orphadata.sqlite",
  };
}

export function validateBuiltConfig(cfg: AppConfig): void {
  const mustBePositive: Array<[string, number]> = [
    ["PORT", cfg.port],
    ["MAX_DIAGNOSIS_ROUNDS", cfg.maxDiagnosisRounds],
    ["DIAGNOSIS_TIMEOUT_MS", cfg.diagnosisTimeoutMs],
    ["RATE_LIMIT_MAX_REQUESTS", cfg.rateLimitMaxRequests],
    ["RATE_LIMIT_WINDOW_MS", cfg.rateLimitWindowMs],
    ["RATE_LIMIT_MAX_ENTRIES", cfg.rateLimitMaxEntries],
    ["MAX_CONCURRENT_WORKFLOWS", cfg.maxConcurrentWorkflows],
    ["MAX_SPECIALIST_CONCURRENCY", cfg.maxSpecialistConcurrency],
    ["SPECIALIST_CONTEXT_MAX_CHARS", cfg.specialistContextMaxChars],
    ["CMO_CONTEXT_MAX_CHARS", cfg.cmoContextMaxChars],
    ["AUDIT_LOG_MAX_SIZE_MB", cfg.auditLogMaxSizeMb],
    ["AUDIT_LOG_RETENTION_HOURS", cfg.auditLogRetentionHours],
    ["JOB_TTL_MS", cfg.jobTtlMs],
    ["PENDING_JOB_TIMEOUT_MS", cfg.pendingJobTimeoutMs],
  ];
  for (const [name, value] of mustBePositive) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid ${name}: must be a positive number.`);
    }
  }
  if (cfg.port > 65535) {
    throw new Error("Invalid PORT: must be between 1 and 65535.");
  }
  if (cfg.auditLogMaxFiles < 0) {
    throw new Error("Invalid AUDIT_LOG_MAX_FILES: must be non-negative.");
  }
  if (cfg.toolCacheTtlMs < 0) {
    throw new Error(
      "Invalid TOOL_CACHE_TTL_MS: must be non-negative. Set to 0 to disable.",
    );
  }
  if (cfg.agentGenerateMaxRetries < 0) {
    throw new Error(
      "Invalid AGENT_GENERATE_MAX_RETRIES: must be non-negative.",
    );
  }
  if (cfg.jobTtlMs < cfg.diagnosisTimeoutMs) {
    throw new Error(
      `JOB_TTL_MS (${cfg.jobTtlMs}) must be >= DIAGNOSIS_TIMEOUT_MS (${cfg.diagnosisTimeoutMs}).`,
    );
  }
  if (cfg.pendingJobTimeoutMs < cfg.diagnosisTimeoutMs) {
    throw new Error(
      `PENDING_JOB_TIMEOUT_MS (${cfg.pendingJobTimeoutMs}) must be >= DIAGNOSIS_TIMEOUT_MS (${cfg.diagnosisTimeoutMs}).`,
    );
  }
  if (!cfg.ollamaApiKey && !cfg.mockLlm) {
    throw new Error(
      "Missing OLLAMA_API_KEY environment variable. It must be set unless MOCK_LLM=1 is used.",
    );
  }
}

/**
 * Load, validate, and freeze a configuration from an explicit environment
 * record. This is the authoritative entry point for production and tests.
 * It never reads `process.env` internally.
 */
export function loadConfig(env: EnvRecord): Readonly<AppConfig> {
  const cfg = buildConfig(env);
  validateBuiltConfig(cfg);
  return Object.freeze(cfg);
}
