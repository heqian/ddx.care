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
  validateConfig,
} from "./src/backend/config";
import { logger, getAuditLogger } from "./src/backend/utils/logger";
import { initializeOrphadataCache } from "./src/backend/orphadata-cache";
import {
  initToolCache,
  cleanupExpired as cleanupToolCache,
} from "./src/backend/tools/utils/tool-cache";

validateConfig();

progressStore.markStalePending();

if (ORPHADATA_ENABLED) {
  initializeOrphadataCache().catch(() => {});
}

if (TOOL_CACHE_ENABLED) {
  initToolCache();
}

const cleanupTimer = setInterval(() => {
  progressStore.cleanupExpired(JOB_TTL_MS);
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

async function shutdown(signal: string) {
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
