import { z } from "zod";

export const reportSchema = z.strictObject({
  chiefComplaint: z.string(),
  patientSummary: z.string(),
  specialistsConsulted: z.array(
    z.strictObject({
      specialist: z.string(),
      keyFindings: z.string(),
    }),
  ),
  diagnoses: z.array(
    z.strictObject({
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

export const reportGenerationErrorCodes = [
  "REPORT_PROVIDER_UNAVAILABLE",
  "REPORT_VALIDATION_FAILED",
  "REPORT_EMPTY_RESPONSE",
] as const;

export const reportGenerationErrorCodeSchema = z.enum(
  reportGenerationErrorCodes,
);

export type ReportGenerationErrorCode = z.infer<
  typeof reportGenerationErrorCodeSchema
>;

export const REPORT_SAFETY_GUIDANCE =
  "No diagnostic report is available. Seek evaluation from a qualified healthcare professional. If symptoms are severe, rapidly worsening, or may be an emergency, contact local emergency services now.";

export const reportGenerationFailureDetails = {
  REPORT_PROVIDER_UNAVAILABLE: {
    message:
      "The report service is temporarily unavailable. No diagnostic report was produced.",
    retryable: true,
  },
  REPORT_VALIDATION_FAILED: {
    message:
      "A safe, validated report could not be produced. No diagnostic report is available.",
    retryable: false,
  },
  REPORT_EMPTY_RESPONSE: {
    message:
      "The report service returned no usable content. No diagnostic report was produced.",
    retryable: true,
  },
} as const satisfies Record<
  ReportGenerationErrorCode,
  { message: string; retryable: boolean }
>;

export const availableReportOutcomeSchema = z.strictObject({
  status: z.literal("available"),
  report: reportSchema,
  generatedAt: z.string(),
  disclaimer: z.string(),
});

export const generationFailedReportOutcomeSchema = z.strictObject({
  status: z.literal("generation_failed"),
  errorCode: reportGenerationErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  safetyGuidance: z.string(),
});

export const reportOutcomeSchema = z.discriminatedUnion("status", [
  availableReportOutcomeSchema,
  generationFailedReportOutcomeSchema,
]);

export type DiagnosisReport = z.infer<typeof reportSchema>;
export type AvailableReportOutcome = z.infer<
  typeof availableReportOutcomeSchema
>;
export type GenerationFailedReportOutcome = z.infer<
  typeof generationFailedReportOutcomeSchema
>;
export type ReportOutcome = z.infer<typeof reportOutcomeSchema>;

export function createGenerationFailedReportOutcome(
  errorCode: ReportGenerationErrorCode,
): GenerationFailedReportOutcome {
  const details = reportGenerationFailureDetails[errorCode];
  return {
    status: "generation_failed",
    errorCode,
    message: details.message,
    retryable: details.retryable,
    safetyGuidance: REPORT_SAFETY_GUIDANCE,
  };
}
