import { test, expect, describe, mock, beforeAll, afterAll } from "bun:test";
import {
  splitToList,
  parseInput,
  formatReport,
  diagnosisReportSchema,
  limitConcurrency,
  withRetry,
  normalizeSpecialistName,
  buildSpecialistContext,
  buildCmoContext,
  runDiagnosis,
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
    expect(splitToList("  spaced  \n  trimmed  ")).toEqual([
      "spaced",
      "trimmed",
    ]);
  });

  test("filters empty lines", () => {
    expect(splitToList("item one\n\n\nitem two")).toEqual([
      "item one",
      "item two",
    ]);
  });

  test("handles mixed separators", () => {
    expect(splitToList("alpha; beta\ngamma")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
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
        suggestedNextSteps:
          "Lower BP with IV meds\nCT head to rule out hemorrhage",
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
    recommendedImmediateActions:
      "Administer IV antihypertensive. Order STAT CT head.",
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
    expect(first.supportingEvidence).toEqual([
      "BP 180/110",
      "History of hypertension",
    ]);
    expect(first.contradictoryEvidence).toEqual(["None identified"]);
    expect(first.nextSteps).toEqual([
      "Lower BP with IV meds",
      "CT head to rule out hemorrhage",
    ]);
  });

  test("handles semicolon-separated evidence", async () => {
    const result = await formatReport.execute({
      inputData: { diagnosisReport: sampleReport },
    } as Parameters<typeof formatReport.execute>[0]);

    // Second diagnosis has semicolons in supportingEvidence
    const second = result.report.diagnoses[1];
    expect(second.supportingEvidence).toEqual([
      "Severe headache",
      "Visual disturbances",
    ]);
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

    expect(result.disclaimer).toContain("RESEARCH USE ONLY");
    expect(result.disclaimer).toContain("HIPAA-compliant");
    expect(result.generatedAt).toBeTruthy();
    // ISO timestamp should parse without error
    expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
  });

  test("preserves specialists and metadata", async () => {
    const result = await formatReport.execute({
      inputData: { diagnosisReport: sampleReport },
    } as Parameters<typeof formatReport.execute>[0]);

    expect(result.report.specialistsConsulted).toHaveLength(2);
    expect(result.report.specialistsConsulted[0].specialist).toBe(
      "Cardiologist",
    );
    expect(result.report.chiefComplaint).toBe("Severe headache");
    expect(result.report.crossSpecialtyObservations).toBe(
      "BP control is the immediate priority.",
    );
    expect(result.report.recommendedImmediateActions).toContain(
      "IV antihypertensive",
    );
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
      specialistsConsulted: [
        { specialist: "neurologist", keyFindings: "Findings" },
      ],
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

  test("accepts confidence within 0-100 range", () => {
    // Schema uses z.number().min(0).max(100) — verify valid values pass
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

    // Also verify boundary values
    valid.rankedDiagnoses[0].confidencePercentage = 0;
    expect(diagnosisReportSchema.safeParse(valid).success).toBe(true);

    valid.rankedDiagnoses[0].confidencePercentage = 100;
    expect(diagnosisReportSchema.safeParse(valid).success).toBe(true);
  });
});

describe("limitConcurrency", () => {
  test("processes all items and returns results in order", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await limitConcurrency(items, 2, async (n) => n * 10);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  test("respects concurrency limit", async () => {
    let activeConcurrency = 0;
    let maxConcurrency = 0;

    const items = [1, 2, 3, 4, 5, 6];
    await limitConcurrency(items, 3, async (n) => {
      activeConcurrency++;
      maxConcurrency = Math.max(maxConcurrency, activeConcurrency);
      await new Promise((r) => setTimeout(r, 50));
      activeConcurrency--;
      return n;
    });

    expect(maxConcurrency).toBeLessThanOrEqual(3);
  });

  test("handles empty items", async () => {
    const results = await limitConcurrency([], 3, async (n: number) => n);
    expect(results).toEqual([]);
  });

  test("handles single item", async () => {
    const results = await limitConcurrency([42], 5, async (n) => n * 2);
    expect(results).toEqual([84]);
  });

  test("limit greater than items count still works", async () => {
    const results = await limitConcurrency([1, 2], 10, async (n) => n + 1);
    expect(results).toEqual([2, 3]);
  });

  test("results map to correct index when tasks complete out of order", async () => {
    // Items have deliberately inverted delays: item[0] finishes last, item[2] finishes first.
    // If the index binding is broken, results would be scrambled.
    const items = [
      { id: "slow", delay: 150 },
      { id: "medium", delay: 100 },
      { id: "fast", delay: 50 },
    ];

    const completionOrder: string[] = [];

    const results = await limitConcurrency(items, 3, async (item) => {
      await new Promise((r) => setTimeout(r, item.delay));
      completionOrder.push(item.id);
      return item.id;
    });

    // Results must be in *input* order regardless of completion order
    expect(results).toEqual(["slow", "medium", "fast"]);
    // Completion order should be reversed (fast first, slow last)
    expect(completionOrder).toEqual(["fast", "medium", "slow"]);
  });

  test("handles errors without corrupting other results", async () => {
    const items = [1, 2, 3, 4];
    const results = await limitConcurrency(items, 2, async (n) => {
      if (n === 3) throw new Error("item 3 failed");
      return n * 10;
    }).catch(() => "caught");

    // The function should propagate the error (Promise.all semantics)
    expect(results).toBe("caught");
  });
});

describe("withRetry", () => {
  test("returns immediately on first success", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return "ok";
      },
      3,
      10,
    );

    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retries on failure and succeeds on nth attempt", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("fail");
        return "success";
      },
      3,
      10,
    );

    expect(result).toBe("success");
    expect(calls).toBe(3);
  });

  test("throws after exhausting all retries", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("always fails");
        },
        3,
        10,
      ),
    ).rejects.toThrow("always fails");

    expect(calls).toBe(3);
  });

  test("preserves the original error", async () => {
    await expect(
      withRetry(
        async () => {
          throw new Error("specific error message");
        },
        2,
        10,
      ),
    ).rejects.toThrow("specific error message");
  });

  test("applies exponential backoff between retries", async () => {
    const callTimes: number[] = [];

    try {
      await withRetry(
        async () => {
          callTimes.push(Date.now());
          throw new Error("fail");
        },
        3,
        50,
      ); // baseDelay = 50ms
    } catch {
      // expected
    }

    expect(callTimes.length).toBe(3);
    // With jitter: delay = baseDelay * 2^(attempt-1) * (0.5 + Math.random())
    // Gap 1→2 min: 50 * 0.5 = 25ms, max: 50 * 1.5 = 75ms
    // Gap 2→3 min: 100 * 0.5 = 50ms, max: 100 * 1.5 = 150ms
    if (callTimes.length === 3) {
      const gap1 = callTimes[1] - callTimes[0];
      const gap2 = callTimes[2] - callTimes[1];
      // With jitter: delay = baseDelay * 2^(attempt-1) * (0.5 + Math.random())
      // Gap 1→2: 50 * 1 * [0.5, 1.5) → [25ms, 75ms)
      // Gap 2→3: 50 * 2 * [0.5, 1.5) → [50ms, 150ms)
      expect(gap1).toBeGreaterThanOrEqual(15);
      expect(gap1).toBeLessThanOrEqual(100);
      expect(gap2).toBeGreaterThanOrEqual(30);
      expect(gap2).toBeLessThanOrEqual(200);
    }
  });
});

