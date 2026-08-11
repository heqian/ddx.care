/**
 * Compatibility facade over app-config.ts.
 *
 * Production code imports named constants from this module. The authoritative
 * parsing, validation, and freezing logic lives in `app-config.ts`. This
 * module builds one config from `process.env` at import time and re-exports
 * its fields as named constants.
 *
 * Tests should use `buildConfig()` or `loadConfig()` from `app-config.ts`
 * directly with an explicit environment record, rather than mutating
 * `process.env` and re-importing this module.
 */

import { buildConfig, validateBuiltConfig, type AppConfig } from "./app-config";

const _cfg: AppConfig = buildConfig(process.env);

export const PORT = _cfg.port;
export const ALLOWED_ORIGINS = _cfg.allowedOrigins;
export const TRUSTED_ORIGINS = _cfg.trustedOrigins;
export const WS_TOKEN_SECRET = _cfg.wsTokenSecret;
export const JOB_TTL_MS = _cfg.jobTtlMs;
export const CLEANUP_INTERVAL_MS = _cfg.cleanupIntervalMs;
export const RATE_LIMIT_PRUNE_INTERVAL_MS = _cfg.rateLimitPruneIntervalMs;
export const RATE_LIMIT_MAX_ENTRIES = _cfg.rateLimitMaxEntries;
export const SPECIALIST_MODEL = _cfg.specialistModel;
export const ORCHESTRATOR_MODEL = _cfg.orchestratorModel;
export const DIAGNOSIS_TIMEOUT_MS = _cfg.diagnosisTimeoutMs;
export const PENDING_JOB_TIMEOUT_MS = _cfg.pendingJobTimeoutMs;
export const MAX_DIAGNOSIS_ROUNDS = _cfg.maxDiagnosisRounds;
export const RATE_LIMIT_MAX_REQUESTS = _cfg.rateLimitMaxRequests;
export const RATE_LIMIT_WINDOW_MS = _cfg.rateLimitWindowMs;
export const MAX_CONCURRENT_WORKFLOWS = _cfg.maxConcurrentWorkflows;
export const MAX_SPECIALIST_CONCURRENCY = _cfg.maxSpecialistConcurrency;
export const MAX_INPUT_FIELD_LENGTH = _cfg.maxInputFieldLength;
export const MAX_PAYLOAD_BYTES = _cfg.maxPayloadBytes;
export const AGENT_GENERATE_MAX_RETRIES = _cfg.agentGenerateMaxRetries;
export const AGENT_GENERATE_RETRY_BASE_DELAY = _cfg.agentGenerateRetryBaseDelay;
export const SPECIALIST_CONTEXT_MODE = _cfg.specialistContextMode;
export const SPECIALIST_CONTEXT_MAX_CHARS = _cfg.specialistContextMaxChars;
export const CMO_CONTEXT_MAX_CHARS = _cfg.cmoContextMaxChars;
export const ORPHADATA_ENABLED = _cfg.orphadataEnabled;
export const TOOL_CACHE_TTL_MS = _cfg.toolCacheTtlMs;
export const TOOL_CACHE_ENABLED = _cfg.toolCacheEnabled;
export const TOOL_CACHE_DB_PATH = _cfg.toolCacheDbPath;
export const TOOL_CACHE_CLEANUP_INTERVAL_MS = _cfg.toolCacheCleanupIntervalMs;
export const AUDIT_LOG_PATH = _cfg.auditLogPath;
export const AUDIT_LOG_MAX_SIZE_MB = _cfg.auditLogMaxSizeMb;
export const AUDIT_LOG_MAX_FILES = _cfg.auditLogMaxFiles;
export const AUDIT_LOG_RETENTION_HOURS = _cfg.auditLogRetentionHours;
export const AUDIT_LOG_REDACT_TOOL_ARGS = _cfg.auditLogRedactToolArgs;
export const DB_PATH = _cfg.dbPath;
export const ORPHADATA_DB_PATH = _cfg.orphadataDbPath;

export function validateConfig(): void {
  // Validate the import-time cached configuration. Tests that need to
  // validate a different environment should use buildConfig() +
  // validateBuiltConfig() from app-config.ts with an explicit env record.
  validateBuiltConfig(_cfg);
}

export { buildConfig, validateBuiltConfig, loadConfig } from "./app-config";
export type { AppConfig, EnvRecord } from "./app-config";
