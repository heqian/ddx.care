import appHtml from "./index.html";
import { progressStore } from "./src/backend/progress-store";
import { createRoutes, rateLimiter } from "./src/backend/api/routes";
import { websocketHandlers, type WsData } from "./src/backend/api/websocket";
import { PORT, JOB_TTL_MS } from "./src/backend/config";

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const RATE_LIMIT_PRUNE_INTERVAL_MS = 10 * 60 * 1000;

setInterval(() => {
  progressStore.cleanupExpired(JOB_TTL_MS);
}, CLEANUP_INTERVAL_MS);

setInterval(() => {
  rateLimiter.prune();
}, RATE_LIMIT_PRUNE_INTERVAL_MS);

let server: ReturnType<typeof Bun.serve>;

server = Bun.serve<WsData>({
  port: PORT,
  routes: createRoutes({ upgrade: (req, opts) => server.upgrade(req, opts!) }, appHtml),
  websocket: websocketHandlers,
  development: {
    hmr: true,
    console: true,
  },
});

export { server };

console.log("ddx.care API server running on port " + server.port);