describe("normalizeSpecialistName", () => {
  test("maps known specialist IDs to display names", () => {
    expect(normalizeSpecialistName("cardiologist")).toBe("Cardiologist");
    expect(normalizeSpecialistName("neurologist")).toBe("Neurologist");
    expect(normalizeSpecialistName("generalist")).toBe("Generalist");
    expect(normalizeSpecialistName("emergencyPhysician")).toBe(
      "Emergency Physician",
    );
    expect(normalizeSpecialistName("obstetricianGynecologist")).toBe(
      "Obstetrician-Gynecologist",
    );
  });

  test("is case-insensitive for known specialists", () => {
    expect(normalizeSpecialistName("Cardiologist")).toBe("Cardiologist");
    expect(normalizeSpecialistName("CARDIOLOGIST")).toBe("Cardiologist");
    expect(normalizeSpecialistName("Neurologist")).toBe("Neurologist");
  });

  test("title-cases unknown specialist names", () => {
    expect(normalizeSpecialistName("some-unknown")).toBe("Some-Unknown");
    expect(normalizeSpecialistName("newrole")).toBe("Newrole");
    expect(normalizeSpecialistName("custom specialist")).toBe(
      "Custom Specialist",
    );
  });
});

describe("buildSpecialistContext", () => {
  const baseHistory = [
    "=== PATIENT CASE ===",
    "45yo male with headache",
    "=== Results from Round 1 ===",
    "=== cardiologist Consult ===\nBP 180/110",
  ];

  test('returns empty string in "none" mode', () => {
    expect(
      buildSpecialistContext({
        mode: "none",
        specId: "nephrologist",
        contextDirective: "Check renal",
        contextHistory: baseHistory,
        maxChars: 2000,
      }),
    ).toBe("");
  });

  test("returns prior context when available in prior_rounds mode", () => {
    const result = buildSpecialistContext({
      mode: "prior_rounds",
      specId: "cardiologist",
      contextHistory: ["=== PATIENT CASE ===", "Patient data"],
      maxChars: 2000,
    });
    expect(result).toContain("Prior Consultation Results");
    expect(result).toContain("Patient data");
  });

  test("includes prior round results in prior_rounds mode", () => {
    const result = buildSpecialistContext({
      mode: "prior_rounds",
      specId: "nephrologist",
      contextHistory: baseHistory,
      maxChars: 2000,
    });
    expect(result).toContain("Prior Consultation Results");
    expect(result).toContain("cardiologist Consult");
    expect(result).toContain("BP 180/110");
  });

  test("includes context directive in cmo_curated mode", () => {
    const result = buildSpecialistContext({
      mode: "cmo_curated",
      specId: "nephrologist",
      contextDirective: "Cardiologist found elevated BP — check for renal cause",
      contextHistory: baseHistory,
      maxChars: 2000,
    });
    expect(result).toContain("CMO Context Directive");
    expect(result).toContain("Cardiologist found elevated BP");
    expect(result).toContain("Prior Consultation Results");
  });

  test("returns empty when no directive in cmo_curated mode", () => {
    const result = buildSpecialistContext({
      mode: "cmo_curated",
      specId: "nephrologist",
      contextHistory: baseHistory,
      maxChars: 2000,
    });
    // In cmo_curated mode, no directive means no context is shared
    expect(result).toBe("");
  });

  test("truncates context exceeding maxChars", () => {
    const longHistory = [
      "=== PATIENT CASE ===",
      "Short patient data",
      "=== Results from Round 1 ===",
      `=== cardiologist Consult ===\n${"A".repeat(5000)}`,
    ];
    const result = buildSpecialistContext({
      mode: "prior_rounds",
      specId: "nephrologist",
      contextHistory: longHistory,
      maxChars: 500,
    });
    expect(result.length).toBeLessThanOrEqual(560);
    expect(result).toContain("[Context truncated due to length limit]");
  });

  test("includes both directive and prior results in full mode", () => {
    const result = buildSpecialistContext({
      mode: "full",
      specId: "nephrologist",
      contextDirective: "Focus on BP-related renal damage",
      contextHistory: baseHistory,
      maxChars: 2000,
    });
    expect(result).toContain("CMO Context Directive");
    expect(result).toContain("Prior Consultation Results");
    expect(result).toContain("cardiologist Consult");
  });
});

