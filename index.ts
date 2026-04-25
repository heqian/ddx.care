import appHtml from "./index.html";
import { progressStore } from "./src/backend/progress-store";
import { createRoutes, rateLimiter } from "./src/backend/api/routes";
import { websocketHandlers, type WsData } from "./src/backend/api/websocket";
import {
  PORT,
  JOB_TTL_MS,
  CLEANUP_INTERVAL_MS,
  RATE_LIMIT_PRUNE_INTERVAL_MS,
  validateConfig,
} from "./src/backend/config";

validateConfig();

const cleanupTimer = setInterval(() => {
  progressStore.cleanupExpired(JOB_TTL_MS);
}, CLEANUP_INTERVAL_MS);

const pruneTimer = setInterval(() => {
  rateLimiter.prune();
}, RATE_LIMIT_PRUNE_INTERVAL_MS);

let server: ReturnType<typeof Bun.serve>;

server = Bun.serve<WsData>({
  port: PORT,
  routes: createRoutes(
    { 
      upgrade: (req, opts) => server.upgrade(req, opts!),
      requestIP: (req: Request) => server.requestIP(req)
    },
    appHtml,
  ),
  websocket: websocketHandlers,
  ...(process.env.NODE_ENV !== "production" ? {
    development: {
      hmr: true,
      console: true,
    },
  } : {}),
});

export { server };

console.log("ddx.care API server running on port " + server.port);

// --- Graceful shutdown ---
const SHUTDOWN_TIMEOUT_MS = 30_000;

async function shutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  // 1. Stop accepting new connections
  server.stop();

  // 2. Clear cleanup intervals
  clearInterval(cleanupTimer);
  clearInterval(pruneTimer);

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
