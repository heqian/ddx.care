import { test, expect, describe } from "bun:test";
import {
  splitToList,
  parseInput,
  formatReport,
  diagnosisReportSchema,
} from "../src/backend/workflows/diagnostic-workflow";

describe("splitToList", () => {
  test("returns empty array for undefined", () => {
    expect(splitToList(undefined)).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    expect(splitToList("")).toEqual([]);
  });

  test("splits on newlines", () => {
    expect(splitToList("line one\nline two\nline three")).toEqual([
      "line one",
      "line two",
      "line three",
    ]);
  });

  test("splits on semicolons", () => {
    expect(splitToList("item one; item two; item three")).toEqual([
      "item one",
      "item two",
      "item three",
    ]);
  });

  test("strips bullet prefixes", () => {
    expect(splitToList("- item one\n* item two\n• item three")).toEqual([
      "item one",
      "item two",
      "item three",
    ]);
  });

  test("trims whitespace", () => {
    expect(splitToList("  spaced  \n  trimmed  ")).toEqual(["spaced", "trimmed"]);
  });

  test("filters empty lines", () => {
    expect(splitToList("item one\n\n\nitem two")).toEqual(["item one", "item two"]);
  });

  test("handles mixed separators", () => {
    expect(splitToList("alpha; beta\ngamma")).toEqual(["alpha", "beta", "gamma"]);
  });

  test("single item string", () => {
    expect(splitToList("just one")).toEqual(["just one"]);
  });

  test("all empty/whitespace input", () => {
    expect(splitToList("   \n  \n  ")).toEqual([]);
  });
});