describe("buildCmoContext", () => {
  test("returns full context when under max chars", () => {
    const history = ["=== PATIENT CASE ===", "Patient data", "Round 1 results"];
    const result = buildCmoContext(history, 10000);
    expect(result).toBe(history.join("\n\n"));
  });

  test("returns full context when exactly at max chars", () => {
    const history = ["=== PATIENT CASE ===", "Patient data", "Round 1 results"];
    const fullLength = history.join("\n\n").length;
    const result = buildCmoContext(history, fullLength);
    expect(result).toBe(history.join("\n\n"));
  });

  test("preserves base context (first 2 entries) when truncation occurs", () => {
    const history = [
      "=== PATIENT CASE ===",
      "Patient data",
      "A".repeat(5000),
      "B".repeat(5000),
      "C".repeat(5000),
    ];
    const result = buildCmoContext(history, 12000);
    expect(result).toContain("=== PATIENT CASE ===");
    expect(result).toContain("Patient data");
    expect(result).toContain("Older consultation results omitted");
  });

  test("truncates older rounds while keeping recent ones", () => {
    const history = [
      "=== PATIENT CASE ===",
      "Patient data",
      "Round 1: " + "A".repeat(2000),
      "Round 2: " + "B".repeat(2000),
      "Round 3: " + "C".repeat(500),
    ];
    const result = buildCmoContext(history, 3000);
    expect(result).toContain("Round 3");
    expect(result).toContain("Older consultation results omitted");
    expect(result).not.toContain("Round 1:");
  });

  test("does not add omission notice when no truncation occurs", () => {
    const history = [
      "=== PATIENT CASE ===",
      "Patient data",
      "Round 1 results",
    ];
    const result = buildCmoContext(history, 10000);
    expect(result).not.toContain("omitted");
  });

  test("always preserves at least the first 2 entries even if they exceed max chars", () => {
    const history = [
      "=== PATIENT CASE ===",
      "Very long patient data " + "X".repeat(10000),
      "Round 1",
    ];
    const result = buildCmoContext(history, 100);
    expect(result).toContain("=== PATIENT CASE ===");
    expect(result).toContain("Very long patient data");
  });
});

