import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z, type infer as zInfer } from "zod";
import {
  AGENT_GENERATE_MAX_RETRIES,
  AGENT_GENERATE_RETRY_BASE_DELAY,
  DIAGNOSIS_TIMEOUT_MS,
  MAX_DIAGNOSIS_ROUNDS,
  SPECIALIST_CONTEXT_MODE,
  SPECIALIST_CONTEXT_MAX_CHARS,
} from "../config";
import { progressStore } from "../progress-store";
import { logger } from "../utils/logger";
import { agentList } from "../agents";

const specialistNameMap = new Map<string, string>();
for (const agent of agentList) {
  specialistNameMap.set(agent.id.toLowerCase(), agent.name);
}

export function normalizeSpecialistName(name: string): string {
  const lookedUp = specialistNameMap.get(name.toLowerCase());
  if (lookedUp) return lookedUp;
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function limitConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    // Each iteration gets its own `i` binding (JS `let` in `for` creates per-iteration scope)
    const p = fn(items[i]).then((result) => {
      results[i] = result;
      executing.delete(p);
    });
    executing.add(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = AGENT_GENERATE_MAX_RETRIES,
  baseDelay = AGENT_GENERATE_RETRY_BASE_DELAY,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      if (attempt >= maxRetries) throw e;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Step 1: Validate and structure the incoming patient data
export const parseInput = createStep({
  id: "parse-input",
  inputSchema: z.object({
    medicalHistory: z.string(),
    conversationTranscript: z.string(),
    labResults: z.string(),
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
  specialistsConsulted: z.array(
    z.object({
      specialist: z.string(),
      keyFindings: z.string(),
    }),
  ),
  rankedDiagnoses: z.array(
    z.object({
      diagnosisName: z.string(),
      confidencePercentage: z.number(),
      urgency: z.enum(["Emergent", "Urgent", "Routine"]),
      rationale: z.string(),
      supportingEvidence: z.string(),
      contradictoryEvidence: z.string(),
      suggestedNextSteps: z.string(),
    }),
  ),
  crossSpecialtyObservations: z.string(),
  recommendedImmediateActions: z.string(),
});

type DiagnosisReport = zInfer<typeof diagnosisReportSchema>;

interface CmoDecision {
  specialistsToConsult: CmoSpecialistRequest[];
  isFinal: boolean;
  finalReport?: DiagnosisReport;
}

/** Split a possibly multi-line string into a list of trimmed, non-empty lines */
export function splitToList(value: string | undefined): string[] {
  if (!value) return [];
  // If it already looks like a bullet list, split on bullets/newlines
  return value
    .split(/\n|;\s*/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

interface CmoSpecialistRequest {
  id: string;
  contextDirective?: string;
}

/** Build context string to inject into a specialist's prompt */
export function buildSpecialistContext(params: {
  mode: string;
  specId: string;
  contextDirective?: string;
  contextHistory: string[];
  maxChars: number;
}): string {
  const { mode, contextDirective, contextHistory, maxChars } = params;
  if (mode === "none") return "";

  const parts: string[] = [];

  if (mode === "prior_rounds" || mode === "full") {
    if (contextHistory.length > 1) {
      parts.push(
        "=== Prior Consultation Results ===\n" +
          contextHistory.slice(1).join("\n\n"),
      );
    }
  }

  if (mode === "cmo_curated" && contextDirective) {
    parts.push(`=== CMO Context Directive ===\n${contextDirective}`);
    if (contextHistory.length > 1) {
      parts.push(
        "=== Prior Consultation Results ===\n" +
          contextHistory.slice(1).join("\n\n"),
      );
    }
  }

  if (mode === "full" && contextDirective) {
    parts.unshift(`=== CMO Context Directive ===\n${contextDirective}`);
  }

  let assembled = parts.join("\n\n");
  if (assembled.length > maxChars) {
    assembled =
      assembled.slice(0, maxChars) +
      "\n\n[Context truncated due to length limit]";
  }
  return assembled;
}

/** Mock diagnosis for E2E testing — returns a realistic canned response */
async function mockDiagnosis(
  _patientSummary: string,
  emitProgress: (msg: string) => void,
): Promise<{ diagnosisReport: DiagnosisReport }> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  emitProgress(
    "Round 1 Analysis: Asking CMO for decision on needed specialists...",
  );
  await delay(100);

  const specialists = [
    { id: "cardiologist", hasContext: false },
    { id: "neurologist", hasContext: false },
    { id: "nephrologist", hasContext: false },
  ];
  for (const spec of specialists) {
    emitProgress(
      `Calling specialist ${spec.id}${spec.hasContext ? " (with CMO context directive)" : ""}...`,
    );
    await delay(80);
    emitProgress(`Received analysis from ${spec.id}`);
  }

  emitProgress(
    "Round 2 Analysis: CMO sharing prior findings with additional specialists...",
  );
  await delay(100);

  emitProgress(
    "CMO has determined no further consultations are needed and finalized the report.",
  );
  await delay(50);

  return {
    diagnosisReport: {
      chiefComplaint: "Severe headache with blurred vision",
      patientSummary:
        "45-year-old male with history of hypertension presenting with 3-day severe headache and blurred vision.",
      specialistsConsulted: [
        {
          specialist: "cardiologist",
          keyFindings:
            "Severe hypertension likely contributing to headache. BP 180/110 suggests hypertensive urgency.",
        },
        {
          specialist: "neurologist",
          keyFindings:
            "Blurred vision with severe headache raises concern for papilledema and increased intracranial pressure.",
        },
        {
          specialist: "nephrologist",
          keyFindings:
            "Elevated BP with possible renal involvement. Recommend basic metabolic panel and urinalysis.",
        },
      ],
      rankedDiagnoses: [
        {
          diagnosisName: "Hypertensive Urgency",
          confidencePercentage: 85,
          urgency: "Emergent" as const,
          rationale:
            "Severe headache with BP 180/110 and blurred vision strongly suggest hypertensive urgency.",
          supportingEvidence:
            "BP 180/110\nHistory of hypertension\nBlurred vision",
          contradictoryEvidence: "None identified",
          suggestedNextSteps:
            "Lower BP with IV antihypertensives\nOphthalmologic exam\nCT head to rule out hemorrhage",
        },
        {
          diagnosisName: "Migraine with Aura",
          confidencePercentage: 45,
          urgency: "Urgent" as const,
          rationale:
            "Severe headache with visual changes could represent migraine, though less likely given BP readings.",
          supportingEvidence: "Severe headache\nVisual disturbances",
          contradictoryEvidence:
            "No prior migraine history\nBP 180/110 suggests secondary cause",
          suggestedNextSteps:
            "Consider migraine workup if BP control does not resolve symptoms\nTrial of analgesics",
        },
        {
          diagnosisName: "Tension-Type Headache",
          confidencePercentage: 20,
          urgency: "Routine" as const,
          rationale:
            "Less likely given severity and associated visual symptoms, but possible comorbid condition.",
          supportingEvidence: "Headache as primary symptom",
          contradictoryEvidence:
            "Blurred vision not typical\nBP elevation suggests secondary cause",
          suggestedNextSteps:
            "Stress management\nFollow up if symptoms persist",
        },
      ],
      crossSpecialtyObservations:
        "All consultants agree that blood pressure control is the immediate priority. Neurology and cardiology both recommend neuroimaging.",
      recommendedImmediateActions:
        "Administer IV antihypertensive medication. Order STAT CT head. Consult ophthalmology for fundoscopic exam.",
    },
  };
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
    const emitProgress = (message: string) => {
      if (runId) {
        progressStore.emitMessage(runId, message);
      }
    };

    // Mock mode: return a canned response without calling real LLMs
    if (process.env.MOCK_LLM) {
      return mockDiagnosis(inputData.patientSummary, emitProgress);
    }

    const cmo = mastra.getAgent("chiefMedicalOfficer");

    const MAX_ROUNDS = MAX_DIAGNOSIS_ROUNDS;
    let round = 1;
    const allConsultedSpecialists = new Set<string>();
    const contextHistory = ["=== PATIENT CASE ===", inputData.patientSummary];

    let finalDiagnosisReport: DiagnosisReport | null = null;

    const runLoop = async () => {
      while (round <= MAX_ROUNDS) {
        const contextModeInstructions: Record<string, string> = {
          none: "Return a simple list of specialist IDs. No context directives are needed — specialists will see only the raw patient data.",
          prior_rounds:
            "Specialists will automatically receive the full consultation history from all prior rounds. You may include optional context directives to highlight specific findings.",
          cmo_curated:
            "For each specialist, include a brief 'contextDirective' telling them what prior findings or hypotheses to focus on. Be specific and concise (1-3 sentences).",
          full: "Specialists will receive all prior consultation results. Include context directives to highlight key cross-specialty correlations.",
        };

        const prompt = `You are starting Round ${round} of diagnosis.
Here is the case and history of consultations so far:

${contextHistory.join("\n\n")}

Based on the above, please decide which specialists you need to consult in this round.

${contextModeInstructions[SPECIALIST_CONTEXT_MODE] || contextModeInstructions.none}

Only return specialists that have NOT been consulted yet.
Specialists consulted so far: ${Array.from(allConsultedSpecialists).join(", ") || "None"}

If you have enough information to make a final diagnosis, set "isFinal" to true and provide the "finalReport".`;

        emitProgress(
          `Round ${round} Analysis: Asking CMO for decision on needed specialists...`,
        );
        const cmoDecision = await withRetry(
          () =>
            cmo.generate(prompt, {
              structuredOutput: {
                jsonPromptInjection: true,
                schema: z.object({
                  specialistsToConsult: z
                    .array(
                      z.object({
                        id: z
                          .string()
                          .describe(
                            "Specialist ID (e.g. 'generalist', 'cardiologist')",
                          ),
                        contextDirective: z
                          .string()
                          .optional()
                          .describe(
                            "Brief instruction telling this specialist what prior findings to focus on. 1-3 sentences. Omit if no relevant prior findings exist.",
                          ),
                      }),
                    )
                    .describe(
                      "List of specialists to consult this round. Empty if no more needed.",
                    ),
                  isFinal: z
                    .boolean()
                    .describe(
                      "True if you are ready to produce the final report.",
                    ),
                  finalReport: diagnosisReportSchema
                    .optional()
                    .describe(
                      "The final comprehensive differential diagnosis report. Only required if isFinal is true.",
                    ),
                }),
              },
            }),
          AGENT_GENERATE_MAX_RETRIES,
          AGENT_GENERATE_RETRY_BASE_DELAY,
        );

        if (!cmoDecision.object) {
          emitProgress(
            `CMO returned an unparseable response in round ${round}, retrying...`,
          );
          continue;
        }

        const { specialistsToConsult, isFinal, finalReport } =
          cmoDecision.object as CmoDecision;

        if (isFinal && finalReport) {
          emitProgress(
            `CMO has determined no further consultations are needed and finalized the report.`,
          );
          finalDiagnosisReport = finalReport;
          break;
        }

        // Filter to new specialists only
        const newSpecialistRequests = (specialistsToConsult || []).filter(
          (s) => !allConsultedSpecialists.has(s.id),
        );

        if (newSpecialistRequests.length === 0) {
          emitProgress(
            `No new specialists requested. Compiling final report...`,
          );
          const finalPrompt = `You did not request any new specialists, or there are no more to consult. Please provide the final comprehensive differential diagnosis report based on the case and the consultations obtained so far.

${contextHistory.join("\n\n")}`;
          const finalResponse = await withRetry(
            () =>
              cmo.generate(finalPrompt, {
                structuredOutput: {
                  jsonPromptInjection: true,
                  schema: diagnosisReportSchema,
                },
              }),
            AGENT_GENERATE_MAX_RETRIES,
            AGENT_GENERATE_RETRY_BASE_DELAY,
          );
          finalDiagnosisReport = finalResponse.object;
          break;
        }

        // Call the new specialists
        emitProgress(
          `CMO requested consultations from: ${newSpecialistRequests.map((s) => s.id).join(", ")}`,
        );

        const results = await limitConcurrency(
          newSpecialistRequests,
          3,
          async (specRequest: CmoSpecialistRequest) => {
            const specId = specRequest.id;
            try {
              const specAgent = mastra.getAgent(specId);
              if (specAgent) {
                allConsultedSpecialists.add(specId);
                emitProgress(`Calling specialist ${specId}...`);

                const specialistContext = buildSpecialistContext({
                  mode: SPECIALIST_CONTEXT_MODE,
                  specId,
                  contextDirective: specRequest.contextDirective,
                  contextHistory,
                  maxChars: SPECIALIST_CONTEXT_MAX_CHARS,
                });

                const specPrompt = specialistContext
                  ? `Please analyze this case from the perspective of a ${specId}.\n\n${specialistContext}\n\n=== PATIENT DATA ===\n${inputData.patientSummary}`
                  : `Please analyze this case from the perspective of a ${specId}:\n\n${inputData.patientSummary}`;

                const specStart = Date.now();
                const specResponse = await withRetry(
                  () => specAgent.generate(specPrompt),
                  AGENT_GENERATE_MAX_RETRIES,
                  AGENT_GENERATE_RETRY_BASE_DELAY,
                );
                logger.specialistCall(
                  specId,
                  runId ?? "unknown",
                  Date.now() - specStart,
                  true,
                );

                emitProgress(`Received analysis from ${specId}`);
                return `=== ${specId} Consult ===\n${specResponse.text}`;
              } else {
                return `=== ${specId} Consult ===\nFailed to reach specialist (Not Found).`;
              }
            } catch (e) {
              const message = e instanceof Error ? e.message : "Unknown error";
              logger.specialistCall(specId, runId ?? "unknown", 0, false);
              logger.warn("specialist_call_failed", {
                specialistId: specId,
                jobId: runId,
                error: message,
              });
              emitProgress(`Failed to receive analysis from ${specId}`);
              return `=== ${specId} Consult ===\nFailed to consult specialist: ${message}`;
            }
          },
        );

        if (results.length > 0) {
          contextHistory.push(
            `=== Results from Round ${round} ===\n\n` + results.join("\n\n"),
          );
        }

        round++;
      }

      if (!finalDiagnosisReport) {
        // Reached max rounds without final report
        const finalPrompt = `Maximum diagnostic rounds (${MAX_ROUNDS}) reached. Please provide the final comprehensive differential diagnosis report based on the case and the consultations obtained so far.
          
${contextHistory.join("\n\n")}`;
        const finalResponse = await withRetry(
          () =>
            cmo.generate(finalPrompt, {
              structuredOutput: {
                jsonPromptInjection: true,
                schema: diagnosisReportSchema,
              },
            }),
          AGENT_GENERATE_MAX_RETRIES,
          AGENT_GENERATE_RETRY_BASE_DELAY,
        );
        finalDiagnosisReport = finalResponse.object;
      }
    };

    try {
      await Promise.race([
        runLoop(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Diagnosis timed out after ${DIAGNOSIS_TIMEOUT_MS}ms`,
                ),
              ),
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
export const formatReport = createStep({
  id: "format-report",
  inputSchema: z.object({
    diagnosisReport: diagnosisReportSchema,
  }),
  outputSchema: z.object({
    report: z.object({
      chiefComplaint: z.string(),
      patientSummary: z.string(),
      specialistsConsulted: z.array(
        z.object({
          specialist: z.string(),
          keyFindings: z.string(),
        }),
      ),
      diagnoses: z.array(
        z.object({
          rank: z.number(),
          name: z.string(),
          confidence: z.number(),
          urgency: z.enum(["emergent", "urgent", "routine"]),
          rationale: z.string(),
          supportingEvidence: z.array(z.string()),
          contradictoryEvidence: z.array(z.string()),
          nextSteps: z.array(z.string()),
        }),
      ),
      crossSpecialtyObservations: z.string(),
      recommendedImmediateActions: z.string(),
    }),
    generatedAt: z.string(),
    disclaimer: z.string(),
  }),
  execute: async ({ inputData }) => {
    const raw = inputData.diagnosisReport;

    const disclaimer =
      "RESEARCH USE ONLY — NOT FOR CLINICAL USE. " +
      "This report is generated by a proof-of-concept AI system and is not a medical device. " +
      "It is not HIPAA-compliant and has no regulatory approval. " +
      "All outputs are AI-generated suggestions with no guarantee of accuracy. " +
      "Never rely on this report for medical diagnosis, treatment decisions, or patient care. " +
      "Always consult a qualified healthcare professional. " +
      "By using this tool, you accept all risk and release the operators from any liability.";

    return {
      report: {
        chiefComplaint: raw.chiefComplaint ?? "",
        patientSummary: raw.patientSummary ?? "",
        specialistsConsulted: (raw.specialistsConsulted ?? []).map(
          (sc: { specialist: string; keyFindings: string }) => ({
            ...sc,
            specialist: normalizeSpecialistName(sc.specialist),
          }),
        ),
        diagnoses: (raw.rankedDiagnoses ?? []).map(
          (d: DiagnosisReport["rankedDiagnoses"][number], i: number) => ({
            rank: i + 1,
            name: d.diagnosisName ?? "",
            confidence: d.confidencePercentage ?? 0,
            urgency: (d.urgency?.toLowerCase() ?? "routine") as
              | "emergent"
              | "urgent"
              | "routine",
            rationale: d.rationale ?? "",
            supportingEvidence: splitToList(d.supportingEvidence),
            contradictoryEvidence: splitToList(d.contradictoryEvidence),
            nextSteps: splitToList(d.suggestedNextSteps),
          }),
        ),
        crossSpecialtyObservations: raw.crossSpecialtyObservations ?? "",
        recommendedImmediateActions: raw.recommendedImmediateActions ?? "",
      },
      generatedAt: new Date().toISOString(),
      disclaimer,
    };
  },
});

export const reportSchema = z.object({
  chiefComplaint: z.string(),
  patientSummary: z.string(),
  specialistsConsulted: z.array(
    z.object({
      specialist: z.string(),
      keyFindings: z.string(),
    }),
  ),
  diagnoses: z.array(
    z.object({
      rank: z.number(),
      name: z.string(),
      confidence: z.number(),
      urgency: z.enum(["emergent", "urgent", "routine"]),
      rationale: z.string(),
      supportingEvidence: z.array(z.string()),
      contradictoryEvidence: z.array(z.string()),
      nextSteps: z.array(z.string()),
    }),
  ),
  crossSpecialtyObservations: z.string(),
  recommendedImmediateActions: z.string(),
});

export const diagnosticWorkflow = createWorkflow({
  id: "diagnostic-workflow",
  inputSchema: z.object({
    medicalHistory: z.string(),
    conversationTranscript: z.string(),
    labResults: z.string(),
  }),
  outputSchema: z.object({
    report: reportSchema,
    generatedAt: z.string(),
    disclaimer: z.string(),
  }),
})
  .then(parseInput)
  .then(runDiagnosis)
  .then(formatReport)
  .commit();
