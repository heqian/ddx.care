import { z } from "zod";
import { mastra } from "../index";
import { agentList } from "../agents/index";
import { progressStore } from "../progress-store";
import { detectPII } from "../utils/pii-detector";
import { RateLimiter } from "../utils/rate-limiter";
import { logger } from "../utils/logger";
import {
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  MAX_CONCURRENT_WORKFLOWS,
  MAX_INPUT_FIELD_LENGTH,
  MAX_PAYLOAD_BYTES,
} from "../config";

export const rateLimiter = new RateLimiter({
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxConcurrent: MAX_CONCURRENT_WORKFLOWS,
});

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

const diagnoseSchema = z.object({
  medicalHistory: z.string().min(1).max(MAX_INPUT_FIELD_LENGTH),
  conversationTranscript: z.string().min(1).max(MAX_INPUT_FIELD_LENGTH),
  labResults: z.string().min(1).max(MAX_INPUT_FIELD_LENGTH),
});

export function createRoutes(server: { upgrade(req: Request, options: { data: unknown }): boolean }, appHtml: unknown) {
  return {
    "/": appHtml,

    "/v1/diagnose": {
      POST: async (req: Request) => {
        const startTime = Date.now();
        const ip = getClientIp(req);

        const ipCheck = rateLimiter.check(ip);
        if (!ipCheck.allowed) {
          const retryAfter = Math.ceil(ipCheck.retryAfterMs / 1000);
          logger.request("POST", "/v1/diagnose", 429, Date.now() - startTime, { ip, reason: "rate_limited" });
          return Response.json(
            { error: "Rate limit exceeded. Please try again later." },
            { status: 429, headers: { "Retry-After": String(retryAfter) } },
          );
        }

        if (!rateLimiter.canStartWorkflow()) {
          logger.request("POST", "/v1/diagnose", 429, Date.now() - startTime, { ip, reason: "at_capacity" });
          return Response.json(
            { error: "Server is at capacity. Please try again later." },
            { status: 429, headers: { "Retry-After": "30" } },
          );
        }

        let body: unknown;
        const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
        if (contentLength > MAX_PAYLOAD_BYTES) {
          logger.request("POST", "/v1/diagnose", 413, Date.now() - startTime, { ip, contentLength });
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }
        try {
          body = await req.json();
        } catch {
          logger.request("POST", "/v1/diagnose", 400, Date.now() - startTime, { ip });
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = diagnoseSchema.safeParse(body);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
          logger.request("POST", "/v1/diagnose", 400, Date.now() - startTime, { ip, issues });
          return Response.json(
            { error: `Validation failed: ${issues}` },
            { status: 400 },
          );
        }

        const { medicalHistory, conversationTranscript, labResults } = parsed.data;

        const combinedText = `${medicalHistory}\n${conversationTranscript}\n${labResults}`;
        const piiResult = detectPII(combinedText);
        if (piiResult.hasPII) {
          logger.warn("pii_detected", { ip, detectedTypes: piiResult.detectedTypes });
          logger.request("POST", "/v1/diagnose", 400, Date.now() - startTime, { ip, reason: "pii_detected" });
          return Response.json(
            { error: `Submission rejected: Please remove potential Patient Health Information (${piiResult.detectedTypes.join(", ")}).` },
            { status: 400 },
          );
        }

        rateLimiter.record(ip);
        rateLimiter.startWorkflow();

        const jobId = crypto.randomUUID();
        progressStore.createJob(jobId);
        logger.workflowStart(jobId);
        logger.request("POST", "/v1/diagnose", 202, Date.now() - startTime, { ip, jobId });

        const workflow = mastra.getWorkflow("diagnosticWorkflow");
        const run = await workflow.createRun({ runId: jobId });

        run
          .start({ inputData: { medicalHistory, conversationTranscript, labResults } })
          .then((result) => {
            const specialistCount = (result as any)?.report?.specialistsConsulted?.length ?? 0;
            logger.workflowComplete(jobId, Date.now() - startTime, specialistCount);
            progressStore.complete(jobId, result);
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : "Unknown error";
            logger.workflowFail(jobId, Date.now() - startTime, message);
            progressStore.fail(jobId, message);
          })
          .finally(() => {
            rateLimiter.finishWorkflow();
          });

        return Response.json({ jobId, status: "pending" }, { status: 202 });
      },
    },

    "/v1/status/:jobId": {
      GET: (req: any) => {
        const start = Date.now();
        const { jobId } = req.params;
        const entry = progressStore.getJob(jobId);

        if (!entry) {
          logger.request("GET", "/v1/status/:jobId", 404, Date.now() - start, { jobId });
          return Response.json({ error: "Job not found" }, { status: 404 });
        }

        logger.request("GET", "/v1/status/:jobId", 200, Date.now() - start, { jobId, status: entry.status });
        return Response.json({ jobId, ...entry });
      },
    },

    "/v1/agents": {
      GET: () => {
        const start = Date.now();
        logger.request("GET", "/v1/agents", 200, Date.now() - start);
        return Response.json({ agents: agentList });
      },
    },

    "/ws": {
      GET: (req: Request) => {
        const url = new URL(req.url);
        const jobId = url.searchParams.get("jobId");
        if (!jobId) {
          return new Response("Missing jobId", { status: 400 });
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