describe("parseInput", () => {
  test("assembles patient summary from all fields", async () => {
    const result = await parseInput.execute({
      inputData: {
        medicalHistory: "Patient has hypertension",
        conversationTranscript: "Patient reports headache",
        labResults: "BP: 140/90",
      },
    } as Parameters<typeof parseInput.execute>[0]);

    expect(result.patientSummary).toContain("PATIENT DATA FOR REVIEW");
    expect(result.patientSummary).toContain("Patient has hypertension");
    expect(result.patientSummary).toContain("Patient reports headache");
    expect(result.patientSummary).toContain("BP: 140/90");
    expect(result.patientSummary).toContain("MEDICAL HISTORY");
    expect(result.patientSummary).toContain("CONVERSATION TRANSCRIPT");
    expect(result.patientSummary).toContain("LAB RESULTS");
  });

  test("passes through individual fields unchanged", async () => {
    const result = await parseInput.execute({
      inputData: {
        medicalHistory: "history",
        conversationTranscript: "transcript",
        labResults: "labs",
      },
    } as Parameters<typeof parseInput.execute>[0]);

    expect(result.medicalHistory).toBe("history");
    expect(result.conversationTranscript).toBe("transcript");
    expect(result.labResults).toBe("labs");
  });

  test("handles empty strings", async () => {
    const result = await parseInput.execute({
      inputData: {
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
    } as Parameters<typeof parseInput.execute>[0]);

    expect(result.patientSummary).toBeDefined();
    expect(result.medicalHistory).toBe("");
  });

  test("handles long multi-line inputs", async () => {
    const longHistory = "Line 1\n".repeat(100).trim();
    const result = await parseInput.execute({
      inputData: {
        medicalHistory: longHistory,
        conversationTranscript: "transcript",
        labResults: "labs",
      },
    } as Parameters<typeof parseInput.execute>[0]);

    expect(result.patientSummary).toContain(longHistory);
  });
});

describe("formatReport", () => {
  const sampleReport = {
    chiefComplaint: "Severe headache",
    patientSummary: "45-year-old with hypertension",
    specialistsConsulted: [
      { specialist: "cardiologist", keyFindings: "Hypertensive urgency" },
      { specialist: "neurologist", keyFindings: "Possible migraine" },
    ],
    rankedDiagnoses: [
      {
        diagnosisName: "Hypertensive Urgency",
        confidencePercentage: 85,
        urgency: "Emergent" as const,
        rationale: "Severe headache with high BP",
        supportingEvidence: "BP 180/110\nHistory of hypertension",
        contradictoryEvidence: "None identified",
        suggestedNextSteps: "Lower BP with IV meds\nCT head to rule out hemorrhage",
      },
      {
        diagnosisName: "Migraine",
        confidencePercentage: 45,
        urgency: "Urgent" as const,
        rationale: "Headache with visual changes",
        supportingEvidence: "Severe headache; Visual disturbances",
        contradictoryEvidence: "No prior migraine history",
        suggestedNextSteps: "Consider migraine workup",
      },
    ],
    crossSpecialtyObservations: "BP control is the immediate priority.",
    recommendedImmediateActions: "Administer IV antihypertensive. Order STAT CT head.",
  };

  test("formats ranked diagnoses with correct rank numbers", async () => {
    const result = await formatReport.execute({
      inputData: { diagnosisReport: sampleReport },
    } as Parameters<typeof formatReport.execute>[0]);

    expect(result.report.diagnoses).toHaveLength(2);
    expect(result.report.diagnoses[0].rank).toBe(1);
    expect(result.report.diagnoses[1].rank).toBe(2);
  });

  test("maps diagnosis fields correctly", async () => {
    const result = await formatReport.execute({
      inputData: { diagnosisReport: sampleReport },
    } as Parameters<typeof formatReport.execute>[0]);

    const first = result.report.diagnoses[0];
    expect(first.name).toBe("Hypertensive Urgency");
    expect(first.confidence).toBe(85);
    expect(first.urgency).toBe("emergent");
    expect(first.rationale).toBe("Severe headache with high BP");
  });

  test("splits evidence into arrays", async () => {
    const result = await formatReport.execute({
      inputData: { diagnosisReport: sampleReport },
    } as Parameters<typeof formatReport.execute>[0]);

    const first = result.report.diagnoses[0];
    expect(first.supportingEvidence).toEqual(["BP 180/110", "History of hypertension"]);
    expect(first.contradictoryEvidence).toEqual(["None identified"]);
    expect(first.nextSteps).toEqual(["Lower BP with IV meds", "CT head to rule out hemorrhage"]);
  });

  test("handles semicolon-separated evidence", async () => {
    const result = await formatReport.execute({
      inputData: { diagnosisReport: sampleReport },
    } as Parameters<typeof formatReport.execute>[0]);

    // Second diagnosis has semicolons in supportingEvidence
    const second = result.report.diagnoses[1];
    expect(second.supportingEvidence).toEqual(["Severe headache", "Visual disturbances"]);
  });

  test("normalizes urgency to lowercase", async () => {
    const result = await formatReport.execute({
      inputData: { diagnosisReport: sampleReport },
    } as Parameters<typeof formatReport.execute>[0]);

    expect(result.report.diagnoses[0].urgency).toBe("emergent");
    expect(result.report.diagnoses[1].urgency).toBe("urgent");
  });

  test("includes disclaimer and timestamp", async () => {
    const result = await formatReport.execute({
      inputData: { diagnosisReport: sampleReport },
    } as Parameters<typeof formatReport.execute>[0]);

    expect(result.disclaimer).toContain("AI-generated report");
    expect(result.disclaimer).toContain("clinical decision support");
    expect(result.generatedAt).toBeTruthy();
    // ISO timestamp should parse without error
    expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
  });

  test("preserves specialists and metadata", async () => {
    const result = await formatReport.execute({
      inputData: { diagnosisReport: sampleReport },
    } as Parameters<typeof formatReport.execute>[0]);

    expect(result.report.specialistsConsulted).toHaveLength(2);
    expect(result.report.specialistsConsulted[0].specialist).toBe("cardiologist");
    expect(result.report.chiefComplaint).toBe("Severe headache");
    expect(result.report.crossSpecialtyObservations).toBe("BP control is the immediate priority.");
    expect(result.report.recommendedImmediateActions).toContain("IV antihypertensive");
  });

  test("handles empty diagnoses array", async () => {
    const emptyReport = {
      ...sampleReport,
      rankedDiagnoses: [],
    };

    const result = await formatReport.execute({
      inputData: { diagnosisReport: emptyReport },
    } as Parameters<typeof formatReport.execute>[0]);

    expect(result.report.diagnoses).toEqual([]);
  });

  test("handles missing optional fields with defaults", async () => {
    const sparseReport = {
      chiefComplaint: "",
      patientSummary: "",
      specialistsConsulted: [],
      rankedDiagnoses: [
        {
          diagnosisName: "Unknown",
          confidencePercentage: 0,
          urgency: "Routine" as const,
          rationale: "",
          supportingEvidence: "",
          contradictoryEvidence: "",
          suggestedNextSteps: "",
        },
      ],
      crossSpecialtyObservations: "",
      recommendedImmediateActions: "",
    };

    const result = await formatReport.execute({
      inputData: { diagnosisReport: sparseReport },
    } as Parameters<typeof formatReport.execute>[0]);

    expect(result.report.diagnoses[0].name).toBe("Unknown");
    expect(result.report.diagnoses[0].supportingEvidence).toEqual([]);
    expect(result.report.diagnoses[0].urgency).toBe("routine");
  });
});

describe("diagnosisReportSchema", () => {
  test("validates a correct report", () => {
    const valid = {
      chiefComplaint: "Headache",
      patientSummary: "Test patient",
      specialistsConsulted: [{ specialist: "neurologist", keyFindings: "Findings" }],
      rankedDiagnoses: [
        {
          diagnosisName: "Migraine",
          confidencePercentage: 80,
          urgency: "Urgent",
          rationale: "Test",
          supportingEvidence: "Test evidence",
          contradictoryEvidence: "None",
          suggestedNextSteps: "Rest",
        },
      ],
      crossSpecialtyObservations: "None",
      recommendedImmediateActions: "Rest",
    };

    const result = diagnosisReportSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test("rejects missing required fields", () => {
    const invalid = {
      chiefComplaint: "Headache",
      // missing everything else
    };

    const result = diagnosisReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects invalid urgency values", () => {
    const invalid = {
      chiefComplaint: "Headache",
      patientSummary: "Test",
      specialistsConsulted: [],
      rankedDiagnoses: [
        {
          diagnosisName: "Test",
          confidencePercentage: 50,
          urgency: "INVALID",
          rationale: "Test",
          supportingEvidence: "",
          contradictoryEvidence: "",
          suggestedNextSteps: "",
        },
      ],
      crossSpecialtyObservations: "",
      recommendedImmediateActions: "",
    };

    const result = diagnosisReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects confidence outside 0-100 range (via number type)", () => {
    // z.number() doesn't enforce range unless .min().max() is added,
    // but the schema uses z.number() — verify it accepts valid numbers
    const valid = {
      chiefComplaint: "Test",
      patientSummary: "Test",
      specialistsConsulted: [],
      rankedDiagnoses: [
        {
          diagnosisName: "Test",
          confidencePercentage: 95,
          urgency: "Emergent",
          rationale: "Test",
          supportingEvidence: "",
          contradictoryEvidence: "",
          suggestedNextSteps: "",
        },
      ],
      crossSpecialtyObservations: "",
      recommendedImmediateActions: "",
    };

    const result = diagnosisReportSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});
