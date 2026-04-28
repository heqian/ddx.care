import { test, expect, describe } from "bun:test";

describe("Agent Registry", () => {
  test("all specialist agents are registered", async () => {
    const { specialists } = await import("../src/backend/agents/index");
    const keys = Object.keys(specialists);

    // Should have a reasonable number of specialists (guards against accidental removal)
    expect(keys.length).toBeGreaterThan(30);

    // Spot-check key specialties exist
    expect(keys).toContain("generalist");
    expect(keys).toContain("cardiologist");
    expect(keys).toContain("neurologist");
    expect(keys).toContain("emergencyPhysician");
    expect(keys).toContain("psychiatrist");
    expect(keys).toContain("obstetricianGynecologist");
    expect(keys).toContain("vascularSurgeon");
    expect(keys).toContain("intensivist");
    expect(keys).toContain("toxicologist");
    expect(keys).toContain("maternalFetalMedicine");
  });

  test("agent list provides metadata", async () => {
    const { agentList } = await import("../src/backend/agents/index");

    expect(agentList.length).toBeGreaterThan(0);

    for (const entry of agentList) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(typeof entry.description).toBe("string");
    }
  });

  test("no duplicate agent IDs", async () => {
    const { specialists } = await import("../src/backend/agents/index");
    const keys = Object.keys(specialists);
    const unique = new Set(keys);

    expect(unique.size).toBe(keys.length);
  });
});

describe("Tool Assignments", () => {
  test("every specialist has a tool assignment entry", async () => {
    const { specialists } = await import("../src/backend/agents/index");
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );

    const ids = Object.keys(specialists);
    for (const id of ids) {
      const tools = getToolsForSpecialist(id as keyof typeof specialists);
      expect(Object.keys(tools).length, `${id} has no tools`).toBeGreaterThan(
        0,
      );
    }
  });

  test("every specialist gets universal tools", async () => {
    const { specialists } = await import("../src/backend/agents/index");
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );

    const ids = Object.keys(specialists);
    for (const id of ids) {
      const tools = getToolsForSpecialist(id as keyof typeof specialists);
      expect(tools).toHaveProperty("pubmed-search");
      expect(tools).toHaveProperty("drug-lookup");
      expect(tools).toHaveProperty("drug-interaction");
    }
  });

  test("prescribers get prescribing tools", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );

    const prescribers = [
      "generalist",
      "cardiologist",
      "endocrinologist",
      "oncologist",
    ] as const;

    for (const id of prescribers) {
      const tools = getToolsForSpecialist(id);
      expect(tools).toHaveProperty("drug-labeling");
      expect(tools).toHaveProperty("adverse-events");
    }
  });

  test("non-prescribers do not get prescribing tools", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );

    const nonPrescribers = [
      "dermatologist",
      "radiologist",
      "pathologist",
    ] as const;

    for (const id of nonPrescribers) {
      const tools = getToolsForSpecialist(id);
      expect(tools).not.toHaveProperty("drug-labeling");
    }
  });

  test("oncologists get drug recall tool (not drug labeling)", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );
    const { drugRecallTool, drugLabelingTool } = await import(
      "../src/backend/tools/open-fda"
    );

    const tools = getToolsForSpecialist("oncologist");
    expect(tools).toHaveProperty("drug-recall");
    expect(tools["drug-recall"]).toBe(drugRecallTool);
    expect(tools["drug-recall"]).not.toBe(drugLabelingTool);
  });

  test("drug recall is not duplicated with drug labeling for oncologists", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );

    const tools = getToolsForSpecialist("oncologist");
    const toolValues = Object.values(tools);
    const toolIds = toolValues.map((t: any) => t?.id);
    const drugToolIds = toolIds.filter(
      (id: any) => id && (id as string).includes("drug"),
    );
    const uniqueDrugToolIds = new Set(drugToolIds);
    expect(uniqueDrugToolIds.size).toBe(drugToolIds.length);
  });
});