describe("withRetry - abort signal", () => {
  test("immediately rejects if signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await expect(
      withRetry(
        () => {
          calls++;
          return Promise.resolve("ok");
        },
        3,
        100,
        controller.signal,
      ),
    ).rejects.toThrow("Aborted");
    expect(calls).toBe(0);
  });

  test("rejects during retry delay when signal is aborted", async () => {
    const controller = new AbortController();
    let calls = 0;
    const fn = () => {
      calls++;
      throw new Error("fail");
    };
    setTimeout(() => controller.abort(), 50);
    await expect(
      withRetry(fn, 10, 500, controller.signal),
    ).rejects.toThrow();
  });

  test("succeeds on first try without abort", async () => {
    const result = await withRetry(
      () => Promise.resolve("success"),
      3,
      100,
    );
    expect(result).toBe("success");
  });
});

describe("runDiagnosis - CMO parsing logic", () => {
  let savedMockLlm: string | undefined;

  beforeAll(() => {
    savedMockLlm = process.env.MOCK_LLM;
    delete process.env.MOCK_LLM;
  });

  afterAll(() => {
    if (savedMockLlm !== undefined) {
      process.env.MOCK_LLM = savedMockLlm;
    } else {
      delete process.env.MOCK_LLM;
    }
  });

  test("breaks infinite loop and forces final report after multiple unparseable responses", async () => {
    let callCount = 0;
    const mockCmoGenerate = mock(async () => {
      callCount++;
      if (callCount <= 3) {
        return { object: undefined };
      }
      return {
        object: {
          chiefComplaint: "Mock Complaint",
          patientSummary: "Mock Patient",
          specialistsConsulted: [],
          rankedDiagnoses: [{
            diagnosisName: "Mock Condition",
            confidencePercentage: 90,
            urgency: "Routine",
            rationale: "Mock rationale",
            supportingEvidence: "Mock Evidence",
            contradictoryEvidence: "",
            suggestedNextSteps: "Mock Steps",
          }],
          crossSpecialtyObservations: "",
          recommendedImmediateActions: "",
        }
      };
    });

    const mockMastra = {
      getAgent: () => ({
        generate: mockCmoGenerate,
      }),
    };

    const result = await runDiagnosis.execute({
      context: {} as any,
      stepId: "run-diagnosis",
      workflowId: "test-wf",
      inputData: {
        patientSummary: "Mock Patient",
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "mock-run-id",
    });

    expect(callCount).toBe(5);
    expect(result.diagnosisReport.rankedDiagnoses[0].diagnosisName).toBe("Mock Condition");
  });

  test("throws an error if CMO completely fails to parse even for the final report", async () => {
    let callCount = 0;
    const mockCmoGenerate = mock(async () => {
      callCount++;
      return { object: undefined };
    });

    const mockMastra = {
      getAgent: () => ({
        generate: mockCmoGenerate,
      }),
    };

    const runDiagnosisPromise = runDiagnosis.execute({
      context: {} as any,
      stepId: "run-diagnosis",
      workflowId: "test-wf",
      inputData: {
        patientSummary: "Mock Patient",
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "mock-run-id",
    });

    await expect(runDiagnosisPromise).rejects.toThrow("Diagnosis generation returned an empty response");
    expect(callCount).toBe(5);
  });

  test("passes abort signal to CMO generate and withRetry", async () => {
    let generateCallCount = 0;
    const mockCmoGenerate = mock(async (_prompt: string, options?: { abortSignal?: AbortSignal }) => {
      generateCallCount++;
      // Verify abort signal is provided
      expect(options?.abortSignal).toBeDefined();
      return {
        object: {
          specialistsToConsult: [],
          isFinal: true,
          finalReport: {
            chiefComplaint: "",
            patientSummary: "",
            specialistsConsulted: [],
            rankedDiagnoses: [
              {
                diagnosisName: "Test",
                confidencePercentage: 50,
                urgency: "Routine",
                rationale: "",
                supportingEvidence: "",
                contradictoryEvidence: "",
                suggestedNextSteps: "",
              },
            ],
            crossSpecialtyObservations: "",
            recommendedImmediateActions: "",
          },
        },
      };
    });

    const mockMastra = {
      getAgent: () => ({
        generate: mockCmoGenerate,
      }),
    };

    await runDiagnosis.execute({
      context: {} as any,
      stepId: "run-diagnosis",
      workflowId: "test-wf",
      inputData: {
        patientSummary: "Mock Patient",
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "abort-signal-id",
    });

    expect(generateCallCount).toBeGreaterThanOrEqual(1);
  });

  test("handles specialist call failure gracefully", async () => {
    let cmoCallCount = 0;
    const mockCmoGenerate = mock(async () => {
      cmoCallCount++;
      if (cmoCallCount === 1) {
        return {
          object: {
            specialistsToConsult: [{ id: "cardiologist" }],
            isFinal: false,
          },
        };
      }
      return {
        object: {
          specialistsToConsult: [],
          isFinal: true,
          finalReport: {
            chiefComplaint: "Headache",
            patientSummary: "Test",
            specialistsConsulted: [
              { specialist: "cardiologist", keyFindings: "Error occurred" },
            ],
            rankedDiagnoses: [
              {
                diagnosisName: "Test",
                confidencePercentage: 50,
                urgency: "Routine",
                rationale: "Test",
                supportingEvidence: "",
                contradictoryEvidence: "",
                suggestedNextSteps: "",
              },
            ],
            crossSpecialtyObservations: "",
            recommendedImmediateActions: "",
          },
        },
      };
    });

    const mockMastra = {
      getAgent: (id: string) => {
        if (id === "chiefMedicalOfficer") {
          return { generate: mockCmoGenerate };
        }
        if (id === "cardiologist") {
          return {
            generate: mock(async () => {
              throw new Error("Specialist unavailable");
            }),
          };
        }
        return undefined;
      },
    };

    const result = await runDiagnosis.execute({
      context: {} as any,
      stepId: "run-diagnosis",
      workflowId: "test-wf",
      inputData: {
        patientSummary: "Mock Patient",
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "specialist-fail-id",
    });

    expect(result.diagnosisReport.specialistsConsulted).toHaveLength(1);
  });

  test("falls back to max-rounds final report when CMO never returns isFinal", async () => {
    let round = 0;
    const mockCmoGenerate = mock(async () => {
      round++;
      return {
        object: {
          specialistsToConsult: [{ id: "generalist" }],
          isFinal: false,
        },
      };
    });

    const mockSpecGenerate = mock(async () => ({
      text: "Generalist findings",
    }));

    const mockMastra = {
      getAgent: (id: string) => {
        if (id === "chiefMedicalOfficer") {
          return { generate: mockCmoGenerate };
        }
        return { generate: mockSpecGenerate };
      },
    };

    const result = await runDiagnosis.execute({
      context: {} as any,
      stepId: "run-diagnosis",
      workflowId: "test-wf",
      inputData: {
        patientSummary: "Mock Patient",
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "max-rounds-id",
    });

    expect(result.diagnosisReport).toBeDefined();
    expect(round).toBeGreaterThanOrEqual(1);
  });

  test("compiles final report when CMO returns empty specialists with isFinal false", async () => {
    let callCount = 0;
    const mockCmoGenerate = mock(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          object: {
            specialistsToConsult: [],
            isFinal: false,
          },
        };
      }
      return {
        object: {
          chiefComplaint: "Headache",
          patientSummary: "Test",
          specialistsConsulted: [],
          rankedDiagnoses: [
            {
              diagnosisName: "Test",
              confidencePercentage: 50,
              urgency: "Routine",
              rationale: "Test",
              supportingEvidence: "",
              contradictoryEvidence: "",
              suggestedNextSteps: "",
            },
          ],
          crossSpecialtyObservations: "",
          recommendedImmediateActions: "",
        },
      };
    });

    const mockMastra = {
      getAgent: () => ({
        generate: mockCmoGenerate,
      }),
    };

    const result = await runDiagnosis.execute({
      context: {} as any,
      stepId: "run-diagnosis",
      workflowId: "test-wf",
      inputData: {
        patientSummary: "Mock Patient",
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "empty-specialists-id",
    });

    expect(result.diagnosisReport).toBeDefined();
    expect(callCount).toBe(2);
  });
});

describe("formatReport — malformed input handling", () => {
  test("handles missing optional fields with defaults", async () => {
    const sparseReport = {
      chiefComplaint: undefined,
      patientSummary: undefined,
      specialistsConsulted: undefined,
      rankedDiagnoses: [
        {
          diagnosisName: undefined,
          confidencePercentage: undefined,
          urgency: undefined,
          rationale: undefined,
          supportingEvidence: undefined,
          contradictoryEvidence: undefined,
          suggestedNextSteps: undefined,
        },
      ],
      crossSpecialtyObservations: undefined,
      recommendedImmediateActions: undefined,
    };

    const result = await formatReport.execute({
      inputData: { diagnosisReport: sparseReport as any },
    } as Parameters<typeof formatReport.execute>[0]);

    expect(result.report.chiefComplaint).toBe("");
    expect(result.report.patientSummary).toBe("");
    expect(result.report.diagnoses[0].name).toBe("");
    expect(result.report.diagnoses[0].confidence).toBe(0);
    expect(result.report.diagnoses[0].urgency).toBe("routine");
    expect(result.report.diagnoses[0].rationale).toBe("");
    expect(result.report.diagnoses[0].supportingEvidence).toEqual([]);
    expect(result.report.diagnoses[0].contradictoryEvidence).toEqual([]);
    expect(result.report.diagnoses[0].nextSteps).toEqual([]);
    expect(result.report.crossSpecialtyObservations).toBe("");
    expect(result.report.recommendedImmediateActions).toBe("");
  });

  test("handles invalid urgency values by defaulting to routine", async () => {
    const report = {
      chiefComplaint: "",
      patientSummary: "",
      specialistsConsulted: [],
      rankedDiagnoses: [
        {
          diagnosisName: "Test",
          confidencePercentage: 50,
          urgency: "High",
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
      inputData: { diagnosisReport: report as any },
    } as Parameters<typeof formatReport.execute>[0]);

    expect(result.report.diagnoses[0].urgency).toBe("routine");
  });

  test("handles empty arrays for evidence and next steps", async () => {
    const report = {
      chiefComplaint: "",
      patientSummary: "",
      specialistsConsulted: [],
      rankedDiagnoses: [
        {
          diagnosisName: "Test",
          confidencePercentage: 0,
          urgency: "Routine",
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
      inputData: { diagnosisReport: report },
    } as Parameters<typeof formatReport.execute>[0]);

    expect(result.report.diagnoses[0].supportingEvidence).toEqual([]);
    expect(result.report.diagnoses[0].contradictoryEvidence).toEqual([]);
    expect(result.report.diagnoses[0].nextSteps).toEqual([]);
  });

  test("rejects confidence above 100 in schema validation", () => {
    const invalid = {
      chiefComplaint: "Test",
      patientSummary: "Test",
      specialistsConsulted: [],
      rankedDiagnoses: [
        {
          diagnosisName: "Test",
          confidencePercentage: 150,
          urgency: "Routine",
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

  test("rejects confidence below 0 in schema validation", () => {
    const invalid = {
      chiefComplaint: "Test",
      patientSummary: "Test",
      specialistsConsulted: [],
      rankedDiagnoses: [
        {
          diagnosisName: "Test",
          confidencePercentage: -5,
          urgency: "Routine",
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
});

