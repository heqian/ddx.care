import { mastra } from "./src/mastra/index";
import { agentList } from "./src/mastra/agents/index";
import { z } from "zod";

const diagnoses = new Map<string, { status: "pending" | "completed" | "failed"; result?: unknown; error?: string }>();

const diagnoseSchema = z.object({
  medicalHistory: z.string().min(1),
  conversationTranscript: z.string().min(1),
  labResults: z.string().min(1),
});

Bun.serve({
  port: process.env.PORT ?? 3000,
  routes: {
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
        diagnoses.set(jobId, { status: "pending" });

        const workflow = mastra.getWorkflow("diagnosticWorkflow");
        const run = await workflow.createRun({ runId: jobId });

        run
          .start({ inputData: { medicalHistory, conversationTranscript, labResults } })
          .then((result) => {
            diagnoses.set(jobId, { status: "completed", result: result });
          })
          .catch((error) => {
            diagnoses.set(jobId, {
              status: "failed",
              error: error instanceof Error ? error.message : "Unknown error",
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

        return Response.json({ jobId, ...entry });
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
