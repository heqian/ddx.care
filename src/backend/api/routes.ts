import { z } from "zod";
import { mastra } from "../index";
import { agentList } from "../agents/index";
import { progressStore } from "../progress-store";
import { RateLimiter } from "../utils/rate-limiter";
import { logger } from "../utils/logger";
import { generateToken, verifyToken } from "../utils/ws-token";
import * as abortStore from "../utils/abort-controller-store";
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
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "connect-src 'self' ws: wss:; " +
  "frame-ancestors 'none'";

function corsHeaders(req?: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

interface WorkflowRunResult {
  report?: {
    specialistsConsulted?: Array<{ specialist: string; keyFindings: string }>;
  };
}

interface RouteRequest extends Request {
  params: Record<string, string>;
}

export function createRoutes(
  server: {
    upgrade(req: Request, options: { data: unknown }): boolean;
    requestIP?(
      req: Request,
    ): { address: string; family: string; port: number } | null;
  },
  appHtml: unknown,
) {
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

        const ipCheck = rateLimiter.check(ip);
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

        if (!rateLimiter.canStartWorkflow()) {
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

        rateLimiter.startWorkflow();

        let body: unknown;
        const contentLength = parseInt(
          req.headers.get("content-length") ?? "0",
          10,
        );
        if (contentLength > MAX_PAYLOAD_BYTES) {
          rateLimiter.finishWorkflow();
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
          rateLimiter.finishWorkflow();
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
          rateLimiter.finishWorkflow();
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

        rateLimiter.record(ip);

        const { medicalHistory, conversationTranscript, labResults } =
          parsed.data;

        const trunc = (s: string) =>
          s.length > MAX_INPUT_FIELD_LENGTH
            ? s.slice(0, MAX_INPUT_FIELD_LENGTH) +
              "[Content truncated due to length limit]"
            : s;
        const tMedicalHistory = trunc(medicalHistory);
        const tConversationTranscript = trunc(conversationTranscript);
        const tLabResults = trunc(labResults);

        const jobId = crypto.randomUUID();
        progressStore.createJob(jobId);
        logger.workflowStart(jobId);
        logger.request("POST", "/v1/diagnose", 202, Date.now() - startTime, {
          ip,
          jobId,
        });

        const workflow = mastra.getWorkflow("diagnosticWorkflow");
        const run = await workflow.createRun({ runId: jobId });

        const ac = new AbortController();
        abortStore.set(jobId, ac);

        run
          .start({
            inputData: {
              medicalHistory: tMedicalHistory,
              conversationTranscript: tConversationTranscript,
              labResults: tLabResults,
            },
          })
          .then((result) => {
            const specialistCount =
              (result as WorkflowRunResult)?.report?.specialistsConsulted
                ?.length ?? 0;
            logger.workflowComplete(
              jobId,
              Date.now() - startTime,
              specialistCount,
            );
            progressStore.complete(jobId, result);
          })
          .catch((error) => {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            logger.workflowFail(jobId, Date.now() - startTime, message);
            progressStore.fail(jobId, message);
          })
          .finally(() => {
            abortStore.remove(jobId);
            rateLimiter.finishWorkflow();
          });

        return withCors(
          Response.json(
            { jobId, status: "pending", token: generateToken(jobId) },
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
        const entry = progressStore.getJob(jobId);

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

        const ac = abortStore.get(jobId);
        if (ac) {
          ac.abort();
          abortStore.remove(jobId);
        }
        progressStore.fail(jobId, "Cancelled by user");
        rateLimiter.finishWorkflow();

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
        const entry = progressStore.getJob(jobId);

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
        return withCors(Response.json({ jobId, ...entry }), req);
      },
    },

    "/v1/health": {
      OPTIONS: (req: Request) => corsPreflightResponse(req),
      GET: (req: Request) => {
        const start = Date.now();
        const uptime = process.uptime();
        const activeWorkflows = rateLimiter.activeWorkflows;
        const dbOk = progressStore.healthCheck();

        const status = dbOk ? 200 : 500;
        logger.request("GET", "/v1/health", status, Date.now() - start);

        return withCors(
          Response.json(
            {
              status: dbOk ? "ok" : "error",
              uptime,
              activeWorkflows,
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
          const token = url.searchParams.get("token");
          if (!token || !verifyToken(jobId, token)) {
            logger.warn("ws_token_rejected", {
              jobId,
              reason: "invalid_token",
            });
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
