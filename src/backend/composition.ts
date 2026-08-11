/**
 * Side-effect-free server/lifecycle composition module.
 *
 * Importing this module alone does NOT open a database, create an audit
 * logger, initialize a cache, register timers/signals, or listen on a port.
 * Construction and start/stop operations only run when invoked.
 *
 * This seam accepts an immutable config value and injected production
 * dependencies, so tests can invoke returned production handlers with
 * injected dependencies after the runner-owned environment is established.
 * Later, the sensitive-cache bootstrap can dynamically load and invoke this
 * seam without importing a side-effectful composition graph first.
 *
 * This change does NOT alter `index.ts`, set the process umask, or implement
 * the application `APP_DATA_DIR` resolver. `sensitive-cache-redaction`, applied
 * second, owns those semantics.
 */

import type { AppConfig } from "./app-config";
import type { JobStore, JobEntry, ProgressEvent } from "./progress-store";
import {
  reportOutcomeSchema,
  type ReportOutcome,
} from "../shared/report-outcome";
import type { RateLimiter } from "./utils/rate-limiter";
import { z } from "zod";

/** Minimal shape of the Bun server adapter the composition seam uses. */
export interface ServerAdapter {
  upgrade(req: Request, options: { data: unknown }): boolean;
  requestIP?(
    req: Request,
  ): { address: string; family: string; port: number } | null;
}

export interface WorkflowRun {
  start(options: { inputData: DiagnosisInput }): Promise<unknown>;
}

export interface DiagnosisInput {
  medicalHistory: string;
  conversationTranscript: string;
  labResults: string;
}

export interface RouteJobStore {
  createJob(jobId: string): void;
  getJob(jobId: string): JobEntry | undefined;
  complete(jobId: string, result: ReportOutcome): void;
  fail(jobId: string, error: string): void;
  healthCheck(): boolean;
  emitMessage(jobId: string, messageOrEvent: string | ProgressEvent): void;
  subscribe(jobId: string, cb: (data: unknown) => void): () => void;
}

export interface RouteAbortStore {
  set(jobId: string, controller: AbortController): void;
  get(jobId: string): AbortController | undefined;
  remove(jobId: string): void;
}

export interface TokenService {
  generateToken(jobId: string, ttlMs?: number, now?: number): string;
  verifyToken(jobId: string, token: string, now?: number): boolean;
  generateWsTicket(jobId: string, ttlSec?: number, now?: number): string;
  verifyWsTicket(jobId: string, ticket: string, now?: number): boolean;
}

export interface CacheStatusProvider {
  enabled: boolean;
  getStats(): { entries: number; hits: number; misses: number };
}

export interface WorkflowFactory {
  createRun(jobId: string): Promise<WorkflowRun>;
}

export interface Clock {
  now(): number;
}

export interface IdSource {
  newJobId(): string;
}

export interface LoggerLike {
  info(event: string, meta?: Record<string, unknown>): void;
  warn(event: string, meta?: Record<string, unknown>): void;
  error(event: string, meta?: Record<string, unknown>): void;
  request(
    method: string,
    path: string,
    status: number,
    durationMs: number,
    meta?: Record<string, unknown>,
  ): void;
  workflowStart(jobId: string): void;
  workflowComplete(
    jobId: string,
    durationMs: number,
    specialistCount?: number,
  ): void;
  workflowFail(jobId: string, durationMs: number, error: string): void;
}

export interface CompositionDependencies {
  config: AppConfig;
  jobStore: RouteJobStore;
  abortStore: RouteAbortStore;
  rateLimiter: RateLimiter;
  tokenService: TokenService;
  workflowFactory: WorkflowFactory;
  cacheStatus: CacheStatusProvider;
  logger: LoggerLike;
  clock: Clock;
  idSource: IdSource;
  /** Agent list provider (returns the public /v1/agents payload). */
  agentList: () => Array<{ id: string; name: string; description: string }>;
  /** AppHtml route value (Bun HTMLBundle). */
  appHtml: unknown;
}

