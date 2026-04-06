import { mastra } from "./src/backend/index";
import { agentList } from "./src/backend/agents/index";
import { z } from "zod";
import appHtml from "./index.html";

const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface JobEntry {
  status: "pending" | "completed" | "failed";
  result?: unknown;
  error?: string;
  createdAt: number;
}

const diagnoses = new Map<string, JobEntry>();

// Periodic cleanup of expired jobs
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of diagnoses) {
    if (now - entry.createdAt > JOB_TTL_MS) {
      diagnoses.delete(id);
    }
  }
  // Also clean up global progress tracking
  const progressMap = (global as any).jobProgress as Map<string, unknown[]> | undefined;
  if (progressMap) {
    for (const id of progressMap.keys()) {
      if (!diagnoses.has(id)) {
        progressMap.delete(id);
      }
    }
  }
}, CLEANUP_INTERVAL_MS);

const diagnoseSchema = z.object({
  medicalHistory: z.string().min(1),
  conversationTranscript: z.string().min(1),
  labResults: z.string().min(1),
});

Bun.serve({
  port: process.env.PORT ?? 3000,
  routes: {
    "/": appHtml,

    "/v1/diagnose": {
      POST: async (req) => {
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
        diagnoses.set(jobId, { status: "pending", createdAt: Date.now() });

        const workflow = mastra.getWorkflow("diagnosticWorkflow");
        const run = await workflow.createRun({ runId: jobId });

        run
          .start({ inputData: { medicalHistory, conversationTranscript, labResults } })
          .then((result) => {
            diagnoses.set(jobId, { status: "completed", result: result, createdAt: Date.now() });
          })
          .catch((error) => {
            diagnoses.set(jobId, {
              status: "failed",
              error: error instanceof Error ? error.message : "Unknown error",
              createdAt: Date.now(),
            });
          });

        return Response.json({ jobId, status: "pending" }, { status: 202 });
      },
    },

    "/v1/status/:jobId": {
      GET: (req) => {
        const { jobId } = req.params;
        const entry = diagnoses.get(jobId);

        if (!entry) {
          return Response.json({ error: "Job not found" }, { status: 404 });
        }

        let progress: { time: string; message: string }[] = [];
        if ((global as any).jobProgress && (global as any).jobProgress.has(jobId)) {
           progress = (global as any).jobProgress.get(jobId);
        }

        return Response.json({ jobId, ...entry, progress });
      },
    },

    "/v1/agents": {
      GET: () => {
        return Response.json({ agents: agentList });
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("ddx.care API server running on port 3000");
