/**
 * Production server assembly.
 *
 * Wires the composition seam (createComposedRoutes, createWebSocketHandlers,
 * createLifecycle) with production dependencies. This is the single
 * authoritative assembly point — tests exercise the same factories with
 * injected dependencies.
 *
 * Importing this module alone does not open a database, create an audit
 * logger, initialize a cache, register timers/signals, or listen on a port.
 * Construction and start/stop operations only run when invoked.
 */

import appHtml from "../../index.html";
import { loadConfig, type AppConfig } from "./app-config";
import { JobStore } from "./progress-store";
import { RateLimiter } from "./utils/rate-limiter";
import { createTokenService } from "./token-service";
import {
  createComposedRoutes,
  createWebSocketHandlers,
  createLifecycle,
  type CompositionDependencies,
  type ServerAdapter,
  type TimerOps,
  type LifecycleHandle,
} from "./composition";
import { agentList } from "./agents/index";
import { mastra } from "./index";
import * as abortStore from "./utils/abort-controller-store";
import { getCacheStats } from "./tools/utils/tool-cache";
import { logger, getAuditLogger } from "./utils/logger";
import { initializeOrphadataCache } from "./orphadata-cache";
import {
  initToolCache,
  cleanupExpired as cleanupToolCache,
} from "./tools/utils/tool-cache";
import { validateSpecialistIntegrity } from "./agents/specialist-integrity";
import type { ReportOutcome } from "../shared/report-outcome";
import type { WsData } from "./api/websocket";

export interface ProductionAssembly {
  config: Readonly<AppConfig>;
  routes: Record<string, unknown>;
  websocketHandlers: ReturnType<typeof createWebSocketHandlers>;
  lifecycle: LifecycleHandle;
  jobStore: JobStore;
  rateLimiter: RateLimiter;
  serverAdapter: ServerAdapter;
}

export function createProductionAssembly(
  env: Record<string, string | undefined>,
): ProductionAssembly {
  const config = loadConfig(env);

  const specialistCount = validateSpecialistIntegrity();
  logger.info("specialist_registry_validated", { specialistCount });

  const jobStore = new JobStore(config.dbPath);
  const rateLimiter = new RateLimiter({
    maxRequests: config.rateLimitMaxRequests,
    windowMs: config.rateLimitWindowMs,
    maxConcurrent: config.maxConcurrentWorkflows,
    maxEntries: config.rateLimitMaxEntries,
  });
  const tokenService = createTokenService({
    secret: config.wsTokenSecret,
    jobTtlMs: config.jobTtlMs,
  });

  const abortStoreObj = {
    _map: new Map<string, AbortController>(),
    set(id: string, c: AbortController) {
      this._map.set(id, c);
    },
    get(id: string) {
      return this._map.get(id);
    },
    remove(id: string) {
      this._map.delete(id);
    },
  };

  const deps: CompositionDependencies = {
    config,
    jobStore: jobStore as unknown as CompositionDependencies["jobStore"],
    abortStore:
      abortStoreObj as unknown as CompositionDependencies["abortStore"],
    rateLimiter,
    tokenService,
    workflowFactory: {
      async createRun(jobId: string) {
        const workflow = mastra.getWorkflow("diagnosticWorkflow");
        return workflow.createRun({
          runId: jobId,
        }) as unknown as import("./composition").WorkflowRun;
      },
    },
    cacheStatus: {
      enabled: config.toolCacheEnabled,
      getStats: () => getCacheStats(),
    },
    logger: logger as unknown as CompositionDependencies["logger"],
    clock: { now: () => Date.now() },
    idSource: { newJobId: () => crypto.randomUUID() },
    agentList: () => agentList,
    appHtml,
  };

  // Mutable server adapter — updated after Bun.serve creates the server.
  // Routes capture this object by reference, so mutations are visible.
  const serverAdapter: ServerAdapter = {
    upgrade: () => false,
    requestIP: () => null,
  };

  const routes = createComposedRoutes(deps, serverAdapter);

  const realTimers: TimerOps = {
    setInterval,
    setTimeout,
    clearInterval,
    clearTimeout,
  };

  const websocketHandlers = createWebSocketHandlers({
    jobStore: jobStore as unknown as Parameters<
      typeof createWebSocketHandlers
    >[0]["jobStore"],
    timers: realTimers,
  });

  const intervals: Array<ReturnType<typeof setInterval>> = [];

  const lifecycle = createLifecycle({
    config,
    jobStore,
    rateLimiter,
    server: { stop: () => {} },
    activeWorkflows: () => rateLimiter.activeWorkflows,
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    shutdownTimeoutMs: 30_000,
    exit: (code: number) => process.exit(code),
    timers: { ...realTimers, intervals },
    orphadataEnabled: config.orphadataEnabled,
    toolCacheEnabled: config.toolCacheEnabled,
    jobTtlMs: config.jobTtlMs,
    pendingJobTimeoutMs: config.pendingJobTimeoutMs,
    initializeOrphadata: config.orphadataEnabled
      ? () => initializeOrphadataCache()
      : undefined,
    initializeToolCache: config.toolCacheEnabled
      ? () => initToolCache()
      : undefined,
    stopBackground: () => {
      for (const timer of intervals) clearInterval(timer);
      cleanupToolCache();
    },
  });

  return {
    config,
    routes,
    websocketHandlers,
    lifecycle,
    jobStore,
    rateLimiter,
    serverAdapter,
  };
}
