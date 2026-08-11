import { test, expect, describe, mock, beforeAll, afterAll } from "bun:test";
import {
  splitToList,
  buildPatientSummary,
  truncateField,
  formatReport,
  diagnosisReportSchema,
  limitConcurrency,
  withRetry,
  normalizeSpecialistName,
  buildSpecialistContext,
  buildCmoContext,
  runDiagnosis,
  generateFinalReport,
  formatToolArgs,
  mockDiagnosis,
} from "../src/backend/workflows/diagnostic-workflow";
import { reportOutcomeSchema } from "../src/shared/report-outcome";
import { summarizeToolResult } from "../src/backend/workflows/tool-result-summary";
import { createToolEventHooks } from "../src/backend/workflows/tool-event-hooks";
import type { ProgressEvent } from "../src/backend/progress-store";
import * as abortStore from "../src/backend/utils/abort-controller-store";
import {
  APITimeoutError,
  SchemaValidationError,
} from "../src/backend/utils/errors";
import { mastra } from "../src/backend";
import { specialistIds, specialists } from "../src/backend/agents";

function createStepEventHandler(
  agentId: Parameters<typeof createToolEventHooks>[0],
  jobId: string,
  emit: Parameters<typeof createToolEventHooks>[2],
) {
  const hooks = createToolEventHooks(agentId, jobId, emit);
  return (step: any) => {
    const toolCalls = step.toolCalls ?? [];
    const callIds = toolCalls.map(
      (call: any, index: number) =>
        call.payload.toolCallId ?? `test-tool-call-${index}`,
    );
    for (const [index, call] of toolCalls.entries()) {
      hooks.beforeToolCall?.({
        toolName: call.payload.toolName,
        input: call.payload.args,
        context: { toolCallId: callIds[index] },
      });
    }
    for (const [index, result] of (step.toolResults ?? []).entries()) {
      const thrownError =
        result.payload.isError === true &&
        result.payload.result instanceof Error
          ? result.payload.result
          : undefined;
      hooks.afterToolCall?.({
        toolName: result.payload.toolName,
        input: result.payload.args,
        output: thrownError ? undefined : result.payload.result,
        error: thrownError,
        context: {
          toolCallId:
            result.payload.toolCallId ??
            callIds[index] ??
            `test-tool-result-${index}`,
        },
      });
    }
  };
}

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

  test("does not split on semicolons", () => {
    expect(splitToList("Troponin elevated; ECG shows ST changes")).toEqual([
      "Troponin elevated; ECG shows ST changes",
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

  test("handles mixed separators with newlines", () => {
    expect(splitToList("alpha; beta\ngamma")).toEqual(["alpha; beta", "gamma"]);
  });

  test("single item string", () => {
    expect(splitToList("just one")).toEqual(["just one"]);
  });

  test("all empty/whitespace input", () => {
    expect(splitToList("   \n  \n  ")).toEqual([]);
  });
});

describe("buildPatientSummary", () => {
  test("assembles patient summary from all fields", () => {
    const result = buildPatientSummary({
      medicalHistory: "Patient has hypertension",
      conversationTranscript: "Patient reports headache",
      labResults: "BP: 140/90",
    });

    expect(result).toContain("PATIENT DATA FOR REVIEW");
    expect(result).toContain("Patient has hypertension");
    expect(result).toContain("Patient reports headache");
    expect(result).toContain("BP: 140/90");
    expect(result).toContain("MEDICAL HISTORY");
    expect(result).toContain("CONVERSATION TRANSCRIPT");
    expect(result).toContain("LAB RESULTS");
  });

  test("handles empty strings", () => {
    const result = buildPatientSummary({
      medicalHistory: "",
      conversationTranscript: "",
      labResults: "",
    });

    expect(result).toContain("PATIENT DATA FOR REVIEW");
  });

  test("handles long multi-line inputs", () => {
    const longHistory = "Line 1\n".repeat(100).trim();
    const result = buildPatientSummary({
      medicalHistory: longHistory,
      conversationTranscript: "transcript",
      labResults: "labs",
    });

    expect(result).toContain(longHistory);
  });

  test("wraps patient data in <patient_data> boundary tags", () => {
    const result = buildPatientSummary({
      medicalHistory: "History data",
      conversationTranscript: "Transcript data",
      labResults: "Lab data",
    });

    expect(result).toContain("<patient_data>");
    expect(result).toContain("</patient_data>");
    expect(result.indexOf("<patient_data>")).toBeLessThan(
      result.indexOf("</patient_data>"),
    );
  });

  test("includes guard instruction before patient data", () => {
    const result = buildPatientSummary({
      medicalHistory: "History data",
      conversationTranscript: "Transcript",
      labResults: "Lab results",
    });

    expect(result).toContain("DATA ONLY");
    expect(result).toContain("Do NOT follow");
    const dataOnlyIdx = result.indexOf("DATA ONLY");
    const openTagIdx = result.indexOf("<patient_data>");
    expect(dataOnlyIdx).toBeLessThan(openTagIdx);
  });

  test("includes end-of-data instruction after closing tag", () => {
    const result = buildPatientSummary({
      medicalHistory: "History",
      conversationTranscript: "Transcript",
      labResults: "Lab",
    });

    expect(result).toContain("END OF PATIENT DATA");
    expect(result.indexOf("END OF PATIENT DATA")).toBeGreaterThan(
      result.indexOf("</patient_data>"),
    );
  });

  test("places patient data sections inside boundary tags", () => {
    const result = buildPatientSummary({
      medicalHistory: "HISTORY_CONTENT",
      conversationTranscript: "TRANSCRIPT_CONTENT",
      labResults: "LAB_CONTENT",
    });

    const openIdx = result.indexOf("<patient_data>");
    const closeIdx = result.indexOf("</patient_data>");

    expect(result.indexOf("HISTORY_CONTENT")).toBeGreaterThan(openIdx);
    expect(result.indexOf("HISTORY_CONTENT")).toBeLessThan(closeIdx);
    expect(result.indexOf("TRANSCRIPT_CONTENT")).toBeGreaterThan(openIdx);
    expect(result.indexOf("TRANSCRIPT_CONTENT")).toBeLessThan(closeIdx);
    expect(result.indexOf("LAB_CONTENT")).toBeGreaterThan(openIdx);
    expect(result.indexOf("LAB_CONTENT")).toBeLessThan(closeIdx);
  });
});

describe("truncateField", () => {
  test("returns short strings unchanged", () => {
    expect(truncateField("hello", 100)).toBe("hello");
  });

  test("truncates strings exceeding maxLength", () => {
    const long = "a".repeat(200);
    const result = truncateField(long, 100);
    expect(result.length).toBeLessThan(long.length);
    expect(result).toContain("[Content truncated due to length limit]");
    expect(result.length).toBe(
      100 + "[Content truncated due to length limit]".length,
    );
  });

  test("returns exact-length strings unchanged", () => {
    const exact = "a".repeat(100);
    expect(truncateField(exact, 100)).toBe(exact);
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
  const sampleOutcome = {
    status: "available" as const,
    diagnosisReport: sampleReport,
  };

  test("formats ranked diagnoses with correct rank numbers", async () => {
    const result: any = await formatReport.execute({
      inputData: sampleOutcome,
    } as unknown as Parameters<typeof formatReport.execute>[0]);

    expect(result.report.diagnoses).toHaveLength(2);
    expect(result.report.diagnoses[0].rank).toBe(1);
    expect(result.report.diagnoses[1].rank).toBe(2);
  });

  test("maps diagnosis fields correctly", async () => {
    const result: any = await formatReport.execute({
      inputData: sampleOutcome,
    } as unknown as Parameters<typeof formatReport.execute>[0]);

    const first = result.report.diagnoses[0];
    expect(first.name).toBe("Hypertensive Urgency");
    expect(first.confidence).toBe(85);
    expect(first.urgency).toBe("emergent");
    expect(first.rationale).toBe("Severe headache with high BP");
  });

  test("splits evidence into arrays", async () => {
    const result: any = await formatReport.execute({
      inputData: sampleOutcome,
    } as unknown as Parameters<typeof formatReport.execute>[0]);

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

  test("preserves semicolons in evidence text", async () => {
    const result: any = await formatReport.execute({
      inputData: sampleOutcome,
    } as unknown as Parameters<typeof formatReport.execute>[0]);

    // Second diagnosis has semicolons in supportingEvidence — should NOT split
    const second = result.report.diagnoses[1];
    expect(second.supportingEvidence).toEqual([
      "Severe headache; Visual disturbances",
    ]);
  });

  test("normalizes urgency to lowercase", async () => {
    const result: any = await formatReport.execute({
      inputData: sampleOutcome,
    } as unknown as Parameters<typeof formatReport.execute>[0]);

    expect(result.report.diagnoses[0].urgency).toBe("emergent");
    expect(result.report.diagnoses[1].urgency).toBe("urgent");
  });

  test("includes disclaimer and timestamp", async () => {
    const result: any = await formatReport.execute({
      inputData: sampleOutcome,
    } as unknown as Parameters<typeof formatReport.execute>[0]);

    expect(result.disclaimer).toContain("RESEARCH USE ONLY");
    expect(result.disclaimer).toContain("HIPAA-compliant");
    expect(result.generatedAt).toBeTruthy();
    // ISO timestamp should parse without error
    expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
  });

  test("preserves specialists and metadata", async () => {
    const result: any = await formatReport.execute({
      inputData: sampleOutcome,
    } as unknown as Parameters<typeof formatReport.execute>[0]);

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

    const result: any = await formatReport.execute({
      inputData: { status: "available", diagnosisReport: emptyReport },
    } as unknown as Parameters<typeof formatReport.execute>[0]);

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

    const result: any = await formatReport.execute({
      inputData: { status: "available", diagnosisReport: sparseReport },
    } as unknown as Parameters<typeof formatReport.execute>[0]);

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

  test("awaits all in-flight tasks when one fails (no orphaned promises)", async () => {
    const completed: number[] = [];
    const items = [1, 2, 3];

    // All three start concurrently (limit 3). Item 2 fails fast (30ms); items
    // 1 and 3 finish later (60ms). The function must wait for the survivors to
    // settle (via Promise.allSettled) before re-throwing, so that no in-flight
    // task is orphaned.
    const promise = limitConcurrency(items, 3, async (n) => {
      await new Promise((r) => setTimeout(r, n === 2 ? 30 : 60));
      if (n === 2) throw new Error("item 2 failed");
      completed.push(n);
      return n * 10;
    });

    await expect(promise).rejects.toThrow("item 2 failed");
    // Survivors completed before the rejection surfaced.
    expect(completed.sort()).toEqual([1, 3]);
  });

  test("stops scheduling remaining items after first error", async () => {
    const invoked: number[] = [];
    const items = [1, 2, 3, 4, 5];

    await limitConcurrency(items, 1, async (n) => {
      invoked.push(n);
      await new Promise((r) => setTimeout(r, 10));
      if (n === 2) throw new Error("item 2 failed");
      return n * 10;
    }).catch(() => "caught");

    // With concurrency 1, item 2 fails before item 3 is scheduled; the loop
    // breaks and never invokes items 3–5.
    expect(invoked).toEqual([1, 2]);
  });

  test("throws first error and awaits survivors when multiple tasks fail", async () => {
    const completed: number[] = [];
    const items = [1, 2, 3];

    // All three run concurrently (limit 3). Items 1 and 2 both reject; item 3
    // succeeds. Every rejection must be internalized by its own .catch (no
    // unhandled rejection), and the surviving task must be awaited before the
    // function re-throws the first error.
    const promise = limitConcurrency(items, 3, async (n) => {
      await new Promise((r) => setTimeout(r, 30));
      if (n !== 3) throw new Error(`item ${n} failed`);
      completed.push(n);
      return n * 10;
    });

    await expect(promise).rejects.toThrow(/item [12] failed/);
    expect(completed).toEqual([3]);
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

describe("CMO specialist identity", () => {
  test("every allowed specialist ID resolves to its intended runtime agent", () => {
    for (const id of specialistIds) {
      const agent = mastra.getAgent(id);
      expect(agent).toBe(specialists[id]);
      expect(agent.id).toBe(id);
    }
  });

  test("CMO instructions list every canonical specialist ID", async () => {
    const instructions = String(
      await mastra.getAgent("chiefMedicalOfficer").getInstructions(),
    );

    for (const id of specialistIds) {
      expect(instructions).toContain(`**${id}**`);
    }
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
      contextDirective:
        "Cardiologist found elevated BP — check for renal cause",
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
    const history = ["=== PATIENT CASE ===", "Patient data", "Round 1 results"];
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
    const fn = () => {
      throw new Error("fail");
    };
    setTimeout(() => controller.abort(), 50);
    await expect(withRetry(fn, 10, 500, controller.signal)).rejects.toThrow();
  });

  test("succeeds on first try without abort", async () => {
    const result = await withRetry(() => Promise.resolve("success"), 3, 100);
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
          rankedDiagnoses: [
            {
              diagnosisName: "Mock Condition",
              confidencePercentage: 90,
              urgency: "Routine",
              rationale: "Mock rationale",
              supportingEvidence: "Mock Evidence",
              contradictoryEvidence: "",
              suggestedNextSteps: "Mock Steps",
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

    const result: any = await runDiagnosis.execute({
      inputData: {
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "mock-run-id",
    } as any);

    expect(callCount).toBe(5);
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.diagnosisReport.rankedDiagnoses[0].diagnosisName).toBe(
        "Mock Condition",
      );
    }
  });

  test("returns generation_failed if CMO returns empty responses", async () => {
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

    const result: any = await runDiagnosis.execute({
      inputData: {
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "mock-run-id",
    } as any);

    expect(result).toMatchObject({
      status: "generation_failed",
      errorCode: "REPORT_EMPTY_RESPONSE",
      retryable: true,
    });
    expect(reportOutcomeSchema.safeParse(result).success).toBe(true);
    expect(result).not.toHaveProperty("diagnosisReport");
    expect(callCount).toBeGreaterThanOrEqual(6);
  });

  test("retries with correction prompt when final report schema validation fails", async () => {
    let callCount = 0;
    const validReport = {
      chiefComplaint: "Headache",
      patientSummary: "Test",
      specialistsConsulted: [],
      rankedDiagnoses: [
        {
          diagnosisName: "Migraine",
          confidencePercentage: 80,
          urgency: "Urgent",
          rationale: "Test",
          supportingEvidence: "Test",
          contradictoryEvidence: "None",
          suggestedNextSteps: "Rest",
        },
      ],
      crossSpecialtyObservations: "None",
      recommendedImmediateActions: "Rest",
    };
    const mockCmoGenerate = mock(async (prompt: string) => {
      callCount++;
      if (callCount === 1) {
        return {
          object: {
            specialistsToConsult: [],
            isFinal: false,
          },
        };
      }
      if (callCount === 2) {
        return { object: { ...validReport, rankedDiagnoses: "not-an-array" } };
      }
      return { object: validReport };
    });

    const mockMastra = {
      getAgent: () => ({
        generate: mockCmoGenerate,
      }),
    };

    const result: any = await runDiagnosis.execute({
      inputData: {
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "retry-test-id",
    } as any);

    expect(callCount).toBe(3);
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.diagnosisReport.chiefComplaint).toBe("Headache");
      expect(result.diagnosisReport.rankedDiagnoses).toHaveLength(1);
    }
  });

  test("returns generation_failed when correction also fails schema validation", async () => {
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
      if (callCount === 2) {
        return { object: { chiefComplaint: "Bad", extra: true } };
      }
      return { object: { chiefComplaint: "Fallback", stillBad: true } };
    });

    const mockMastra = {
      getAgent: () => ({
        generate: mockCmoGenerate,
      }),
    };

    const result: any = await runDiagnosis.execute({
      inputData: {
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "retry-fail-test-id",
    } as any);

    expect(callCount).toBe(3);
    expect(result).toMatchObject({
      status: "generation_failed",
      errorCode: "REPORT_VALIDATION_FAILED",
      retryable: false,
    });
    expect(result).not.toHaveProperty("diagnosisReport");
  });

  test("passes abort signal to CMO generate and withRetry", async () => {
    let generateCallCount = 0;
    const mockCmoGenerate = mock(
      async (_prompt: string, options?: { abortSignal?: AbortSignal }) => {
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
      },
    );

    const mockMastra = {
      getAgent: () => ({
        generate: mockCmoGenerate,
      }),
    };

    await runDiagnosis.execute({
      inputData: {
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "abort-signal-id",
    } as any);

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

    const result: any = await runDiagnosis.execute({
      inputData: {
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "specialist-fail-id",
    } as any);

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.diagnosisReport.specialistsConsulted).toHaveLength(1);
    }
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

    const result: any = await runDiagnosis.execute({
      inputData: {
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "max-rounds-id",
    } as any);

    expect(["available", "generation_failed"]).toContain(result.status);
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

    const result: any = await runDiagnosis.execute({
      inputData: {
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId: "empty-specialists-id",
    } as any);

    expect(result.status).toBe("available");
    expect(callCount).toBe(2);
  });

  for (const scenario of [
    {
      name: "partial positive interaction coverage",
      specialistText:
        "Aspirin-warfarin interaction found. Coverage is partial: 2 of 3 drugs checked; mystery-drug was unresolved. FDA label text is not comprehensive clinical clearance.",
    },
    {
      name: "unknown unavailable interaction coverage",
      specialistText:
        "Interaction status is unknown and coverage is unavailable: 0 of 2 drugs checked. No reliable negative result is available from FDA label text.",
    },
  ]) {
    test(`preserves ${scenario.name} through CMO synthesis`, async () => {
      let cmoCallCount = 0;
      let synthesisPrompt = "";
      const mockCmoGenerate = mock(async (prompt: string) => {
        cmoCallCount++;
        if (cmoCallCount === 1) {
          return {
            object: {
              specialistsToConsult: [{ id: "cardiologist" }],
              isFinal: false,
            },
          };
        }
        synthesisPrompt = prompt;
        return {
          object: {
            specialistsToConsult: [],
            isFinal: true,
            finalReport: {
              chiefComplaint: "Medication safety review",
              patientSummary: "Patient taking multiple medications",
              specialistsConsulted: [
                {
                  specialist: "cardiologist",
                  keyFindings: scenario.specialistText,
                },
              ],
              rankedDiagnoses: [
                {
                  diagnosisName: "Medication interaction risk",
                  confidencePercentage: 60,
                  urgency: "Urgent",
                  rationale: "Interaction evidence requires clinical review.",
                  supportingEvidence: scenario.specialistText,
                  contradictoryEvidence: "Incomplete source coverage",
                  suggestedNextSteps:
                    "Verify with a clinical interaction source.",
                },
              ],
              crossSpecialtyObservations: scenario.specialistText,
              recommendedImmediateActions:
                "Do not change medication without professional review.",
            },
          },
        };
      });
      const mockSpecialistGenerate = mock(async () => ({
        text: scenario.specialistText,
      }));
      const mockMastra = {
        getAgent: (id: string) =>
          id === "chiefMedicalOfficer"
            ? { generate: mockCmoGenerate }
            : { generate: mockSpecialistGenerate },
      };

      const result: any = await runDiagnosis.execute({
        inputData: {
          medicalHistory: "Polypharmacy",
          conversationTranscript: "Medication safety question",
          labResults: "",
        },
        mastra: mockMastra as any,
        runId: `coverage-preservation-${cmoCallCount}-${scenario.name}`,
      } as any);

      expect(synthesisPrompt).toContain(scenario.specialistText);
      expect(result.status).toBe("available");
      if (result.status === "available") {
        expect(result.diagnosisReport.crossSpecialtyObservations).toContain(
          scenario.specialistText,
        );
        expect(
          result.diagnosisReport.rankedDiagnoses[0].supportingEvidence,
        ).toContain(scenario.specialistText);
      }
      expect(synthesisPrompt).not.toContain("noInteractionsFound");
    });
  }
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

    const result: any = await formatReport.execute({
      inputData: {
        status: "available",
        diagnosisReport: sparseReport as any,
      },
    } as unknown as Parameters<typeof formatReport.execute>[0]);

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

    const result: any = await formatReport.execute({
      inputData: { status: "available", diagnosisReport: report as any },
    } as unknown as Parameters<typeof formatReport.execute>[0]);

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

    const result: any = await formatReport.execute({
      inputData: { status: "available", diagnosisReport: report },
    } as unknown as Parameters<typeof formatReport.execute>[0]);

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

// ---------------------------------------------------------------------------
// formatToolArgs
// ---------------------------------------------------------------------------
describe("formatToolArgs", () => {
  test("extracts query from drug-interaction args", () => {
    const result = formatToolArgs("drug-interaction", {
      drugNames: ["sumatriptan", "sertraline"],
    });
    expect(result).toBe("sumatriptan + sertraline");
  });

  test("falls back to drugName for other tools", () => {
    const result = formatToolArgs("drug-labeling", {
      drugName: "metoprolol",
    });
    expect(result).toBe("metoprolol");
  });

  test("falls back to term field", () => {
    const result = formatToolArgs("medlineplus-search", {
      term: "hypertension",
    });
    expect(result).toBe("hypertension");
  });

  test("truncates long args to 80 characters", () => {
    const longQuery = "a".repeat(100);
    const result = formatToolArgs("drug-labeling", { drugName: longQuery });
    expect(result.length).toBe(81); // 80 chars + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  test("returns empty string for unknown arg shape", () => {
    const result = formatToolArgs("unknown-tool", { foo: "bar" });
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// mockDiagnosis
// ---------------------------------------------------------------------------
// ProgressEvent is already imported at the top of this file.

describe("mockDiagnosis", () => {
  test("returns a valid diagnosis report", async () => {
    const events: ProgressEvent[] = [];
    const emitProgress = (e: string | ProgressEvent) => {
      events.push(typeof e === "string" ? { time: "", message: e } : e);
    };

    const result = await mockDiagnosis("patient summary", emitProgress, {
      stepDelayMs: 0,
    });

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.diagnosisReport.chiefComplaint).toBeTruthy();
      expect(result.diagnosisReport.rankedDiagnoses).toHaveLength(3);
    }
  });

  test("emits round_start events", async () => {
    const events: ProgressEvent[] = [];
    const emitProgress = (e: string | ProgressEvent) => {
      events.push(typeof e === "string" ? { time: "", message: e } : e);
    };

    await mockDiagnosis("patient summary", emitProgress, { stepDelayMs: 0 });

    const roundStarts = events.filter((e) => e.eventType === "round_start");
    expect(roundStarts.length).toBeGreaterThanOrEqual(1);
  });

  test("emits specialist_start events with agentId", async () => {
    const events: ProgressEvent[] = [];
    const emitProgress = (e: string | ProgressEvent) => {
      events.push(typeof e === "string" ? { time: "", message: e } : e);
    };

    await mockDiagnosis("patient summary", emitProgress, { stepDelayMs: 0 });

    const starts = events.filter((e) => e.eventType === "specialist_start");
    expect(starts.length).toBe(3);
    const agentIds = starts.map((e) => e.agentId).sort();
    expect(agentIds).toEqual(["cardiologist", "nephrologist", "neurologist"]);
  });

  test("emits tool_call events with toolName and toolArgs", async () => {
    const events: ProgressEvent[] = [];
    const emitProgress = (e: string | ProgressEvent) => {
      events.push(typeof e === "string" ? { time: "", message: e } : e);
    };

    await mockDiagnosis("patient summary", emitProgress, { stepDelayMs: 0 });

    const toolCalls = events.filter((e) => e.eventType === "tool_call");
    expect(toolCalls.length).toBe(3);
    for (const tc of toolCalls) {
      expect(tc.toolName).toBe("drug-labeling");
      expect(tc.toolArgs).toBe("metoprolol tartrate");
      expect(typeof tc.agentId).toBe("string");
    }
  });

  test("emits specialist_complete events with agentId", async () => {
    const events: ProgressEvent[] = [];
    const emitProgress = (e: string | ProgressEvent) => {
      events.push(typeof e === "string" ? { time: "", message: e } : e);
    };

    await mockDiagnosis("patient summary", emitProgress, { stepDelayMs: 0 });

    const completes = events.filter(
      (e) => e.eventType === "specialist_complete",
    );
    expect(completes.length).toBe(3);
    for (const c of completes) {
      expect(typeof c.agentId).toBe("string");
    }
  });

  test("emits cmo_final event", async () => {
    const events: ProgressEvent[] = [];
    const emitProgress = (e: string | ProgressEvent) => {
      events.push(typeof e === "string" ? { time: "", message: e } : e);
    };

    await mockDiagnosis("patient summary", emitProgress, { stepDelayMs: 0 });

    const finals = events.filter((e) => e.eventType === "cmo_final");
    expect(finals.length).toBe(1);
  });

  test("emits events in expected order: start → tool_call → tool_result → complete for each specialist", async () => {
    const events: ProgressEvent[] = [];
    const emitProgress = (e: string | ProgressEvent) => {
      events.push(typeof e === "string" ? { time: "", message: e } : e);
    };

    await mockDiagnosis("patient summary", emitProgress, { stepDelayMs: 0 });

    const specialistEvents = events.filter(
      (e) =>
        e.eventType === "specialist_start" ||
        e.eventType === "tool_call" ||
        e.eventType === "tool_result" ||
        e.eventType === "specialist_complete",
    );

    // Verify the pattern: start → tool_call → tool_result → complete repeats 3 times
    for (let i = 0; i < 3; i++) {
      const base = i * 4;
      expect(specialistEvents[base].eventType).toBe("specialist_start");
      expect(specialistEvents[base + 1].eventType).toBe("tool_call");
      expect(specialistEvents[base + 2].eventType).toBe("tool_result");
      expect(specialistEvents[base + 3].eventType).toBe("specialist_complete");
      // All four events in a group share the same agentId
      expect(specialistEvents[base].agentId).toBe(
        specialistEvents[base + 1].agentId,
      );
      expect(specialistEvents[base + 1].agentId).toBe(
        specialistEvents[base + 2].agentId,
      );
      expect(specialistEvents[base + 2].agentId).toBe(
        specialistEvents[base + 3].agentId,
      );
    }
  });

  test("emits tool_result events with success, durationMs, and resultSummary", async () => {
    const events: ProgressEvent[] = [];
    const emitProgress = (e: string | ProgressEvent) => {
      events.push(typeof e === "string" ? { time: "", message: e } : e);
    };

    await mockDiagnosis("patient summary", emitProgress, { stepDelayMs: 0 });

    const toolResults = events.filter((e) => e.eventType === "tool_result");
    expect(toolResults.length).toBe(3);
    for (const tr of toolResults) {
      expect(tr.success).toBe(true);
      expect(typeof tr.durationMs).toBe("number");
      expect(tr.resultSummary).not.toBeNull();
      expect(typeof tr.agentId).toBe("string");
      expect(tr.toolName).toBe("drug-labeling");
    }
  });

  test("handles string emitProgress (backward compat)", async () => {
    // Tests that the emitProgress still accepts plain strings
    // The actual mockDiagnosis always passes ProgressEvent objects,
    // but the type signature supports both
    const events: ProgressEvent[] = [];
    const emitProgress = (e: string | ProgressEvent) => {
      events.push(typeof e === "string" ? { time: "", message: e } : e);
    };

    await mockDiagnosis("patient summary", emitProgress, { stepDelayMs: 0 });

    // All events should have eventType set (mock uses ProgressEvent objects)
    const withEventType = events.filter((e) => e.eventType !== undefined);
    expect(withEventType.length).toBeGreaterThan(0);
  });

  test("emit helper produces valid ISO timestamps on all events", async () => {
    const events: ProgressEvent[] = [];
    const emitProgress = (e: string | ProgressEvent) => {
      events.push(typeof e === "string" ? { time: "", message: e } : e);
    };

    await mockDiagnosis("patient summary", emitProgress, { stepDelayMs: 0 });

    for (const e of events) {
      expect(e.time).toBeTruthy();
      const parsed = new Date(e.time);
      expect(parsed.getTime()).not.toBeNaN();
    }
  });
});

describe("generateFinalReport", () => {
  const validReport = {
    chiefComplaint: "Headache",
    patientSummary: "Test patient",
    specialistsConsulted: [],
    rankedDiagnoses: [
      {
        diagnosisName: "Migraine",
        confidencePercentage: 80,
        urgency: "Urgent" as const,
        rationale: "Test",
        supportingEvidence: "Evidence",
        contradictoryEvidence: "None",
        suggestedNextSteps: "Rest",
      },
    ],
    crossSpecialtyObservations: "None",
    recommendedImmediateActions: "Rest",
  };

  test("returns validated report on first try when schema passes", async () => {
    const mockCmo = {
      generate: mock(async () => ({ object: validReport })),
    };
    const emitted: string[] = [];
    const emit = (_type: string, msg: string) => emitted.push(msg);
    const ac = new AbortController();

    const result = await generateFinalReport({
      cmo: mockCmo as any,
      prompt: "Generate final report",
      builtContextHistory: "context",
      abortSignal: ac.signal,
      emit: emit as any,
      logContext: { jobId: "test" },
      jobId: "test",
    });

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.diagnosisReport.chiefComplaint).toBe("Headache");
      expect(result.diagnosisReport.rankedDiagnoses).toHaveLength(1);
    }
    expect(mockCmo.generate).toHaveBeenCalledTimes(1);
    // No retry messages should be emitted
    expect(emitted.filter((m) => m.includes("validation failed"))).toHaveLength(
      0,
    );
  });

  test("retries with correction prompt when first response fails schema validation", async () => {
    let callCount = 0;
    const mockCmo = {
      generate: mock(async () => {
        callCount++;
        if (callCount === 1) {
          // Invalid: rankedDiagnoses is a string, not an array
          return { object: { chiefComplaint: "Bad", rankedDiagnoses: "nope" } };
        }
        return { object: validReport };
      }),
    };
    const emitted: string[] = [];
    const emit = (_type: string, msg: string) => emitted.push(msg);
    const ac = new AbortController();

    const result = await generateFinalReport({
      cmo: mockCmo as any,
      prompt: "Generate final report",
      builtContextHistory: "context",
      abortSignal: ac.signal,
      emit: emit as any,
      logContext: { jobId: "retry-test" },
      jobId: "retry-test",
    });

    expect(callCount).toBe(2);
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.diagnosisReport.chiefComplaint).toBe("Headache");
    }
    expect(emitted.some((m) => m.includes("first report attempt"))).toBe(true);
  });

  test("returns generation_failed when correction fails schema validation", async () => {
    const rawOutput = { chiefComplaint: "Raw fallback", broken: true };
    const mockCmo = {
      generate: mock(async () => ({ object: rawOutput })),
    };
    const emitted: string[] = [];
    const emit = (_type: string, msg: string) => emitted.push(msg);
    const ac = new AbortController();

    const result = await generateFinalReport({
      cmo: mockCmo as any,
      prompt: "Generate final report",
      builtContextHistory: "context",
      abortSignal: ac.signal,
      emit: emit as any,
      logContext: { jobId: "fallback-test" },
      jobId: "fallback-test",
    });

    expect(mockCmo.generate).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: "generation_failed",
      errorCode: "REPORT_VALIDATION_FAILED",
      retryable: false,
    });
    expect(reportOutcomeSchema.safeParse(result).success).toBe(true);
    expect(result).not.toHaveProperty("diagnosisReport");
    expect(emitted.some((m) => m.includes("could not be generated"))).toBe(
      true,
    );
  });

  test("propagates abort instead of returning generation_failed", async () => {
    const ac = new AbortController();
    const abortError = new Error("Cancelled during report generation");
    abortError.name = "AbortError";
    const mockCmo = {
      generate: mock(async () => {
        ac.abort(abortError);
        throw abortError;
      }),
    };
    const emit = mock(() => {});

    await expect(
      generateFinalReport({
        cmo: mockCmo as any,
        prompt: "Generate final report",
        builtContextHistory: "context",
        abortSignal: ac.signal,
        emit: emit as any,
        logContext: { jobId: "abort-test" },
        jobId: "abort-test",
      }),
    ).rejects.toThrow("Cancelled during report generation");
    expect(mockCmo.generate).toHaveBeenCalledTimes(1);
  });

  test("recovers when the initial structured-output call throws", async () => {
    let callCount = 0;
    const mockCmo = {
      generate: mock(async () => {
        callCount++;
        if (callCount === 1) {
          throw new SchemaValidationError(
            "Structured output schema validation failed",
          );
        }
        return { object: validReport };
      }),
    };
    const emitted: string[] = [];
    const emit = (_type: string, msg: string) => emitted.push(msg);
    const ac = new AbortController();

    const result = await generateFinalReport({
      cmo: mockCmo as any,
      prompt: "Generate final report",
      builtContextHistory: "context",
      abortSignal: ac.signal,
      emit: emit as any,
      logContext: { jobId: "terminal-fallback-test" },
      jobId: "terminal-fallback-test",
    });

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.diagnosisReport.chiefComplaint).toBe("Headache");
    }
    expect(callCount).toBe(2);
  });

  test("returns REPORT_EMPTY_RESPONSE when both responses are empty", async () => {
    const mockCmo = {
      generate: mock(async () => ({ text: undefined, object: undefined })),
    };
    const emitted: string[] = [];
    const emit = (_type: string, msg: string) => emitted.push(msg);
    const ac = new AbortController();

    const result = await generateFinalReport({
      cmo: mockCmo as any,
      prompt: "Generate final report",
      builtContextHistory: "context",
      abortSignal: ac.signal,
      emit: emit as any,
      logContext: { jobId: "message-test" },
      jobId: "message-test",
    });

    expect(result).toMatchObject({
      status: "generation_failed",
      errorCode: "REPORT_EMPTY_RESPONSE",
      retryable: true,
    });
    expect(result).not.toHaveProperty("diagnosisReport");
    expect(emitted.some((m) => m.includes("could not be generated"))).toBe(
      true,
    );
  });

  test("returns REPORT_PROVIDER_UNAVAILABLE when the provider is down", async () => {
    const mockCmo = {
      generate: mock(async () => {
        throw new Error("Provider service unavailable");
      }),
    };
    const ac = new AbortController();

    const result = await generateFinalReport({
      cmo: mockCmo as any,
      prompt: "Generate final report",
      builtContextHistory: "context",
      abortSignal: ac.signal,
      emit: mock(() => {}) as any,
      logContext: { jobId: "provider-outage-test" },
      jobId: "provider-outage-test",
    });

    expect(mockCmo.generate).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: "generation_failed",
      errorCode: "REPORT_PROVIDER_UNAVAILABLE",
      retryable: true,
    });
    expect(result).not.toHaveProperty("diagnosisReport");
  });
});

describe("runDiagnosis - abort store integration", () => {
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

  test("uses AbortController from abort-controller-store when available", async () => {
    const storeAc = new AbortController();
    const runId = "abort-store-test-" + crypto.randomUUID();
    abortStore.set(runId, storeAc);

    let capturedSignal: AbortSignal | undefined;
    const mockCmoGenerate = mock(
      async (_prompt: string, options?: { abortSignal?: AbortSignal }) => {
        capturedSignal = options?.abortSignal;
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
      },
    );

    const mockMastra = {
      getAgent: () => ({
        generate: mockCmoGenerate,
      }),
    };

    await runDiagnosis.execute({
      inputData: {
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId,
    } as any);

    // The abort signal passed to CMO should be the SAME object from the store
    expect(capturedSignal).toBe(storeAc.signal);

    // Cleanup
    abortStore.remove(runId);
  });

  test("falls back to local AbortController when store has no entry", async () => {
    let capturedSignal: AbortSignal | undefined;
    const mockCmoGenerate = mock(
      async (_prompt: string, options?: { abortSignal?: AbortSignal }) => {
        capturedSignal = options?.abortSignal;
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
      },
    );

    const mockMastra = {
      getAgent: () => ({
        generate: mockCmoGenerate,
      }),
    };

    const runId = "no-store-entry-" + crypto.randomUUID();

    await runDiagnosis.execute({
      inputData: {
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      },
      mastra: mockMastra as any,
      runId,
    } as any);

    // Should still get an abort signal (from a locally-created controller)
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);
  });

  test("aborting the store controller cancels the running workflow", async () => {
    const storeAc = new AbortController();
    const runId = "cancel-test-" + crypto.randomUUID();
    abortStore.set(runId, storeAc);

    let generateCallCount = 0;
    const mockCmoGenerate = mock(async () => {
      generateCallCount++;
      if (generateCallCount === 1) {
        // Simulate a long-running first CMO call. Abort during this call.
        storeAc.abort();
        throw new Error("Aborted");
      }
      return { object: {} };
    });

    const mockMastra = {
      getAgent: () => ({
        generate: mockCmoGenerate,
      }),
    };

    await expect(
      runDiagnosis.execute({
        inputData: {
          medicalHistory: "",
          conversationTranscript: "",
          labResults: "",
        },
        mastra: mockMastra as any,
        runId,
      } as any),
    ).rejects.toThrow();

    // Should have aborted after the first call
    expect(generateCallCount).toBe(1);

    // Cleanup
    abortStore.remove(runId);
  });
});

describe("summarizeToolResult", () => {
  test("returns null for undefined result", () => {
    expect(summarizeToolResult("drug-interaction", undefined)).toBeNull();
  });

  test("returns null for null result", () => {
    expect(summarizeToolResult("drug-interaction", null)).toBeNull();
  });

  test("returns null for empty array", () => {
    expect(summarizeToolResult("drug-interaction", [])).toBeNull();
  });

  test("returns count for non-empty array", () => {
    expect(summarizeToolResult("drug-interaction", [1, 2, 3])).toBe(
      "3 results",
    );
  });

  test("returns string truncated to 200 chars", () => {
    const long = "a".repeat(300);
    const result = summarizeToolResult("unknown-tool", new Error(long));
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(200);
    expect(result!.endsWith("...")).toBe(true);
  });

  test("does not expose arbitrary plain-text tool output", () => {
    expect(summarizeToolResult("unknown-tool", "short result")).toBe(
      "Tool completed with text output",
    );
  });

  test("extracts error message from Error objects", () => {
    const result = summarizeToolResult(
      "drug-interaction",
      new Error("timeout"),
    );
    expect(result).toBe("timeout");
  });

  test("extracts error message from isError objects", () => {
    const result = summarizeToolResult("drug-interaction", {
      isError: true,
      message: "API rate limited",
    });
    expect(result).toBe("API rate limited");
  });

  test("unwraps and summarizes drug-interaction findings with coverage", () => {
    const result = summarizeToolResult("drug-interaction", {
      ok: true,
      data: {
        interactionStatus: "found",
        coverage: "partial",
        checks: [
          { status: "checked" },
          { status: "checked" },
          { status: "failed" },
        ],
        interactions: [{}, {}, {}],
      },
    });
    expect(result).toBe(
      "3 FDA-label findings; 2 of 3 drugs checked. Partial coverage.",
    );
  });

  test("summarizes complete drug-interaction negative with limitation", () => {
    const result = summarizeToolResult("drug-interaction", {
      ok: true,
      data: {
        interactionStatus: "none_found",
        coverage: "complete",
        checks: [{ status: "checked" }, { status: "checked" }],
        interactions: [],
      },
    });
    expect(result).toBe(
      "No interactions found in checked FDA labels; 2 of 2 drugs checked. Not comprehensive clearance.",
    );
  });

  test("summarizes partial unknown without making a negative claim", () => {
    const result = summarizeToolResult("drug-interaction", {
      ok: true,
      data: {
        interactionStatus: "unknown",
        coverage: "partial",
        checks: [{ status: "checked" }, { status: "unresolved" }],
        interactions: [],
      },
    });
    expect(result).toBe(
      "Interaction status unknown; 1 of 2 drugs checked. No reliable negative result.",
    );
  });

  test("summarizes unavailable interaction coverage", () => {
    const result = summarizeToolResult("drug-interaction", {
      ok: true,
      data: {
        interactionStatus: "unknown",
        coverage: "unavailable",
        checks: [{ status: "failed" }, { status: "failed" }],
        interactions: [],
      },
    });
    expect(result).toContain("Interaction status unknown");
    expect(result).toContain("0 of 2 drugs checked");
    expect(result).toContain("No reliable negative result");
  });

  test("summarizes semantic tool failures and retriable classification", () => {
    expect(
      summarizeToolResult("drug-interaction", {
        ok: false,
        error: "OpenFDA unavailable",
        retriable: true,
      }),
    ).toBe("OpenFDA unavailable (retry may succeed)");
  });

  test("surfaces noResults message for empty-result success envelopes", () => {
    const result = summarizeToolResult("medlineplus-search", {
      ok: true,
      data: {
        results: [],
        noResults: true,
        message: "No MedlinePlus information found for this condition.",
      },
    });
    expect(result).toBe("No MedlinePlus information found for this condition.");
  });

  test("falls back to generic summary when noResults has no message", () => {
    const result = summarizeToolResult("adverse-events", {
      ok: true,
      data: { results: [], noResults: true },
    });
    expect(result).toBe("No results found");
  });

  test("unwraps another medical tool result", () => {
    const result = summarizeToolResult("drug-labeling", {
      ok: true,
      data: { results: [{ brandName: "Lipitor" }] },
    });
    expect(result).toBe("1 FDA label record returned");
  });

  test("summarizes adverse-events with count", () => {
    const result = summarizeToolResult("adverse-events", {
      results: [{}, {}],
      meta: { totalResults: 10 },
    });
    expect(result).toBe(
      "2 of 10 FDA adverse-event reports returned; reports do not establish causality",
    );
  });

  test("summarizes clinical-trials-search with totalCount", () => {
    const result = summarizeToolResult("clinical-trials-search", {
      results: [{}, {}],
      totalCount: 5,
    });
    expect(result).toBe("2 of 5 clinical trials returned");
  });

  test("summarizes medlineplus-search with results", () => {
    const result = summarizeToolResult("medlineplus-search", {
      results: [{}, {}],
    });
    expect(result).toBe("2 MedlinePlus topics returned");
  });

  test("does not expose JSON for unknown tool structures", () => {
    const result = summarizeToolResult("unknown-tool", { foo: "bar" });
    expect(result).toBe("Tool completed with structured output");
  });

  test("summarizes rare-disease-search with results array", () => {
    const result = summarizeToolResult("rare-disease-search", {
      results: [{}, {}, {}],
    });
    expect(result).toBe("3 rare diseases returned");
  });

  test("summarizes drug-shortages with canonical results", () => {
    const result = summarizeToolResult("drug-shortages", {
      results: [{}, {}],
    });
    expect(result).toBe("2 FDA shortage records returned");
  });

  test("summarizes the canonical output shape for every registered tool", () => {
    const cases: Array<[string, unknown, string]> = [
      [
        "drug-lookup",
        { ok: true, data: { name: "Aspirin", rxcui: "1191" } },
        "RxNav drug match found",
      ],
      [
        "drug-interaction",
        {
          ok: true,
          data: {
            interactionStatus: "found",
            coverage: "complete",
            checks: [{ status: "checked" }, { status: "checked" }],
            interactions: [{}],
          },
        },
        "1 FDA-label finding; 2 of 2 drugs checked.",
      ],
      [
        "drug-labeling",
        { ok: true, data: { results: [{}] } },
        "1 FDA label record returned",
      ],
      [
        "adverse-events",
        {
          ok: true,
          data: { results: [{}, {}], meta: { totalResults: 20 } },
        },
        "2 of 20 FDA adverse-event reports returned; reports do not establish causality",
      ],
      [
        "drug-recall",
        { ok: true, data: { results: [{}, {}] } },
        "2 FDA recall records returned",
      ],
      [
        "substance-toxicology",
        { ok: true, data: { results: [{}, {}] } },
        "2 FDA substance records returned",
      ],
      [
        "drug-shortages",
        { ok: true, data: { results: [{}, {}] } },
        "2 FDA shortage records returned",
      ],
      [
        "food-adverse-events",
        { ok: true, data: { results: [{}] } },
        "1 FDA food adverse-event report returned; reports do not establish causality",
      ],
      [
        "device-adverse-events",
        { ok: true, data: { results: [{}] } },
        "1 FDA device adverse-event report returned; reports do not establish causality",
      ],
      [
        "clinical-trials-search",
        { ok: true, data: { results: [{}, {}], totalCount: 9 } },
        "2 of 9 clinical trials returned",
      ],
      [
        "medlineplus-search",
        { ok: true, data: { results: [{}, {}] } },
        "2 MedlinePlus topics returned",
      ],
      [
        "drug-spelling-suggestion",
        { ok: true, data: { suggestions: ["aspirin", "asparaginase"] } },
        "2 spelling suggestions",
      ],
      [
        "rare-disease-search",
        { ok: true, data: { results: [{}, {}] } },
        "2 rare diseases returned",
      ],
      [
        "rare-disease-genes",
        { ok: true, data: { results: [{}, {}] } },
        "2 associated genes returned",
      ],
      [
        "rare-disease-phenotypes",
        { ok: true, data: { results: [{}, {}] } },
        "2 associated phenotypes returned",
      ],
      [
        "hpo-term-search",
        { ok: true, data: { results: [{}, {}], totalAvailable: 8 } },
        "2 of 8 HPO terms returned",
      ],
      [
        "loinc-test-lookup",
        { ok: true, data: { results: [{}, {}], totalAvailable: 11 } },
        "2 of 11 LOINC lab tests returned",
      ],
    ];

    for (const [toolName, result, expected] of cases) {
      const summary = summarizeToolResult(toolName, result);
      expect(summary).toBe(expected);
      expect(summary).not.toContain('{"');
      expect(summary).not.toContain('"results"');
    }
  });

  test("summarizes JSON-serialized canonical results instead of exposing JSON", () => {
    const summary = summarizeToolResult(
      "drug-labeling",
      JSON.stringify({ ok: true, data: { results: [{ brandName: "X" }] } }),
    );
    expect(summary).toBe("1 FDA label record returned");
  });

  test("sanitizes URLs in tool failure summaries", () => {
    const summary = summarizeToolResult("adverse-events", {
      ok: false,
      error: "Request timed out at https://api.example.test?q=sensitive",
      retriable: true,
    });
    expect(summary).toContain("[url removed]");
    expect(summary).not.toContain("sensitive");
  });
});

describe("createToolEventHooks", () => {
  function createMockEmit() {
    const events: ProgressEvent[] = [];
    const emit = (
      eventType: string,
      message: string,
      extra?: Partial<ProgressEvent>,
    ) => {
      events.push({
        time: new Date().toISOString(),
        message,
        eventType: eventType as ProgressEvent["eventType"],
        ...extra,
      });
    };
    return { events, emit };
  }

  test("emits tool_call events for each tool call", () => {
    const { events, emit } = createMockEmit();
    const handler = createStepEventHandler("cardiologist", "job-1", emit);

    handler({
      toolCalls: [
        {
          payload: {
            toolName: "drug-interaction",
            args: { drugNames: ["aspirin", "clopidogrel"] },
          },
        },
      ],
      toolResults: [
        {
          payload: {
            toolName: "drug-interaction",
            result: { interactions: [{}, {}] },
            isError: false,
          },
        },
      ],
    });

    const toolCalls = events.filter((e) => e.eventType === "tool_call");
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].agentId).toBe("cardiologist");
    expect(toolCalls[0].toolName).toBe("drug-interaction");
    expect(toolCalls[0].toolArgs).toBe("aspirin + clopidogrel");
  });

  test("emits tool_result events with success status", () => {
    const { events, emit } = createMockEmit();
    const handler = createStepEventHandler("cardiologist", "job-1", emit);

    handler({
      toolCalls: [
        {
          payload: {
            toolName: "drug-interaction",
            args: { drugNames: ["aspirin", "warfarin"] },
          },
        },
      ],
      toolResults: [
        {
          payload: {
            toolName: "drug-interaction",
            result: { interactions: [{}] },
            isError: false,
          },
        },
      ],
    });

    const toolResults = events.filter((e) => e.eventType === "tool_result");
    expect(toolResults.length).toBe(1);
    expect(toolResults[0].success).toBe(true);
    expect(toolResults[0].toolResultStatus).toBe("success");
    expect(toolResults[0].toolName).toBe("drug-interaction");
    expect(typeof toolResults[0].durationMs).toBe("number");
    expect(toolResults[0].resultSummary).not.toBeNull();
  });

  test("emits tool_result events with error status for isError results", () => {
    const { events, emit } = createMockEmit();
    const handler = createStepEventHandler("neurologist", "job-2", emit);

    handler({
      toolCalls: [
        {
          payload: {
            toolName: "drug-interaction",
            args: { drugNames: ["aspirin", "warfarin"] },
          },
        },
      ],
      toolResults: [
        {
          payload: {
            toolName: "drug-interaction",
            result: { isError: true, message: "API timeout" },
            isError: true,
          },
        },
      ],
    });

    const toolResults = events.filter((e) => e.eventType === "tool_result");
    expect(toolResults.length).toBe(1);
    expect(toolResults[0].success).toBe(false);
    expect(toolResults[0].toolResultStatus).toBe("failed");
    expect(toolResults[0].errorType).toBe("UnknownError");
  });

  test("treats ok false envelopes as failed and preserves retriable", () => {
    const { events, emit } = createMockEmit();
    const handler = createStepEventHandler(
      "cardiologist",
      "job-semantic",
      emit,
    );

    handler({
      toolResults: [
        {
          payload: {
            toolName: "drug-interaction",
            result: { ok: false, error: "API unavailable", retriable: true },
            isError: false,
          },
        },
      ],
    });

    const event = events.find((item) => item.eventType === "tool_result")!;
    expect(event.success).toBe(false);
    expect(event.toolResultStatus).toBe("failed");
    expect(event.retriable).toBe(true);
    expect(event.message).toContain("failed");
  });

  test("treats noResults success envelopes as success, not failed", () => {
    const { events, emit } = createMockEmit();
    const handler = createStepEventHandler(
      "generalist",
      "job-no-results",
      emit,
    );

    handler({
      toolResults: [
        {
          payload: {
            toolName: "medlineplus-search",
            result: {
              ok: true,
              data: {
                results: [],
                noResults: true,
                message: "No MedlinePlus information found for this condition.",
              },
            },
            isError: false,
          },
        },
      ],
    });

    const event = events.find((item) => item.eventType === "tool_result")!;
    expect(event.success).toBe(true);
    expect(event.toolResultStatus).toBe("success");
    expect(event.message).toContain("completed");
    expect(event.resultSummary).toBe(
      "No MedlinePlus information found for this condition.",
    );
  });

  test("marks partial coverage without describing complete success", () => {
    const { events, emit } = createMockEmit();
    const handler = createStepEventHandler("cardiologist", "job-partial", emit);

    handler({
      toolResults: [
        {
          payload: {
            toolName: "drug-interaction",
            result: {
              ok: true,
              data: {
                interactionStatus: "found",
                coverage: "partial",
                checks: [{ status: "checked" }, { status: "failed" }],
                interactions: [{}],
              },
            },
            isError: false,
          },
        },
      ],
    });

    const event = events.find((item) => item.eventType === "tool_result")!;
    expect(event.success).toBe(false);
    expect(event.toolResultStatus).toBe("partial");
    expect(event.message).toContain("partial coverage");
  });

  test("marks unavailable source coverage as failed", () => {
    const { events, emit } = createMockEmit();
    const handler = createStepEventHandler(
      "cardiologist",
      "job-unavailable",
      emit,
    );

    handler({
      toolResults: [
        {
          payload: {
            toolName: "drug-interaction",
            result: {
              ok: true,
              data: {
                interactionStatus: "unknown",
                coverage: "unavailable",
                checks: [{ status: "failed" }, { status: "failed" }],
                interactions: [],
              },
            },
            isError: false,
          },
        },
      ],
    });

    const event = events.find((item) => item.eventType === "tool_result")!;
    expect(event.success).toBe(false);
    expect(event.toolResultStatus).toBe("failed");
    expect(event.resultSummary).toContain("No reliable negative result");
  });

  test("errorType is set for classified AppError errors", () => {
    const { events, emit } = createMockEmit();
    const handler = createStepEventHandler("neurologist", "job-3", emit);
    const timeoutError = new APITimeoutError("Drug API timeout after 10000ms");

    handler({
      toolCalls: [
        {
          payload: {
            toolName: "drug-interaction",
            args: { drugNames: ["aspirin", "clopidogrel"] },
          },
        },
      ],
      toolResults: [
        {
          payload: {
            toolName: "drug-interaction",
            result: timeoutError,
            isError: true,
          },
        },
      ],
    });

    const toolResults = events.filter((e) => e.eventType === "tool_result");
    expect(toolResults.length).toBe(1);
    expect(toolResults[0].success).toBe(false);
    expect(toolResults[0].errorType).toBe("APITimeoutError");
  });

  test("errorType is absent on successful tool_result events", () => {
    const { events, emit } = createMockEmit();
    const handler = createStepEventHandler("cardiologist", "job-4", emit);

    handler({
      toolCalls: [
        {
          payload: {
            toolName: "drug-interaction",
            args: { drugNames: ["aspirin", "ibuprofen"] },
          },
        },
      ],
      toolResults: [
        {
          payload: {
            toolName: "drug-interaction",
            result: {},
            isError: false,
          },
        },
      ],
    });

    const toolResults = events.filter((e) => e.eventType === "tool_result");
    expect(toolResults.length).toBe(1);
    expect(toolResults[0].success).toBe(true);
    expect(toolResults[0].errorType).toBeUndefined();
  });

  test("handles multiple tool calls and results in one step", () => {
    const { events, emit } = createMockEmit();
    const handler = createStepEventHandler("cardiologist", "job-1", emit);

    handler({
      toolCalls: [
        {
          payload: {
            toolName: "drug-interaction",
            args: { drugNames: ["aspirin", "warfarin"] },
          },
        },
        {
          payload: {
            toolName: "drug-labeling",
            args: { drugName: "metoprolol" },
          },
        },
      ],
      toolResults: [
        {
          payload: {
            toolName: "drug-interaction",
            result: { interactions: [{}] },
            isError: false,
          },
        },
        {
          payload: {
            toolName: "drug-labeling",
            result: { interactions: [{}] },
            isError: false,
          },
        },
      ],
    });

    expect(events.filter((e) => e.eventType === "tool_call").length).toBe(2);
    expect(events.filter((e) => e.eventType === "tool_result").length).toBe(2);
  });

  test("emits events in order: tool_calls then tool_results", () => {
    const { events, emit } = createMockEmit();
    const handler = createStepEventHandler("cardiologist", "job-1", emit);

    handler({
      toolCalls: [
        {
          payload: {
            toolName: "drug-interaction",
            args: { drugNames: ["aspirin", "warfarin"] },
          },
        },
      ],
      toolResults: [
        {
          payload: { toolName: "drug-interaction", result: {}, isError: false },
        },
      ],
    });

    const callIndex = events.findIndex((e) => e.eventType === "tool_call");
    const resultIndex = events.findIndex((e) => e.eventType === "tool_result");
    expect(callIndex).toBeLessThan(resultIndex);
  });

  test("preserves call IDs when identical tools complete out of order", () => {
    const { events, emit } = createMockEmit();
    const hooks = createToolEventHooks("cardiologist", "job-pairing", emit);

    hooks.beforeToolCall?.({
      toolName: "drug-labeling",
      input: { drugName: "first" },
      context: { toolCallId: "call-first" },
    });
    hooks.beforeToolCall?.({
      toolName: "drug-labeling",
      input: { drugName: "second" },
      context: { toolCallId: "call-second" },
    });
    hooks.afterToolCall?.({
      toolName: "drug-labeling",
      input: { drugName: "second" },
      output: { ok: true, data: { results: [{}] } },
      context: { toolCallId: "call-second" },
    });
    hooks.afterToolCall?.({
      toolName: "drug-labeling",
      input: { drugName: "first" },
      output: { ok: true, data: { results: [{}, {}] } },
      context: { toolCallId: "call-first" },
    });

    const results = events.filter((event) => event.eventType === "tool_result");
    expect(results.map((event) => event.toolCallId)).toEqual([
      "call-second",
      "call-first",
    ]);
    expect(results[0].toolArgs).toBe("second");
    expect(results[1].toolArgs).toBe("first");
    expect(results[0].resultSummary).toBe("1 FDA label record returned");
    expect(results[1].resultSummary).toBe("2 FDA label records returned");
    expect(results.every((event) => typeof event.durationMs === "number")).toBe(
      true,
    );
  });
});
