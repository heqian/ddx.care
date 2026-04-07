import { mastra } from "./src/backend/index";
import { agentList } from "./src/backend/agents/index";
import { z } from "zod";
import appHtml from "./index.html";
import { progressStore } from "./src/backend/progress-store";
import type { ServerWebSocket } from "bun";

const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup of expired jobs
setInterval(() => {
  progressStore.cleanupExpired(JOB_TTL_MS);
}, CLEANUP_INTERVAL_MS);

const diagnoseSchema = z.object({
  medicalHistory: z.string().min(1),
  conversationTranscript: z.string().min(1),
  labResults: z.string().min(1),
});

const server = Bun.serve<{ jobId: string }>({
  port: process.env.PORT ?? 3000,
  routes: {
    "/": appHtml,

    "/v1/diagnose": {
      POST: async (req: Request) => {
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
          return; // do not return a Response
        }
        return new Response("Upgrade failed", { status: 500 });
      },
    },
  },
  websocket: {
    open(ws) {
      const jobId = ws.data.jobId;
      const job = progressStore.getJob(jobId);

      if (!job) {
        ws.send(JSON.stringify({ type: "failed", jobId, error: "Job not found" }));
        ws.close();
        return;
      }

      // 1. Replay historical progress
      for (const event of job.progress) {
        ws.send(JSON.stringify({ type: "progress", jobId, event }));
      }

      // 2. If it's already completed or failed, send the result and close
      if (job.status === "completed") {
         ws.send(JSON.stringify({ type: "completed", jobId, result: job.result }));
         ws.close();
         return;
      } else if (job.status === "failed") {
         ws.send(JSON.stringify({ type: "failed", jobId, error: job.error }));
         ws.close();
         return;
      }

      // 3. Subscribe to real-time events
      const unsubscribe = progressStore.subscribe(jobId, (data: any) => {
        ws.send(JSON.stringify(data));
        if (data.type === "completed" || data.type === "failed") {
          ws.close();
        }
      });

      // Store cleanup on socket so we can call it on close
      (ws as any).unsubscribe = unsubscribe;
    },
    message() {
      // not taking messages from client
    },
    close(ws) {
      if ((ws as any).unsubscribe) {
        (ws as any).unsubscribe();
      }
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("ddx.care API server running on port " + server.port);
