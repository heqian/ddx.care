import { z } from "zod";
import { mastra } from "../index";
import { agentList } from "../agents/index";
import { progressStore } from "../progress-store";
import { RateLimiter } from "../utils/rate-limiter";
import { logger } from "../utils/logger";
import {
  generateToken,
  generateWsTicket,
  verifyToken,
  verifyWsTicket,
} from "../utils/ws-token";
import * as abortStore from "../utils/abort-controller-store";
import { getCacheStats } from "../tools/utils/tool-cache";
import { TOOL_CACHE_ENABLED } from "../config";
import { reportOutcomeSchema } from "../../shared/report-outcome";
import type { ReportOutcome } from "../../shared/report-outcome";
import type { JobEntry } from "../progress-store";
import {
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_ENTRIES,
  MAX_CONCURRENT_WORKFLOWS,
  MAX_INPUT_FIELD_LENGTH,
  MAX_PAYLOAD_BYTES,
  ALLOWED_ORIGINS,
  TRUSTED_ORIGINS,
  WS_TOKEN_SECRET,
} from "../config";

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

const JOB_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function corsHeaders(req?: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Job-Token",
    "Content-Security-Policy": CSP_VALUE,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };

  if (TRUSTED_ORIGINS) {
    const allowed = TRUSTED_ORIGINS.split(",").map((o) => o.trim());
    const origin = req?.headers.get("origin") ?? "";
    if (allowed.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
    // Dynamic origin reflection requires Vary: Origin so CDNs/proxies
    // don't serve a cached response with the wrong origin.
    headers["Vary"] = "Origin";
  } else {
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGINS;
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

/**
 * Verify the HMAC job token on REST endpoints (GET /v1/status, DELETE /v1/diagnose).
 * Returns a 403 Response if the token is missing/invalid, or null if access is allowed.
 * Skipped in dev mode (empty WS_TOKEN_SECRET), mirroring the /ws WebSocket handler.
 *
 * Token transport precedence:
 *   1. `X-Job-Token: <token>` header (preferred — redacted by Caddy, not in history)
 *   2. `?token=<token>` query parameter (dev fallback during migration)
 */
function verifyJobToken(req: Request, jobId: string): Response | null {
  if (!WS_TOKEN_SECRET) return null;
  // Prefer the dedicated job-token header so Caddy's HTTP Basic credentials
  // can continue using Authorization. Fall back to the query parameter for
  // dev ergonomics and migration from existing clients. The query fallback is
  // covered by Caddy log redaction (see Caddyfile).
  let token = req.headers.get("x-job-token")?.trim() || null;
  if (!token) {
    const url = new URL(req.url);
    token = url.searchParams.get("token");
  }
  if (!token || !verifyToken(jobId, token)) {
    logger.warn("rest_token_rejected", { jobId });
    return withCors(
      Response.json({ error: "Invalid or missing token" }, { status: 403 }),
      req,
    );
  }
  return null;
}

export const rateLimiter = new RateLimiter({
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxConcurrent: MAX_CONCURRENT_WORKFLOWS,
  maxEntries: RATE_LIMIT_MAX_ENTRIES,
});

const diagnoseSchema = z.object({
  medicalHistory: z.string().max(MAX_INPUT_FIELD_LENGTH),
  conversationTranscript: z.string().max(MAX_INPUT_FIELD_LENGTH),
  labResults: z.string().max(MAX_INPUT_FIELD_LENGTH),
});

interface RouteRequest extends Request {
  params: Record<string, string>;
}

interface DiagnosisInput {
  medicalHistory: string;
  conversationTranscript: string;
  labResults: string;
}

interface WorkflowRun {
  start(options: { inputData: DiagnosisInput }): Promise<unknown>;
}

interface RouteJobStore {
  createJob(jobId: string): void;
  getJob(jobId: string): JobEntry | undefined;
  complete(jobId: string, result: ReportOutcome): void;
  fail(jobId: string, error: string): void;
  healthCheck(): boolean;
}

interface RouteAbortStore {
  set(jobId: string, controller: AbortController): void;
  get(jobId: string): AbortController | undefined;
  remove(jobId: string): void;
}

export interface RouteDependencies {
  rateLimiter?: RateLimiter;
  progressStore?: RouteJobStore;
  abortStore?: RouteAbortStore;
  createWorkflowRun?: (jobId: string) => Promise<WorkflowRun>;
  generateJobId?: () => string;
}

export function createRoutes(
  server: {
    upgrade(req: Request, options: { data: unknown }): boolean;
    requestIP?(
      req: Request,
    ): { address: string; family: string; port: number } | null;
  },
  appHtml: unknown,
  dependencies: RouteDependencies = {},
) {
  const routeRateLimiter = dependencies.rateLimiter ?? rateLimiter;
  const routeProgressStore = dependencies.progressStore ?? progressStore;
  const routeAbortStore = dependencies.abortStore ?? abortStore;
  const createWorkflowRun =
    dependencies.createWorkflowRun ??
    (async (jobId: string) => {
      const workflow = mastra.getWorkflow("diagnosticWorkflow");
      return workflow.createRun({ runId: jobId });
    });
  const generateJobId =
    dependencies.generateJobId ?? (() => crypto.randomUUID());

  function getClientIp(req: Request): string {
    // X-Real-IP is explicitly set by Caddy via `header_up` and is always the
    // original client's IP, regardless of intermediate proxy chains.
    const realIp = req.headers.get("x-real-ip");
    if (realIp) return realIp.trim();

    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded.split(",");
      // With only Caddy in front, there is exactly one entry — so taking the
      // rightmost is correct here. In a multi-proxy chain per RFC 7239, the
      // leftmost entry is the original client IP; this would need revision if
      // additional proxies are added.
      return parts[parts.length - 1].trim();
    }
    return server.requestIP?.(req)?.address || "unknown";
  }

  return {
    "/": appHtml,

    "/v1/diagnose": {
      OPTIONS: (req: Request) => corsPreflightResponse(req),
      POST: async (req: Request) => {
        const startTime = Date.now();
        const ip = getClientIp(req);

        const ipCheck = routeRateLimiter.check(ip);
        if (!ipCheck.allowed) {
          const retryAfter = Math.ceil(ipCheck.retryAfterMs / 1000);
          logger.request("POST", "/v1/diagnose", 429, Date.now() - startTime, {
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

        // Record immediately after check() succeeds so all requests (valid or
        // malformed) count against the per-IP limit. This prevents bypass via
        // rapid invalid payloads. The concurrent-workflow slot is managed
        // separately (tryStartWorkflow only after successful validation).
        routeRateLimiter.record(ip);

        let body: unknown;
        const contentLength = parseInt(
          req.headers.get("content-length") ?? "0",
          10,
        );
        if (contentLength > MAX_PAYLOAD_BYTES) {
          logger.request("POST", "/v1/diagnose", 413, Date.now() - startTime, {
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
          logger.request("POST", "/v1/diagnose", 400, Date.now() - startTime, {
            ip,
          });
          return withCors(
            Response.json({ error: "Invalid JSON body" }, { status: 400 }),
            req,
          );
        }

        const parsed = diagnoseSchema.safeParse(body);
        if (!parsed.success) {
          const issues = parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          logger.request("POST", "/v1/diagnose", 400, Date.now() - startTime, {
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

        const jobId = generateJobId();
        if (!routeRateLimiter.tryStartWorkflow(jobId)) {
          logger.request("POST", "/v1/diagnose", 429, Date.now() - startTime, {
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
          routeProgressStore.createJob(jobId);
          jobCreated = true;
          logger.workflowStart(jobId);

          const run = await createWorkflowRun(jobId);
          const ac = new AbortController();
          routeAbortStore.set(jobId, ac);
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
              // Mastra resolves (rather than rejects) when a workflow step throws:
              // the run result carries status "failed" with an error object, and
              // no report. Surface that as a failed job so the frontend shows the
              // Diagnosis Failed / Retry UI instead of a completed job with no
              // report data.
              const runResult = result as {
                status?: string;
                result?: unknown;
                error?: { message?: string };
              };
              if (runResult?.status === "failed") {
                const message =
                  runResult.error?.message ?? "Diagnosis workflow failed";
                logger.workflowFail(jobId, Date.now() - startTime, message);
                routeProgressStore.fail(jobId, message);
                return;
              }
              const outcome = reportOutcomeSchema.parse(runResult.result);
              const specialistCount =
                outcome.status === "available"
                  ? outcome.report.specialistsConsulted.length
                  : 0;
              logger.workflowComplete(
                jobId,
                Date.now() - startTime,
                specialistCount,
              );
              routeProgressStore.complete(jobId, outcome);
            })
            .catch((error) => {
              const message =
                error instanceof Error ? error.message : "Unknown error";
              logger.workflowFail(jobId, Date.now() - startTime, message);
              routeProgressStore.fail(jobId, message);
            })
            .finally(() => {
              try {
                routeAbortStore.remove(jobId);
              } finally {
                routeRateLimiter.finishWorkflow(jobId);
              }
            });

          logger.request("POST", "/v1/diagnose", 202, Date.now() - startTime, {
            ip,
            jobId,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown startup error";
          logger.workflowFail(jobId, Date.now() - startTime, message);
          if (controllerRegistered) {
            try {
              routeAbortStore.remove(jobId);
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
              routeProgressStore.fail(
                jobId,
                "Diagnosis workflow failed to start",
              );
            }
          } finally {
            routeRateLimiter.finishWorkflow(jobId);
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
              token: generateToken(jobId),
              wsTicket: generateWsTicket(jobId),
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
        const start = Date.now();
        const { jobId } = req.params;
        if (!JOB_ID_RE.test(jobId)) {
          return withCors(
            Response.json({ error: "Invalid job ID" }, { status: 400 }),
            req,
          );
        }
        const tokenError = verifyJobToken(req, jobId);
        if (tokenError) return tokenError;
        const entry = routeProgressStore.getJob(jobId);

        if (!entry) {
          logger.request(
            "DELETE",
            "/v1/diagnose/:jobId",
            404,
            Date.now() - start,
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
            Date.now() - start,
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
            Date.now() - start,
            { jobId, status },
          );
          return withCors(Response.json({ status }), req);
        }

        const ac = routeAbortStore.get(jobId);
        if (ac) {
          ac.abort();
        }
        routeProgressStore.fail(jobId, "Cancelled by user");

        logger.request(
          "DELETE",
          "/v1/diagnose/:jobId",
          200,
          Date.now() - start,
          { jobId, status: "cancelled" },
        );
        return withCors(Response.json({ status: "cancelled" }), req);
      },
    },

    "/v1/status/:jobId": {
      OPTIONS: (req: Request) => corsPreflightResponse(req),
      GET: (req: RouteRequest) => {
        const start = Date.now();
        const { jobId } = req.params;
        if (!JOB_ID_RE.test(jobId)) {
          return withCors(
            Response.json({ error: "Invalid job ID" }, { status: 400 }),
            req,
          );
        }
        const tokenError = verifyJobToken(req, jobId);
        if (tokenError) return tokenError;
        const entry = routeProgressStore.getJob(jobId);

        if (!entry) {
          logger.request("GET", "/v1/status/:jobId", 404, Date.now() - start, {
            jobId,
          });
          return withCors(
            Response.json({ error: "Job not found" }, { status: 404 }),
            req,
          );
        }

        logger.request("GET", "/v1/status/:jobId", 200, Date.now() - start, {
          jobId,
          status: entry.status,
        });
        return withCors(
          Response.json(
            { jobId, ...entry },
            {
              headers: { "Cache-Control": "no-store, private" },
            },
          ),
          req,
        );
      },
    },

    "/v1/health": {
      OPTIONS: (req: Request) => corsPreflightResponse(req),
      GET: (req: Request) => {
        const start = Date.now();
        const uptime = process.uptime();
        const activeWorkflows = routeRateLimiter.activeWorkflows;
        const dbOk = routeProgressStore.healthCheck();
        const toolCache = TOOL_CACHE_ENABLED
          ? { enabled: true as const, ...getCacheStats() }
          : { enabled: false as const };

        const status = dbOk ? 200 : 500;
        logger.request("GET", "/v1/health", status, Date.now() - start);

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
        const start = Date.now();
        logger.request("GET", "/v1/agents", 200, Date.now() - start);
        return withCors(Response.json({ agents: agentList }), req);
      },
    },

    // CORS preflight catch-all for any future /v1/* routes
    "/v1/*": {
      OPTIONS: (req: Request) => corsPreflightResponse(req),
    },

    // SPA fallback — serve index.html for all non-API routes
    "/*": appHtml,

    "/ws": {
      GET: (req: Request) => {
        const url = new URL(req.url);
        const jobId = url.searchParams.get("jobId");
        if (!jobId) {
          return new Response("Missing jobId", { status: 400 });
        }

        // Validate Origin header to prevent cross-site WebSocket hijacking.
        // Always require a valid Origin — browsers always send it for WebSocket upgrades.
        const origin = req.headers.get("origin");
        if (!origin) {
          logger.warn("ws_origin_rejected", {
            jobId,
            origin: "none",
            reason: "missing_origin",
          });
          return new Response("Missing Origin header", { status: 403 });
        }

        const originsList = TRUSTED_ORIGINS
          ? TRUSTED_ORIGINS.split(",").map((o) => o.trim())
          : ALLOWED_ORIGINS === "*"
            ? null
            : ALLOWED_ORIGINS.split(",").map((o) => o.trim());

        if (originsList && !originsList.includes(origin)) {
          logger.warn("ws_origin_rejected", {
            jobId,
            origin,
            reason: "not_in_allowlist",
          });
          return new Response("Forbidden origin", { status: 403 });
        }

        if (WS_TOKEN_SECRET) {
          // Prefer the short-lived, single-use ticket (default 120s TTL) so the
          // long-lived job capability is not exposed in the WebSocket URL.
          const ticket = url.searchParams.get("ticket");
          const token = url.searchParams.get("token");
          if (ticket) {
            if (!verifyWsTicket(jobId, ticket)) {
              // Log the rejection without the ticket value — credentials must
              // never appear in logs. The reason field is enough for triage.
              logger.warn("ws_ticket_rejected", {
                jobId,
                reason: "invalid_or_expired_ticket",
              });
              return new Response("Invalid or expired ticket", { status: 403 });
            }
          } else if (token) {
            // Migration fallback: accept the long-lived HMAC token on /ws for a
            // bounded period. The frontend ships wsTicket-based connections;
            // remove this branch once migration completes (see design.md).
            if (!verifyToken(jobId, token)) {
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
