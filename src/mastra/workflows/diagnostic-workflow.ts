import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { DIAGNOSIS_TIMEOUT_MS } from "../config";

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
    diagnosisReport: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent("chiefMedicalOfficer");

    const prompt = [
      "Please analyze the following patient case and produce a comprehensive differential diagnosis report.",
      "",
      inputData.patientSummary,
    ].join("\n");

    let result;
    try {
      result = await Promise.race([
        agent.generate(prompt, { maxSteps: 15 }),
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

    if (!result.text) {
      throw new Error("Diagnosis generation returned an empty response");
    }

    return {
      diagnosisReport: result.text,
    };
  },
});

// Step 3: Format the final report
const formatReport = createStep({
  id: "format-report",
  inputSchema: z.object({
    diagnosisReport: z.string(),
  }),
  outputSchema: z.object({
    report: z.string(),
    generatedAt: z.string(),
    disclaimer: z.string(),
  }),
  execute: async ({ inputData }) => {
    const disclaimer =
      "IMPORTANT: This AI-generated report is intended for clinical decision support only. " +
      "It is not a substitute for professional medical advice, diagnosis, or treatment. " +
      "All outputs must be reviewed by a qualified healthcare professional.";

    return {
      report: inputData.diagnosisReport,
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
    report: z.string(),
    generatedAt: z.string(),
    disclaimer: z.string(),
  }),
})
  .then(parseInput)
  .then(runDiagnosis)
  .then(formatReport)
  .commit();
