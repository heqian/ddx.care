import { z } from "zod";
import { mastra } from "../index";
import { agentList } from "../agents/index";
import { progressStore } from "../progress-store";
import { detectPII } from "../utils/pii-detector";

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
          return;
        }
        return new Response("Upgrade failed", { status: 500 });
      },
    },
  };
}