describe("Config", () => {
  test("model constants are strings", async () => {
    const { SPECIALIST_MODEL, ORCHESTRATOR_MODEL } = await import(
      "../src/backend/config"
    );

    expect(typeof SPECIALIST_MODEL).toBe("string");
    expect(SPECIALIST_MODEL.length).toBeGreaterThan(0);
    expect(typeof ORCHESTRATOR_MODEL).toBe("string");
    expect(ORCHESTRATOR_MODEL.length).toBeGreaterThan(0);
  });

  test("timeout constant is reasonable", async () => {
    const { DIAGNOSIS_TIMEOUT_MS } = await import("../src/backend/config");

    expect(DIAGNOSIS_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DIAGNOSIS_TIMEOUT_MS).toBeLessThanOrEqual(900_000);
  });

  test("CMO context max chars is positive", async () => {
    const { CMO_CONTEXT_MAX_CHARS } = await import("../src/backend/config");

    expect(CMO_CONTEXT_MAX_CHARS).toBeGreaterThan(0);
  });

  test("MAX_SPECIALIST_CONCURRENCY is positive", async () => {
    const { MAX_SPECIALIST_CONCURRENCY } = await import(
      "../src/backend/config"
    );

    expect(MAX_SPECIALIST_CONCURRENCY).toBeGreaterThan(0);
  });
});

describe("Surgical specialist tool assignments", () => {
  test("all surgical specialists get prescribing tools", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );

    const surgeons = [
      "generalSurgeon",
      "cardiothoracicSurgeon",
      "neurosurgeon",
      "orthopedist",
      "otolaryngologist",
      "urologist",
      "vascularSurgeon",
    ] as const;

    for (const id of surgeons) {
      const tools = getToolsForSpecialist(id);
      expect(tools).toHaveProperty("drug-labeling");
      expect(tools).toHaveProperty("adverse-events");
    }
  });
});

describe("relatedArticlesTool assignment", () => {
  test("relatedArticlesTool is assigned to universal category", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );
    const { relatedArticlesTool } = await import(
      "../src/backend/tools/pubmed-search"
    );

    const tools = getToolsForSpecialist("generalist");
    expect(tools).toHaveProperty("related-articles");
    expect(tools["related-articles"]).toBe(relatedArticlesTool);
  });
});

describe("Agent factory validation", () => {
  test("createSpecialistAgent throws for invalid kebab-case ID", async () => {
    const { createSpecialistAgent } = await import(
      "../src/backend/agents/factory"
    );

    expect(() =>
      createSpecialistAgent({
        id: "nonexistent-specialist",
        name: "Nonexistent",
        description: "Test",
        instructions: "Test",
      }),
    ).toThrow("does not exist in toolAssignments");
  });

  test("createSpecialistAgent succeeds for valid kebab-case ID", async () => {
    const { createSpecialistAgent } = await import(
      "../src/backend/agents/factory"
    );

    const agent = createSpecialistAgent({
      id: "general-surgeon",
      name: "General Surgeon",
      description: "Test",
      instructions: "Test",
    });

    expect(agent).toBeDefined();
    expect(agent.id).toBe("general-surgeon");
  });
});

// ---------------------------------------------------------------------------
// Tool Labels
// ---------------------------------------------------------------------------
import { TOOL_LABELS, formatToolLabel } from "../src/backend/tools/tool-labels";

describe("formatToolLabel", () => {
  test("returns human-readable label for known tool IDs", () => {
    expect(formatToolLabel("pubmed-search")).toBe("Searching PubMed");
    expect(formatToolLabel("drug-interaction")).toBe("Checking interactions");
    expect(formatToolLabel("drug-labeling")).toBe("Reviewing FDA label");
    expect(formatToolLabel("adverse-events")).toBe("Checking adverse events");
    expect(formatToolLabel("omim-search")).toBe("Searching OMIM");
    expect(formatToolLabel("medlineplus-search")).toBe("Searching MedlinePlus");
    expect(formatToolLabel("drug-spelling-suggestion")).toBe("Checking drug spelling");
  });

  test("returns fallback for unknown tool IDs", () => {
    expect(formatToolLabel("nonexistent-tool")).toBe("Running nonexistent-tool");
  });

  test("TOOL_LABELS has entries for all 14 known tools", () => {
    const expectedKeys = [
      "pubmed-search",
      "related-articles",
      "drug-lookup",
      "drug-interaction",
      "drug-labeling",
      "adverse-events",
      "omim-search",
      "gene-reviews-search",
      "clinvar-search",
      "clinical-trials-search",
      "drug-recall",
      "substance-toxicology",
      "medlineplus-search",
      "drug-spelling-suggestion",
    ];
    for (const key of expectedKeys) {
      expect(TOOL_LABELS[key]).toBeTruthy();
    }
    expect(Object.keys(TOOL_LABELS)).toHaveLength(expectedKeys.length);
  });

  test("all TOOL_LABELS values are non-empty strings", () => {
    for (const [key, value] of Object.entries(TOOL_LABELS)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
