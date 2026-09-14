import appHtml from "./index.html";
import { progressStore } from "./src/backend/progress-store";
import { createRoutes, rateLimiter } from "./src/backend/api/routes";
import { websocketHandlers, type WsData } from "./src/backend/api/websocket";
import {
  PORT,
  JOB_TTL_MS,
  CLEANUP_INTERVAL_MS,
  RATE_LIMIT_PRUNE_INTERVAL_MS,
  SPECIALIST_MODEL,
  ORCHESTRATOR_MODEL,
  SPECIALIST_CONTEXT_MODE,
  MAX_DIAGNOSIS_ROUNDS,
  MAX_CONCURRENT_WORKFLOWS,
  ORPHADATA_ENABLED,
  TOOL_CACHE_ENABLED,
  TOOL_CACHE_CLEANUP_INTERVAL_MS,
  MAX_PAYLOAD_BYTES,
  AUDIT_LOG_PATH,
  AUDIT_LOG_RETENTION_HOURS,
  PENDING_JOB_TIMEOUT_MS,
  WS_TOKEN_SECRET,
  validateConfig,
} from "./src/backend/config";
import { logger, getAuditLogger } from "./src/backend/utils/logger";
import { initializeOrphadataCache } from "./src/backend/orphadata-cache";
import {
  initToolCache,
  cleanupExpired as cleanupToolCache,
} from "./src/backend/tools/utils/tool-cache";
import { validateSpecialistIntegrity } from "./src/backend/agents/specialist-integrity";

validateConfig();
if (process.env.NODE_ENV === "production" && !WS_TOKEN_SECRET) {
  logger.error("ws_token_secret_missing", {
    message:
      "WS_TOKEN_SECRET is empty in production. Job credentials are NOT enforced: " +
      "anyone who obtains a job ID can read its PHI-bearing results via " +
      "GET /v1/status/:jobId and /ws. Only the reverse-proxy auth layer " +
      "(if any) protects job data. Set WS_TOKEN_SECRET to enable per-job tokens.",
  });
}
const specialistCount = validateSpecialistIntegrity();
logger.info("specialist_registry_validated", { specialistCount });

progressStore.markStalePending();
// Remove terminal jobs that expired during downtime before serving requests,
// so PHI-derived results/errors are not exposed past the retention boundary.
progressStore.cleanupExpired(JOB_TTL_MS);

if (ORPHADATA_ENABLED) {
  // Await before serving so tools never query a partially populated disease
  // table. Failures are logged (not fatal) — tools then degrade gracefully.
  await initializeOrphadataCache().catch((error: unknown) => {
    logger.error("orphadata_init_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

if (TOOL_CACHE_ENABLED) {
  initToolCache();
}

const cleanupTimer = setInterval(() => {
  progressStore.cleanupExpired(JOB_TTL_MS);
  progressStore.timeoutPending(PENDING_JOB_TIMEOUT_MS);
}, CLEANUP_INTERVAL_MS);

const pruneTimer = setInterval(() => {
  rateLimiter.prune();
}, RATE_LIMIT_PRUNE_INTERVAL_MS);

const toolCacheCleanupTimer = setInterval(() => {
  cleanupToolCache();
}, TOOL_CACHE_CLEANUP_INTERVAL_MS);

const auditPurgeTimer = AUDIT_LOG_PATH
  ? setInterval(
      () => {
        const audit = getAuditLogger();
        if (audit) {
          audit.purgeOlderThan(AUDIT_LOG_RETENTION_HOURS);
        }
      },
      Math.max(
        60 * 60 * 1000,
        Math.floor((AUDIT_LOG_RETENTION_HOURS * 60 * 60 * 1000) / 4),
      ),
    )
  : null;

let server: ReturnType<typeof Bun.serve>;

server = Bun.serve<WsData>({
  port: PORT,
  maxRequestBodySize: MAX_PAYLOAD_BYTES,
  routes: createRoutes(
    {
      upgrade: (req, opts) => server.upgrade(req, opts!),
      requestIP: (req: Request) => server.requestIP(req),
    },
    appHtml,
  ),
  websocket: websocketHandlers,
  ...(process.env.NODE_ENV !== "production"
    ? {
        development: {
          hmr: true,
          console: true,
        },
      }
    : {}),
});

export { server };

logger.info("server_start", {
  port: server.port,
  specialistModel: SPECIALIST_MODEL,
  orchestratorModel: ORCHESTRATOR_MODEL,
  mockLlm: process.env.MOCK_LLM === "1",
  contextMode: SPECIALIST_CONTEXT_MODE,
  maxRounds: MAX_DIAGNOSIS_ROUNDS,
  maxConcurrent: MAX_CONCURRENT_WORKFLOWS,
});

// --- Graceful shutdown ---
const SHUTDOWN_TIMEOUT_MS = 30_000;
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return; // Ignore repeat signals during drain
  shuttingDown = true;
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  // 1. Stop accepting new connections
  server.stop();

  // 2. Clear cleanup intervals
  clearInterval(cleanupTimer);
  clearInterval(pruneTimer);
  clearInterval(toolCacheCleanupTimer);
  if (auditPurgeTimer) clearInterval(auditPurgeTimer);

  // 3. Wait for in-flight workflows to finish (with timeout)
  const start = Date.now();
  while (rateLimiter.activeWorkflows > 0) {
    if (Date.now() - start > SHUTDOWN_TIMEOUT_MS) {
      console.warn(
        `Shutdown timeout reached with ${rateLimiter.activeWorkflows} workflow(s) still in progress. Forcing exit.`,
      );
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("Shutdown complete.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
