import { z } from "zod";
import { mastra } from "../index";
import { agentList } from "../agents/index";
import { progressStore } from "../progress-store";
import { detectPII } from "../utils/pii-detector";
import { RateLimiter } from "../utils/rate-limiter";
import {
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  MAX_CONCURRENT_WORKFLOWS,
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
  medicalHistory: z.string().min(1),
  conversationTranscript: z.string().min(1),
  labResults: z.string().min(1),
});

export function createRoutes(server: { upgrade(req: Request, options: { data: unknown }): boolean }, appHtml: unknown) {
  return {
    "/": appHtml,

    "/v1/diagnose": {
      POST: async (req: Request) => {
        const ip = getClientIp(req);

        const ipCheck = rateLimiter.check(ip);
        if (!ipCheck.allowed) {
          const retryAfter = Math.ceil(ipCheck.retryAfterMs / 1000);
          return Response.json(
            { error: "Rate limit exceeded. Please try again later." },
            { status: 429, headers: { "Retry-After": String(retryAfter) } },
          );
        }

        if (!rateLimiter.canStartWorkflow()) {
          return Response.json(
            { error: "Server is at capacity. Please try again later." },
            { status: 429, headers: { "Retry-After": "30" } },
          );
        }

        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = diagnoseSchema.safeParse(body);
        if (!parsed.success) {
          const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
          return Response.json(
            { error: `Missing required fields: ${missing}` },
            { status: 400 },
          );
        }

        const { medicalHistory, conversationTranscript, labResults } = parsed.data;

        const combinedText = `${medicalHistory}\n${conversationTranscript}\n${labResults}`;
        const piiResult = detectPII(combinedText);
        if (piiResult.hasPII) {
          console.warn(`[SECURITY] PII detected in diagnostic request. Types: ${piiResult.detectedTypes.join(", ")}`);
          return Response.json(
            { error: `Submission rejected: Please remove potential Patient Health Information (${piiResult.detectedTypes.join(", ")}).` },
            { status: 400 },
          );
        }

        rateLimiter.record(ip);
        rateLimiter.startWorkflow();

        const jobId = crypto.randomUUID();
        progressStore.createJob(jobId);

        const workflow = mastra.getWorkflow("diagnosticWorkflow");
        const run = await workflow.createRun({ runId: jobId });

        run
          .start({ inputData: { medicalHistory, conversationTranscript, labResults } })
          .then((result) => {
            progressStore.complete(jobId, result);
          })
          .catch((error) => {
            progressStore.fail(jobId, error instanceof Error ? error.message : "Unknown error");
          })
          .finally(() => {
            rateLimiter.finishWorkflow();
          });

        return Response.json({ jobId, status: "pending" }, { status: 202 });
      },
    },

    "/v1/status/:jobId": {
      GET: (req: any) => {
        const { jobId } = req.params;
        const entry = progressStore.getJob(jobId);

        if (!entry) {
          return Response.json({ error: "Job not found" }, { status: 404 });
        }

        return Response.json({ jobId, ...entry });
      },
    },

    "/v1/agents": {
      GET: () => {
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
          return;
        }
        return new Response("Upgrade failed", { status: 500 });
      },
    },
  };
}