/**
 * Build the production route table from injected dependencies. The returned
 * handlers exercise production behavior — no copied algorithms. Tests invoke
 * these handlers directly with injected dependencies.
 */
export function createComposedRoutes(
  deps: CompositionDependencies,
  server: ServerAdapter,
): Record<string, unknown> {
  const {
    config,
    jobStore,
    abortStore,
    rateLimiter,
    tokenService,
    workflowFactory,
    cacheStatus,
    logger,
    clock,
    idSource,
    agentList,
    appHtml,
  } = deps;

  const JOB_ID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const CSP_VALUE =
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'none'; " +
    "form-action 'self'; " +
    "object-src 'none'";

  function corsHeaders(req?: Request): Record<string, string> {
    const headers: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Security-Policy": CSP_VALUE,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    };
    if (config.trustedOrigins) {
      const allowed = config.trustedOrigins.split(",").map((o) => o.trim());
      const origin = req?.headers.get("origin") ?? "";
      if (allowed.includes(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
      }
      headers["Vary"] = "Origin";
    } else {
      headers["Access-Control-Allow-Origin"] = config.allowedOrigins;
    }
    return headers;
  }

  function withCors(response: Response, req?: Request): Response {
    const headers = corsHeaders(req);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
    return response;
  }

  function corsPreflightResponse(req?: Request): Response {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  function verifyJobToken(req: Request, jobId: string): Response | null {
    if (!config.wsTokenSecret) return null;
    const authHeader = req.headers.get("authorization") ?? "";
    let token: string | null = null;
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.slice(7).trim();
    }
    if (!token) {
      const url = new URL(req.url);
      token = url.searchParams.get("token");
    }
    if (!token || !tokenService.verifyToken(jobId, token)) {
      logger.warn("rest_token_rejected", { jobId });
      return withCors(
        Response.json({ error: "Invalid or missing token" }, { status: 403 }),
        req,
      );
    }
    return null;
  }

  function getClientIp(req: Request): string {
    const realIp = req.headers.get("x-real-ip");
    if (realIp) return realIp.trim();
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded.split(",");
      return parts[parts.length - 1].trim();
    }
    return server.requestIP?.(req)?.address || "unknown";
  }

  interface RouteRequest extends Request {
    params: Record<string, string>;
  }

  return {
    "/": appHtml,

    "/v1/diagnose": {
      OPTIONS: (req: Request) => corsPreflightResponse(req),
      POST: async (req: Request) => {
        const startTime = clock.now();
        const ip = getClientIp(req);

        const ipCheck = rateLimiter.check(ip);
        if (!ipCheck.allowed) {
          const retryAfter = Math.ceil(ipCheck.retryAfterMs / 1000);
          logger.request("POST", "/v1/diagnose", 429, clock.now() - startTime, {
            ip,
            reason: "rate_limited",
          });
          return withCors(
            Response.json(
              { error: "Rate limit exceeded. Please try again later." },
              { status: 429, headers: { "Retry-After": String(retryAfter) } },
            ),
            req,
          );
        }
        rateLimiter.record(ip);

        let body: unknown;
        const contentLength = parseInt(
          req.headers.get("content-length") ?? "0",
          10,
        );
        if (contentLength > config.maxPayloadBytes) {
          logger.request("POST", "/v1/diagnose", 413, clock.now() - startTime, {
            ip,
            contentLength,
          });
          return withCors(
            Response.json({ error: "Payload too large" }, { status: 413 }),
            req,
          );
        }
        try {
          body = await req.json();
        } catch {
          logger.request("POST", "/v1/diagnose", 400, clock.now() - startTime, {
            ip,
          });
          return withCors(
            Response.json({ error: "Invalid JSON body" }, { status: 400 }),
            req,
          );
        }

        // Inline the diagnosis validation against the immutable config value.
        const schema = z.object({
          medicalHistory: z.string().max(config.maxInputFieldLength),
          conversationTranscript: z.string().max(config.maxInputFieldLength),
          labResults: z.string().max(config.maxInputFieldLength),
        });
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          const issues = parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          logger.request("POST", "/v1/diagnose", 400, clock.now() - startTime, {
            ip,
            issues,
          });
          return withCors(
            Response.json(
              { error: `Validation failed: ${issues}` },
              { status: 400 },
            ),
            req,
          );
        }

        const { medicalHistory, conversationTranscript, labResults } =
          parsed.data;

        const jobId = idSource.newJobId();
        if (!rateLimiter.tryStartWorkflow(jobId)) {
          logger.request("POST", "/v1/diagnose", 429, clock.now() - startTime, {
            ip,
            reason: "at_capacity",
          });
          return withCors(
            Response.json(
              { error: "Server is at capacity. Please try again later." },
              { status: 429, headers: { "Retry-After": "30" } },
            ),
            req,
          );
        }

        let jobCreated = false;
        let controllerRegistered = false;
        try {
          jobStore.createJob(jobId);
          jobCreated = true;
          logger.workflowStart(jobId);

          const run = await workflowFactory.createRun(jobId);
          const ac = new AbortController();
          abortStore.set(jobId, ac);
          controllerRegistered = true;

          const workflowPromise = run.start({
            inputData: {
              medicalHistory,
              conversationTranscript,
              labResults,
            },
          });

          void workflowPromise
            .then((result) => {
              const runResult = result as {
                status?: string;
                result?: unknown;
                error?: { message?: string };
              };
              if (runResult?.status === "failed") {
                const message =
                  runResult.error?.message ?? "Diagnosis workflow failed";
                logger.workflowFail(jobId, clock.now() - startTime, message);
                jobStore.fail(jobId, message);
                return;
              }
              const outcome = reportOutcomeSchema.parse(runResult.result);
              const specialistCount =
                outcome.status === "available"
                  ? outcome.report.specialistsConsulted.length
                  : 0;
              logger.workflowComplete(
                jobId,
                clock.now() - startTime,
                specialistCount,
              );
              jobStore.complete(jobId, outcome);
            })
            .catch((error) => {
              const message =
                error instanceof Error ? error.message : "Unknown error";
              logger.workflowFail(jobId, clock.now() - startTime, message);
              jobStore.fail(jobId, message);
            })
            .finally(() => {
              try {
                abortStore.remove(jobId);
              } finally {
                rateLimiter.finishWorkflow(jobId);
              }
            });

          logger.request("POST", "/v1/diagnose", 202, clock.now() - startTime, {
            ip,
            jobId,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown startup error";
          logger.workflowFail(jobId, clock.now() - startTime, message);
          if (controllerRegistered) {
            try {
              abortStore.remove(jobId);
            } catch (cleanupError) {
              logger.error("workflow_controller_cleanup_failed", {
                jobId,
                error:
                  cleanupError instanceof Error
                    ? cleanupError.message
                    : "Unknown cleanup error",
              });
            }
          }
          try {
            if (jobCreated) {
              jobStore.fail(jobId, "Diagnosis workflow failed to start");
            }
          } finally {
            rateLimiter.finishWorkflow(jobId);
          }
          return withCors(
            Response.json(
              { error: "Failed to start diagnosis" },
              { status: 500 },
            ),
            req,
          );
        }

        return withCors(
          Response.json(
            {
              jobId,
              status: "pending",
              token: tokenService.generateToken(jobId),
              wsTicket: tokenService.generateWsTicket(jobId),
            },
            { status: 202 },
          ),
          req,
        );
      },
    },

    "/v1/diagnose/:jobId": {
      OPTIONS: (req: Request) => corsPreflightResponse(req),
      DELETE: (req: RouteRequest) => {
        const start = clock.now();
        const { jobId } = req.params;
        if (!JOB_ID_RE.test(jobId)) {
          return withCors(
            Response.json({ error: "Invalid job ID" }, { status: 400 }),
            req,
          );
        }
        const tokenError = verifyJobToken(req, jobId);
        if (tokenError) return tokenError;
        const entry = jobStore.getJob(jobId);

        if (!entry) {
          logger.request(
            "DELETE",
            "/v1/diagnose/:jobId",
            404,
            clock.now() - start,
            { jobId },
          );
          return withCors(
            Response.json({ error: "Job not found" }, { status: 404 }),
            req,
          );
        }
        if (entry.status === "completed") {
          logger.request(
            "DELETE",
            "/v1/diagnose/:jobId",
            200,
            clock.now() - start,
            { jobId, status: "already_completed" },
          );
          return withCors(Response.json({ status: "already_completed" }), req);
        }
        if (entry.status === "failed") {
          const status =
            entry.error === "Cancelled by user" ? "cancelled" : "failed";
          logger.request(
            "DELETE",
            "/v1/diagnose/:jobId",
            200,
            clock.now() - start,
            { jobId, status },
          );
          return withCors(Response.json({ status }), req);
        }
        const ac = abortStore.get(jobId);
        if (ac) ac.abort();
        jobStore.fail(jobId, "Cancelled by user");
        logger.request(
          "DELETE",
          "/v1/diagnose/:jobId",
          200,
          clock.now() - start,
          { jobId, status: "cancelled" },
        );
        return withCors(Response.json({ status: "cancelled" }), req);
      },
    },

    "/v1/status/:jobId": {
      OPTIONS: (req: Request) => corsPreflightResponse(req),
      GET: (req: RouteRequest) => {
        const start = clock.now();
        const { jobId } = req.params;
        if (!JOB_ID_RE.test(jobId)) {
          return withCors(
            Response.json({ error: "Invalid job ID" }, { status: 400 }),
            req,
          );
        }
        const tokenError = verifyJobToken(req, jobId);
        if (tokenError) return tokenError;
        const entry = jobStore.getJob(jobId);
        if (!entry) {
          logger.request("GET", "/v1/status/:jobId", 404, clock.now() - start, {
            jobId,
          });
          return withCors(
            Response.json({ error: "Job not found" }, { status: 404 }),
            req,
          );
        }
        logger.request("GET", "/v1/status/:jobId", 200, clock.now() - start, {
          jobId,
          status: entry.status,
        });
        return withCors(
          Response.json(
            { jobId, ...entry },
            { headers: { "Cache-Control": "no-store, private" } },
          ),
          req,
        );
      },
    },

    "/v1/health": {
      OPTIONS: (req: Request) => corsPreflightResponse(req),
      GET: (req: Request) => {
        const start = clock.now();
        const uptime = process.uptime();
        const activeWorkflows = rateLimiter.activeWorkflows;
        const dbOk = jobStore.healthCheck();
        const toolCache = cacheStatus.enabled
          ? { enabled: true as const, ...cacheStatus.getStats() }
          : { enabled: false as const };
        const status = dbOk ? 200 : 500;
        logger.request("GET", "/v1/health", status, clock.now() - start);
        return withCors(
          Response.json(
            {
              status: dbOk ? "ok" : "error",
              uptime,
              activeWorkflows,
              toolCache,
            },
            { status },
          ),
          req,
        );
      },
    },

    "/v1/agents": {
      OPTIONS: (req: Request) => corsPreflightResponse(req),
      GET: (req: Request) => {
        const start = clock.now();
        logger.request("GET", "/v1/agents", 200, clock.now() - start);
        return withCors(Response.json({ agents: agentList() }), req);
      },
    },

    "/v1/*": {
      OPTIONS: (req: Request) => corsPreflightResponse(req),
    },

    "/*": appHtml,

    "/ws": {
      GET: (req: Request) => {
        const url = new URL(req.url);
        const jobId = url.searchParams.get("jobId");
        if (!jobId) {
          return new Response("Missing jobId", { status: 400 });
        }
        const origin = req.headers.get("origin");
        if (!origin) {
          logger.warn("ws_origin_rejected", {
            jobId,
            origin: "none",
            reason: "missing_origin",
          });
          return new Response("Missing Origin header", { status: 403 });
        }
        const originsList = config.trustedOrigins
          ? config.trustedOrigins.split(",").map((o) => o.trim())
          : config.allowedOrigins === "*"
            ? null
            : config.allowedOrigins.split(",").map((o) => o.trim());
        if (originsList && !originsList.includes(origin)) {
          logger.warn("ws_origin_rejected", {
            jobId,
            origin,
            reason: "not_in_allowlist",
          });
          return new Response("Forbidden origin", { status: 403 });
        }
        if (config.wsTokenSecret) {
          const ticket = url.searchParams.get("ticket");
          const token = url.searchParams.get("token");
          if (ticket) {
            if (!tokenService.verifyWsTicket(jobId, ticket)) {
              logger.warn("ws_ticket_rejected", {
                jobId,
                reason: "invalid_or_expired_ticket",
              });
              return new Response("Invalid or expired ticket", { status: 403 });
            }
          } else if (token) {
            if (!tokenService.verifyToken(jobId, token)) {
              logger.warn("ws_token_rejected", {
                jobId,
                reason: "invalid_token",
              });
              return new Response("Invalid or missing token", { status: 403 });
            }
          } else {
            logger.warn("ws_credential_missing", { jobId });
            return new Response("Invalid or missing token", { status: 403 });
          }
        }
        if (server.upgrade(req, { data: { jobId } })) {
          logger.info("ws_connect", { jobId });
          return;
        }
        logger.warn("ws_upgrade_failed", { jobId });
        return new Response("Upgrade failed", { status: 500 });
      },
    },
  };
}

/**
 * WebSocket handler factory. Accepts the job store and timer operations so
 * tests can construct production handlers with an injected in-memory or
 * temporary JobStore — never the production singleton.
 */
export interface TimerOps {
  setInterval: typeof setInterval;
  setTimeout: typeof setTimeout;
  clearInterval: typeof clearInterval;
  clearTimeout: typeof clearTimeout;
}

export interface WsData {
  jobId: string;
  unsubscribe?: () => void;
  pingTimer?: ReturnType<typeof setInterval>;
  pongTimer?: ReturnType<typeof setTimeout>;
}

export interface WebSocketHandlerFactoryDeps {
  jobStore: RouteJobStore;
  timers: TimerOps;
  pingIntervalMs?: number;
  pongTimeoutMs?: number;
}

export function createWebSocketHandlers(deps: WebSocketHandlerFactoryDeps): {
  open(ws: import("bun").ServerWebSocket<WsData>): void;
  pong(ws: import("bun").ServerWebSocket<WsData>): void;
  message(ws: import("bun").ServerWebSocket<WsData>): void;
  close(ws: import("bun").ServerWebSocket<WsData>): void;
} {
  const { jobStore, timers } = deps;
  const PING_INTERVAL_MS = deps.pingIntervalMs ?? 30_000;
  const PONG_TIMEOUT_MS = deps.pongTimeoutMs ?? 10_000;

  return {
    open(ws) {
      const jobId = ws.data.jobId;
      const job = jobStore.getJob(jobId);
      if (!job) {
        ws.send(
          JSON.stringify({ type: "failed", jobId, error: "Job not found" }),
        );
        ws.close();
        return;
      }
      for (const event of job.progress) {
        ws.send(JSON.stringify({ type: "progress", jobId, event }));
      }
      if (job.status === "completed") {
        ws.send(
          JSON.stringify({ type: "completed", jobId, result: job.result }),
        );
        ws.close();
        return;
      } else if (job.status === "failed") {
        ws.send(JSON.stringify({ type: "failed", jobId, error: job.error }));
        ws.close();
        return;
      }
      const unsubscribe = jobStore.subscribe(jobId, (data: unknown) => {
        ws.send(JSON.stringify(data));
        const event = data as
          | { type: "progress" }
          | { type: "completed" }
          | { type: "failed" };
        if (event.type === "completed" || event.type === "failed") {
          ws.close();
        }
      });
      ws.data.unsubscribe = unsubscribe;
      ws.data.pingTimer = timers.setInterval(() => {
        if (ws.readyState !== 1) return;
        ws.ping();
        ws.data.pongTimer = timers.setTimeout(() => {
          ws.close(1001, "Pong timeout");
        }, PONG_TIMEOUT_MS);
      }, PING_INTERVAL_MS);
    },
    pong(ws) {
      if (ws.data.pongTimer) {
        timers.clearTimeout(ws.data.pongTimer);
        ws.data.pongTimer = undefined;
      }
    },
    message() {},
    close(ws) {
      ws.data.unsubscribe?.();
      if (ws.data.pingTimer) {
        timers.clearInterval(ws.data.pingTimer);
        ws.data.pingTimer = undefined;
      }
      if (ws.data.pongTimer) {
        timers.clearTimeout(ws.data.pongTimer);
        ws.data.pongTimer = undefined;
      }
    },
  };
}

/**
 * Lifecycle coordinator. Owns startup and shutdown coordination with
 * injected dependencies. Tests invoke this seam directly with fake
 * clock/sleep/server/timers/exit dependencies.
 */
export interface LifecycleDeps {
  config: AppConfig;
  jobStore: JobStore;
  rateLimiter: RateLimiter;
  /** Start side effects (Orphadata, tool cache, audit purge). */
  startBackground?: (cfg: AppConfig) => Array<() => void>;
  /** Stop side effects; called before interval cleanup. */
  stopBackground?: () => void;
  /** The Bun server (with .stop()). */
  server: { stop(): void };
  /** Active-workflow waiter (the rate limiter tracks active workflows). */
  activeWorkflows: () => number;
  /** Sleep function (overrideable for fake clocks). */
  sleep: (ms: number) => Promise<void>;
  /** Shutdown timeout in ms. */
  shutdownTimeoutMs: number;
  /** Exit callback. */
  exit: (code: number) => void;
  /** Timers used by the lifecycle (cleared on shutdown). */
  timers: TimerOps & {
    intervals: Array<ReturnType<typeof setInterval>>;
  };
}

export interface LifecycleHandle {
  startup(): Promise<void>;
  shutdown(signal: string): Promise<void>;
}

export interface StartupDeps extends LifecycleDeps {
  /** Orphadata initializer (no-op when disabled). */
  initializeOrphadata?: () => Promise<void>;
  /** Tool cache initializer (no-op when disabled). */
  initializeToolCache?: () => void;
  /** Whether Orphadata startup is enabled. */
  orphadataEnabled: boolean;
  /** Whether tool cache is enabled. */
  toolCacheEnabled: boolean;
  /** Job TTL for the startup cleanup pass. */
  jobTtlMs: number;
  /** Pending-job timeout for the startup timeoutPending pass. */
  pendingJobTimeoutMs: number;
}

export function createLifecycle(deps: StartupDeps): LifecycleHandle {
  return {
    async startup() {
      // Mirror index.ts startup ordering without owning the umask or
      // APP_DATA_DIR resolver (those are sensitive-cache-redaction's job).
      deps.jobStore.markStalePending();
      deps.jobStore.cleanupExpired(deps.jobTtlMs);
      if (deps.orphadataEnabled && deps.initializeOrphadata) {
        deps.initializeOrphadata().catch(() => {});
      }
      if (deps.toolCacheEnabled && deps.initializeToolCache) {
        deps.initializeToolCache();
      }
    },
    async shutdown(signal: string) {
      // The lifecycle coordinator does not log to console directly; callers
      // can wrap `logger` if they need observable shutdown logs.
      deps.server.stop();
      for (const timer of deps.timers.intervals) {
        deps.timers.clearInterval(timer);
      }
      deps.stopBackground?.();
      const start = Date.now();
      while (deps.activeWorkflows() > 0) {
        if (Date.now() - start > deps.shutdownTimeoutMs) {
          break;
        }
        await deps.sleep(500);
      }
      deps.exit(0);
    },
  };
}
