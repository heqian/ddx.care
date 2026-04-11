import appHtml from "./index.html";
import { progressStore } from "./src/backend/progress-store";
import { createRoutes } from "./src/backend/api/routes";
import { websocketHandlers, type WsData } from "./src/backend/api/websocket";

const JOB_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

setInterval(() => {
  progressStore.cleanupExpired(JOB_TTL_MS);
}, CLEANUP_INTERVAL_MS);

let server: ReturnType<typeof Bun.serve>;

server = Bun.serve<WsData>({
  port: process.env.PORT ?? 3000,
  routes: createRoutes({ upgrade: (req, opts) => server.upgrade(req, opts!) }, appHtml),
  websocket: websocketHandlers,
  development: {
    hmr: true,
    console: true,
  },
});

export { server };

console.log("ddx.care API server running on port " + server.port);
