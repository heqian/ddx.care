import appHtml from "./index.html";
import { createProductionAssembly } from "./src/backend/production";
import { logger, getAuditLogger } from "./src/backend/utils/logger";
import {
  CLEANUP_INTERVAL_MS,
  RATE_LIMIT_PRUNE_INTERVAL_MS,
  TOOL_CACHE_CLEANUP_INTERVAL_MS,
  AUDIT_LOG_PATH,
  AUDIT_LOG_RETENTION_HOURS,
  PENDING_JOB_TIMEOUT_MS,
  JOB_TTL_MS,
} from "./src/backend/config";
import type { WsData } from "./src/backend/api/websocket";

// Build the production assembly from the current environment.
// This uses loadConfig() internally and validates before anything else.
const assembly = createProductionAssembly(process.env);
const {
  config,
  routes,
  websocketHandlers,
  lifecycle,
  jobStore,
  rateLimiter,
  serverAdapter,
} = assembly;

// --- Startup lifecycle (runs before listen) ---
// markStalePending + cleanupExpired + Orphadata + tool-cache init
await lifecycle.startup();

// --- Recurring intervals (created after successful startup) ---
const cleanupTimer = setInterval(() => {
  jobStore.cleanupExpired(JOB_TTL_MS);
  jobStore.timeoutPending(PENDING_JOB_TIMEOUT_MS);
}, CLEANUP_INTERVAL_MS);

const pruneTimer = setInterval(() => {
  rateLimiter.prune();
}, RATE_LIMIT_PRUNE_INTERVAL_MS);

const toolCacheCleanupTimer = setInterval(() => {
  // cleanupToolCache is already called by lifecycle.stopBackground on shutdown,
  // but the recurring cleanup is still needed during operation.
  // The lifecycle owns the interval list for shutdown; this is the production
  // recurring side effect.
  import("./src/backend/tools/utils/tool-cache").then(({ cleanupExpired }) =>
    cleanupExpired(),
  );
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

// --- Server ---
// The server adapter is mutable — updated after Bun.serve creates the server.
// Routes already captured this object by reference.

let server: ReturnType<typeof Bun.serve<WsData>>;

const serveOptions = {
  port: config.port,
  maxRequestBodySize: config.maxPayloadBytes,
  routes: routes as Record<string, unknown>,
  websocket: websocketHandlers,
  ...(process.env.NODE_ENV !== "production"
    ? {
        development: {
          hmr: true as const,
          console: true,
        },
      }
    : {}),
};

server = Bun.serve<WsData>(
  serveOptions as unknown as Parameters<typeof Bun.serve<WsData>>[0],
);

// Wire the server adapter now that the server exists.
serverAdapter.upgrade = (req: Request, opts: { data: unknown }) =>
  server.upgrade(req, opts as unknown as Parameters<typeof server.upgrade>[1]);
serverAdapter.requestIP = (req: Request) => server.requestIP(req);

export { server };

// Export the production rate limiter so integration tests can reset its
// state. This is the same instance the server uses for rate limiting.
export { rateLimiter };

logger.info("server_start", {
  port: server.port,
  specialistModel: config.specialistModel,
  orchestratorModel: config.orchestratorModel,
  mockLlm: config.mockLlm,
  contextMode: config.specialistContextMode,
  maxRounds: config.maxDiagnosisRounds,
  maxConcurrent: config.maxConcurrentWorkflows,
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
