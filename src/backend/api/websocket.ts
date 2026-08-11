import type { ServerWebSocket } from "bun";
import { progressStore } from "../progress-store";
import { createWebSocketHandlers } from "../composition";
import type { TimerOps } from "../composition";

const PING_INTERVAL_MS = 30000;
const PONG_TIMEOUT_MS = 10000;

export interface WsData {
  jobId: string;
  unsubscribe?: () => void;
  pingTimer?: ReturnType<typeof setInterval>;
  pongTimer?: ReturnType<typeof setTimeout>;
}

const realTimers: TimerOps = {
  setInterval,
  setTimeout,
  clearInterval,
  clearTimeout,
};

/**
 * Production WebSocket handlers. Constructed via the composition-seam
 * factory using the production singleton store and real timers. Tests use
 * `createWebSocketHandlers` directly with an injected in-memory or
 * temporary JobStore — never this singleton-backed export.
 */
export const websocketHandlers = createWebSocketHandlers({
  jobStore: progressStore,
  timers: realTimers,
  pingIntervalMs: PING_INTERVAL_MS,
  pongTimeoutMs: PONG_TIMEOUT_MS,
});
