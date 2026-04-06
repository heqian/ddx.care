import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z, type infer as zInfer } from "zod";
import { DIAGNOSIS_TIMEOUT_MS, MAX_DIAGNOSIS_ROUNDS } from "../config";

// Step 1: Validate and structure the incoming patient data
const parseInput = createStep({
  id: "parse-input",
  inputSchema: z.object({
    medicalHistory: z.string().min(1, "Medical history is required"),
    conversationTranscript: z.string().min(1, "Conversation transcript is required"),
    labResults: z.string().min(1, "Lab results are required"),
  }),
  outputSchema: z.object({
    patientSummary: z.string(),
    medicalHistory: z.string(),
    conversationTranscript: z.string(),
    labResults: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { medicalHistory, conversationTranscript, labResults } = inputData;

    const patientSummary = [
      "=== PATIENT DATA FOR REVIEW ===",
      "",
      "--- MEDICAL HISTORY ---",
      medicalHistory,
      "",
      "--- CONVERSATION TRANSCRIPT ---",
      conversationTranscript,
      "",
      "--- LAB RESULTS ---",
      labResults,
    ].join("\n");

    return {
      patientSummary,
      medicalHistory,
      conversationTranscript,
      labResults,
    };
  },
});

export const diagnosisReportSchema = z.object({
  chiefComplaint: z.string(),
  patientSummary: z.string(),
  specialistsConsulted: z.array(z.object({
    specialist: z.string(),
    keyFindings: z.string(),
  })),
  rankedDiagnoses: z.array(z.object({
    diagnosisName: z.string(),
    confidencePercentage: z.number(),
    urgency: z.enum(["Emergent", "Urgent", "Routine"]),
    rationale: z.string(),
    supportingEvidence: z.string(),
    contradictoryEvidence: z.string(),
    suggestedNextSteps: z.string(),
  })),
  crossSpecialtyObservations: z.string(),
  recommendedImmediateActions: z.string(),
});

type DiagnosisReport = zInfer<typeof diagnosisReportSchema>;

interface CmoDecision {
  specialistsToConsult: string[];
  isFinal: boolean;
  finalReport?: DiagnosisReport;
}

/** Split a possibly multi-line string into a list of trimmed, non-empty lines */
function splitToList(value: string | undefined): string[] {
  if (!value) return [];
  // If it already looks like a bullet list, split on bullets/newlines
  return value
    .split(/\n|;\s*/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

// Step 2: Run the diagnostic analysis via the CMO supervisor agent
const runDiagnosis = createStep({
  id: "run-diagnosis",
  inputSchema: z.object({
    patientSummary: z.string(),
    medicalHistory: z.string(),
    conversationTranscript: z.string(),
    labResults: z.string(),
  }),
  outputSchema: z.object({
    diagnosisReport: diagnosisReportSchema,
  }),
  execute: async ({ inputData, mastra, runId }) => {
    const cmo = mastra.getAgent("chiefMedicalOfficer");

    // Helper to send progress updates
    const emitProgress = (message: string) => {
      // In a real system, we'd emit an event. For now, we'll use a global map via process.
      // We'll attach progress updates to the global node process since Mastra steps don't have built-in stream yet.
      if (!(global as any).jobProgress) {
        (global as any).jobProgress = new Map();
      }
      const progressMap = (global as any).jobProgress;
      if (runId) {
         if (!progressMap.has(runId)) progressMap.set(runId, []);
         progressMap.get(runId).push({ time: new Date().toISOString(), message });
      }
    };

    const MAX_ROUNDS = MAX_DIAGNOSIS_ROUNDS;
    let round = 1;
    let allConsultedSpecialists = new Set<string>();
    let contextHistory = [
      "=== PATIENT CASE ===",
      inputData.patientSummary,
    ];
    
    let finalDiagnosisReport: DiagnosisReport | null = null;

    const runLoop = async () => {
      while (round <= MAX_ROUNDS) {
        const prompt = `You are starting Round ${round} of diagnosis.
Here is the case and history of consultations so far:

${contextHistory.join("\n\n")}

Based on the above, please decide which specialists you need to consult in this round.
If you have enough information to make a final diagnosis and do not need to consult any additional specialists, set "isFinal" to true and provide the "finalReport" as instructed in your responsibilities.
Only return a list of specialists that have NOT been consulted yet if you need them.
Specialists consulted so far: ${Array.from(allConsultedSpecialists).join(", ") || "None"}
`;

        emitProgress(`Round ${round} Analysis: Asking CMO for decision on needed specialists...`);
        const cmoDecision = await cmo.generate(prompt, {
          structuredOutput: {
            jsonPromptInjection: true,
            schema: z.object({
              specialistsToConsult: z.array(z.string()).describe("List of specialist IDs (e.g. 'generalist', 'cardiologist') to consult in this round. Empty if no more needed."),
              isFinal: z.boolean().describe("True if you are ready to produce the final report."),
              finalReport: diagnosisReportSchema.optional().describe("The final comprehensive differential diagnosis report. Only required if isFinal is true."),
            })
          }
        });
        
        const { specialistsToConsult, isFinal, finalReport } = cmoDecision.object as CmoDecision;

        if (isFinal && finalReport) {
          emitProgress(`CMO has determined no further consultations are needed and finalized the report.`);
          finalDiagnosisReport = finalReport;
          break;
        }
        
        // Filter out already consulted specialists
        const newSpecialists = (specialistsToConsult || []).filter((id: string) => !allConsultedSpecialists.has(id));
        
        if (newSpecialists.length === 0) {
          emitProgress(`No new specialists requested. Compiling final report...`);
          // No new specialists added, force final report
          const finalPrompt = `You did not request any new specialists, or there are no more to consult. Please provide the final comprehensive differential diagnosis report based on the case and the consultations obtained so far.

${contextHistory.join("\n\n")}`;
          const finalResponse = await cmo.generate(finalPrompt, {
             structuredOutput: {
               jsonPromptInjection: true,
               schema: diagnosisReportSchema
             }
          });
          finalDiagnosisReport = finalResponse.object;
          break;
        }
        
        // Call the new specialists
        emitProgress(`CMO requested consultations from: ${newSpecialists.join(", ")}`);
        const promises = newSpecialists.map(async (specId: string) => {
          try {
            const specAgent = mastra.getAgent(specId);
            if (specAgent) {
              allConsultedSpecialists.add(specId);
              emitProgress(`Calling specialist ${specId}...`);
              const specResponse = await specAgent.generate(`Please analyze this case from the perspective of a ${specId}:\n\n${inputData.patientSummary}`);
              emitProgress(`Received analysis from ${specId}`);
              return `=== ${specId} Consult ===\n${specResponse.text}`;
            } else {
               return `=== ${specId} Consult ===\nFailed to reach specialist (Not Found).`;
            }
          } catch (e) {
            console.warn(`Failed to consult specialist ${specId}`, e);
            return `=== ${specId} Consult ===\nFailed to consult specialist: ${e instanceof Error ? e.message : 'Unknown error'}`;
          }
        });
        
        const results = await Promise.all(promises);
        
        if (results.length > 0) {
           contextHistory.push(`=== Results from Round ${round} ===\n\n` + results.join("\n\n"));
        }
        
        round++;
      }

      if (!finalDiagnosisReport) {
         // Reached max rounds without final report
         const finalPrompt = `Maximum diagnostic rounds (${MAX_ROUNDS}) reached. Please provide the final comprehensive differential diagnosis report based on the case and the consultations obtained so far.
          
${contextHistory.join("\n\n")}`;
         const finalResponse = await cmo.generate(finalPrompt, {
            structuredOutput: {
              jsonPromptInjection: true,
              schema: diagnosisReportSchema
            }
         });
         finalDiagnosisReport = finalResponse.object;
      }
    };

    try {
      await Promise.race([
        runLoop(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Diagnosis timed out after ${DIAGNOSIS_TIMEOUT_MS}ms`)),
            DIAGNOSIS_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Diagnosis generation failed: ${message}`);
    }

    if (!finalDiagnosisReport) {
      throw new Error("Diagnosis generation returned an empty response");
    }

    return {
      diagnosisReport: finalDiagnosisReport,
    };
  },
});

// Step 3: Format the final report for the frontend
const formatReport = createStep({
  id: "format-report",
  inputSchema: z.object({
    diagnosisReport: diagnosisReportSchema,
  }),
  outputSchema: z.object({
    report: z.object({
      chiefComplaint: z.string(),
      patientSummary: z.string(),
      specialistsConsulted: z.array(z.object({
        specialist: z.string(),
        keyFindings: z.string(),
      })),
      diagnoses: z.array(z.object({
        rank: z.number(),
        name: z.string(),
        confidence: z.number(),
        urgency: z.enum(["emergent", "urgent", "routine"]),
        rationale: z.string(),
        supportingEvidence: z.array(z.string()),
        contradictoryEvidence: z.array(z.string()),
        nextSteps: z.array(z.string()),
      })),
      crossSpecialtyObservations: z.string(),
      recommendedImmediateActions: z.string(),
    }),
    generatedAt: z.string(),
    disclaimer: z.string(),
  }),
  execute: async ({ inputData }) => {
    const raw = inputData.diagnosisReport;

    const disclaimer =
      "IMPORTANT: This AI-generated report is intended for clinical decision support only. " +
      "It is not a substitute for professional medical advice, diagnosis, or treatment. " +
      "All outputs must be reviewed by a qualified healthcare professional.";

    return {
      report: {
        chiefComplaint: raw.chiefComplaint ?? "",
        patientSummary: raw.patientSummary ?? "",
        specialistsConsulted: raw.specialistsConsulted ?? [],
        diagnoses: (raw.rankedDiagnoses ?? []).map((d: DiagnosisReport["rankedDiagnoses"][number], i: number) => ({
          rank: i + 1,
          name: d.diagnosisName ?? "",
          confidence: d.confidencePercentage ?? 0,
          urgency: (d.urgency?.toLowerCase() ?? "routine") as "emergent" | "urgent" | "routine",
          rationale: d.rationale ?? "",
          supportingEvidence: splitToList(d.supportingEvidence),
          contradictoryEvidence: splitToList(d.contradictoryEvidence),
          nextSteps: splitToList(d.suggestedNextSteps),
        })),
        crossSpecialtyObservations: raw.crossSpecialtyObservations ?? "",
        recommendedImmediateActions: raw.recommendedImmediateActions ?? "",
      },
      generatedAt: new Date().toISOString(),
      disclaimer,
    };
  },
});

export const diagnosticWorkflow = createWorkflow({
  id: "diagnostic-workflow",
  inputSchema: z.object({
    medicalHistory: z.string(),
    conversationTranscript: z.string(),
    labResults: z.string(),
  }),
  outputSchema: z.object({
    report: z.object({
      chiefComplaint: z.string(),
      patientSummary: z.string(),
      specialistsConsulted: z.array(z.object({
        specialist: z.string(),
        keyFindings: z.string(),
      })),
      diagnoses: z.array(z.object({
        rank: z.number(),
        name: z.string(),
        confidence: z.number(),
        urgency: z.enum(["emergent", "urgent", "routine"]),
        rationale: z.string(),
        supportingEvidence: z.array(z.string()),
        contradictoryEvidence: z.array(z.string()),
        nextSteps: z.array(z.string()),
      })),
      crossSpecialtyObservations: z.string(),
      recommendedImmediateActions: z.string(),
    }),
    generatedAt: z.string(),
    disclaimer: z.string(),
  }),
})
  .then(parseInput)
  .then(runDiagnosis)
  .then(formatReport)
  .commit();
