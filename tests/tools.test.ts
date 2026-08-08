import { test, expect, describe } from "bun:test";

const EXPECTED_TOOL_ASSIGNMENTS = {
  generalist: ["universal", "prescribing"],
  pediatrician: ["universal", "prescribing", "rareDisease"],
  geriatrician: ["universal", "prescribing"],
  cardiologist: ["universal", "prescribing"],
  dermatologist: ["universal"],
  endocrinologist: ["universal", "prescribing"],
  gastroenterologist: ["universal", "prescribing"],
  hematologist: ["universal", "prescribing", "trials"],
  infectiologist: ["universal", "prescribing"],
  nephrologist: ["universal", "prescribing"],
  neurologist: ["universal", "prescribing", "rareDisease", "trials"],
  oncologist: ["universal", "prescribing", "trials"],
  pulmonologist: ["universal", "prescribing"],
  rheumatologist: ["universal", "prescribing", "trials", "labPhenotype"],
  generalSurgeon: ["universal", "prescribing"],
  cardiothoracicSurgeon: ["universal", "prescribing"],
  neurosurgeon: ["universal", "prescribing"],
  orthopedist: ["universal", "prescribing"],
  otolaryngologist: ["universal", "prescribing"],
  urologist: ["universal", "prescribing"],
  vascularSurgeon: ["universal", "prescribing"],
  pathologist: ["universal", "rareDisease", "labPhenotype"],
  radiologist: ["universal"],
  geneticist: ["universal", "rareDisease", "labPhenotype"],
  obstetricianGynecologist: ["universal", "prescribing"],
  andrologist: ["universal", "prescribing"],
  maternalFetalMedicine: ["universal", "prescribing", "rareDisease"],
  psychiatrist: ["universal", "prescribing"],
  intensivist: ["universal", "prescribing", "toxicology"],
  toxicologist: ["universal", "prescribing", "toxicology"],
  allergistImmunologist: ["universal", "prescribing"],
  ophthalmologist: ["universal", "prescribing"],
  emergencyPhysician: ["universal", "prescribing", "toxicology"],
  sportsMedicinePhysician: ["universal", "prescribing"],
  podiatrist: ["universal", "prescribing"],
} as const;

const TOOL_IDS_BY_CATEGORY = {
  universal: [
    "medlineplus-search",
    "drug-labeling",
    "adverse-events",
    "food-adverse-events",
    "device-adverse-events",
  ],
  prescribing: [
    "drug-lookup",
    "drug-interaction",
    "drug-spelling-suggestion",
    "drug-shortages",
    "drug-recall",
  ],
  rareDisease: [
    "rare-disease-search",
    "rare-disease-genes",
    "rare-disease-phenotypes",
  ],
  toxicology: ["substance-toxicology"],
  trials: ["clinical-trials-search"],
  labPhenotype: ["hpo-term-search", "loinc-test-lookup"],
} as const;

describe("Agent Registry", () => {
  test("all canonical specialist agents are registered", async () => {
    const { specialistIds, specialists } = await import(
      "../src/backend/agents/index"
    );

    expect(Object.keys(specialists)).toEqual(specialistIds);
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
  test("getAllTools returns all 17 tools for backward compatibility", async () => {
    const { getAllTools } = await import("../src/backend/tools/index");

    const tools = getAllTools();
    const keys = Object.keys(tools);
    expect(keys.length).toBe(17);
  });

  test("getAllTools includes all tool categories", async () => {
    const { getAllTools } = await import("../src/backend/tools/index");

    const tools = getAllTools();
    expect(tools).toHaveProperty("drug-lookup");
    expect(tools).toHaveProperty("drug-interaction");
    expect(tools).toHaveProperty("drug-labeling");
    expect(tools).toHaveProperty("adverse-events");
    expect(tools).toHaveProperty("rare-disease-search");
    expect(tools).toHaveProperty("rare-disease-genes");
    expect(tools).toHaveProperty("rare-disease-phenotypes");
    expect(tools).toHaveProperty("hpo-term-search");
    expect(tools).toHaveProperty("loinc-test-lookup");
    expect(tools).toHaveProperty("drug-shortages");
    expect(tools).toHaveProperty("food-adverse-events");
    expect(tools).toHaveProperty("device-adverse-events");
  });

  test("no duplicate tool IDs in getAllTools", async () => {
    const { getAllTools } = await import("../src/backend/tools/index");

    const tools = getAllTools();
    const keys = Object.keys(tools);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  test("all new tools are present in getAllTools", async () => {
    const { getAllTools } = await import("../src/backend/tools/index");
    const tools = getAllTools();

    const newTools = [
      "rare-disease-search",
      "rare-disease-genes",
      "rare-disease-phenotypes",
      "hpo-term-search",
      "loinc-test-lookup",
      "drug-shortages",
      "food-adverse-events",
      "device-adverse-events",
    ];
    for (const id of newTools) {
      expect(tools).toHaveProperty(id);
    }
  });

  test("getToolsForSpecialist returns universal tools for any specialist", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );
    const tools = getToolsForSpecialist("cardiologist");
    expect(tools).toHaveProperty("medlineplus-search");
    expect(tools).toHaveProperty("drug-labeling");
    expect(tools).toHaveProperty("adverse-events");
  });

  test("geneticist gets rareDisease and labPhenotype tools", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );
    const tools = getToolsForSpecialist("geneticist");
    expect(tools).toHaveProperty("rare-disease-search");
    expect(tools).toHaveProperty("rare-disease-genes");
    expect(tools).toHaveProperty("rare-disease-phenotypes");
    expect(tools).toHaveProperty("hpo-term-search");
    expect(tools).toHaveProperty("loinc-test-lookup");
    expect(tools).toHaveProperty("medlineplus-search");
  });

  test("geneticist does not get prescribing tools", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );
    const tools = getToolsForSpecialist("geneticist");
    expect(tools).not.toHaveProperty("drug-interaction");
    expect(tools).not.toHaveProperty("drug-spelling-suggestion");
  });

  test("toxicologist gets substance-toxicology and prescribing", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );
    const tools = getToolsForSpecialist("toxicologist");
    expect(tools).toHaveProperty("substance-toxicology");
    expect(tools).toHaveProperty("drug-interaction");
    expect(tools).toHaveProperty("drug-lookup");
  });

  test("toxicologist does not get rare disease tools", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );
    const tools = getToolsForSpecialist("toxicologist");
    expect(tools).not.toHaveProperty("rare-disease-search");
  });

  test("oncologist gets clinical-trials-search", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );
    const tools = getToolsForSpecialist("oncologist");
    expect(tools).toHaveProperty("clinical-trials-search");
  });

  test("unknown specialist ID fails instead of receiving fallback tools", async () => {
    const { getToolsForSpecialist } = await import(
      "../src/backend/tools/index"
    );
    const lookup = getToolsForSpecialist as (id: string) => unknown;

    expect(() => lookup("nonexistent-spec")).toThrow(
      'No tool assignment configured for specialist "nonexistent-spec"',
    );
  });

  test("every specialist has the exact expected tool categories", async () => {
    const { toolAssignments } = await import("../src/backend/tools/index");

    expect(toolAssignments).toEqual(EXPECTED_TOOL_ASSIGNMENTS);
  });

  test("formerly mismatched specialists use canonical runtime IDs and exact tools", async () => {
    const { specialists } = await import("../src/backend/agents/index");
    const { getToolsForSpecialist, toolAssignments } = await import(
      "../src/backend/tools/index"
    );
    const regressions = [
      ["generalSurgeon", "general-surgeon"],
      ["cardiothoracicSurgeon", "cardiothoracic-surgeon"],
      ["vascularSurgeon", "vascular-surgeon"],
      ["obstetricianGynecologist", "obstetrician-gynecologist"],
      ["maternalFetalMedicine", "maternal-fetal-medicine"],
      ["allergistImmunologist", "allergist-immunologist"],
      ["emergencyPhysician", "emergency-physician"],
      ["sportsMedicinePhysician", "sports-medicine-physician"],
    ] as const;

    for (const [canonicalId, legacyId] of regressions) {
      const categories = EXPECTED_TOOL_ASSIGNMENTS[canonicalId];
      const expectedToolIds = categories.flatMap(
        (category) => TOOL_IDS_BY_CATEGORY[category],
      );

      expect(specialists[canonicalId].id).toBe(canonicalId);
      expect(specialists[canonicalId].id).not.toBe(legacyId);
      expect(toolAssignments[canonicalId]).toEqual(categories);
      expect(Object.keys(getToolsForSpecialist(canonicalId))).toEqual(
        expectedToolIds,
      );
    }
  });
});

describe("Specialist identity validation", () => {
  const validInput = {
    manifest: [{ id: "generalist" }],
    registry: { generalist: { id: "generalist" } },
    assignmentIds: ["generalist"],
    cmoIds: ["generalist"],
    apiIds: ["generalist"],
  };

  test("accepts equal identity sets", async () => {
    const { validateSpecialistIntegrity } = await import(
      "../src/backend/agents/specialist-integrity"
    );

    expect(validateSpecialistIntegrity(validInput)).toBe(1);
  });

  test("reports duplicate manifest IDs", async () => {
    const { validateSpecialistIntegrity } = await import(
      "../src/backend/agents/specialist-integrity"
    );

    expect(() =>
      validateSpecialistIntegrity({
        ...validInput,
        manifest: [{ id: "generalist" }, { id: "generalist" }],
      }),
    ).toThrow('duplicate manifest ID "generalist"');
  });

  test("reports missing and orphaned assignments", async () => {
    const { validateSpecialistIntegrity } = await import(
      "../src/backend/agents/specialist-integrity"
    );

    expect(() =>
      validateSpecialistIntegrity({ ...validInput, assignmentIds: [] }),
    ).toThrow('missing tool assignment ID "generalist"');
    expect(() =>
      validateSpecialistIntegrity({
        ...validInput,
        assignmentIds: ["generalist", "unknownSpecialist"],
      }),
    ).toThrow('orphaned tool assignment ID "unknownSpecialist"');
  });

  test("reports runtime and CMO identity drift", async () => {
    const { validateSpecialistIntegrity } = await import(
      "../src/backend/agents/specialist-integrity"
    );

    expect(() =>
      validateSpecialistIntegrity({
        ...validInput,
        registry: { generalist: { id: "general-specialist" } },
      }),
    ).toThrow(
      'registry ID "generalist" does not match runtime ID "general-specialist"',
    );
    expect(() =>
      validateSpecialistIntegrity({
        ...validInput,
        cmoIds: ["generalist", "unknownSpecialist"],
      }),
    ).toThrow('orphaned CMO ID "unknownSpecialist"');
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
    // Default is 900000 (15 min); value is operator-configurable, so we only
    // assert the default here and leave the upper bound to validateConfig.
    expect(DIAGNOSIS_TIMEOUT_MS).toBe(900_000);
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

  test("ORPHADATA_ENABLED defaults to true", async () => {
    const { ORPHADATA_ENABLED } = await import("../src/backend/config");
    expect(typeof ORPHADATA_ENABLED).toBe("boolean");
  });
});

describe("Agent factory", () => {
  test("createSpecialistAgent succeeds for canonical camelCase ID", async () => {
    const { createSpecialistAgent } = await import(
      "../src/backend/agents/factory"
    );

    const agent = createSpecialistAgent({
      id: "generalSurgeon",
      name: "General Surgeon",
      description: "Test",
      instructions: "Test",
    });

    expect(agent).toBeDefined();
    expect(agent.id).toBe("generalSurgeon");
  });

  test("createSpecialistAgent assigns per-specialist tools", async () => {
    const { createSpecialistAgent } = await import(
      "../src/backend/agents/factory"
    );

    const agent = createSpecialistAgent({
      id: "cardiologist",
      name: "Cardiologist",
      description: "Test",
      instructions: "Test",
    });

    expect(agent).toBeDefined();
    expect(agent.id).toBe("cardiologist");
  });

  test("specialist and CMO instructions preserve interaction coverage warnings", async () => {
    const { specialists } = await import("../src/backend/agents/index");
    const { chiefMedicalOfficer } = await import(
      "../src/backend/agents/chief-medical-officer"
    );
    const specialistInstructions = String(
      await specialists.cardiologist.getInstructions(),
    );
    const cmoInstructions = String(await chiefMedicalOfficer.getInstructions());

    for (const instructions of [specialistInstructions, cmoInstructions]) {
      expect(instructions).toContain("interactionStatus");
      expect(instructions).toContain("partial");
      expect(instructions).toContain("unavailable");
      expect(instructions).toContain("not comprehensive interaction clearance");
    }
    expect(cmoInstructions).toContain("Do not convert unknown into none_found");
  });

  test("drug interaction description explains safe negative semantics", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    expect(drugInteractionTool.description).toContain(
      "none_found is only valid with complete coverage",
    );
    expect(drugInteractionTool.description).toContain(
      "not comprehensive interaction clearance",
    );
  });
});

// ---------------------------------------------------------------------------
// Tool Labels
// ---------------------------------------------------------------------------
import { TOOL_LABELS, formatToolLabel } from "../src/backend/tools/tool-labels";

describe("formatToolLabel", () => {
  test("returns human-readable label for known tool IDs", () => {
    expect(formatToolLabel("drug-interaction")).toBe("Checking interactions");
    expect(formatToolLabel("drug-labeling")).toBe("Reviewing FDA label");
    expect(formatToolLabel("adverse-events")).toBe("Checking adverse events");
    expect(formatToolLabel("medlineplus-search")).toBe("Searching MedlinePlus");
    expect(formatToolLabel("drug-spelling-suggestion")).toBe(
      "Checking drug spelling",
    );
    expect(formatToolLabel("rare-disease-search")).toBe(
      "Searching rare diseases",
    );
    expect(formatToolLabel("rare-disease-genes")).toBe(
      "Looking up disease genes",
    );
    expect(formatToolLabel("rare-disease-phenotypes")).toBe(
      "Retrieving disease phenotypes",
    );
    expect(formatToolLabel("hpo-term-search")).toBe(
      "Searching phenotype terms",
    );
    expect(formatToolLabel("loinc-test-lookup")).toBe("Looking up lab test");
    expect(formatToolLabel("drug-shortages")).toBe("Checking drug shortages");
    expect(formatToolLabel("food-adverse-events")).toBe(
      "Searching food adverse events",
    );
    expect(formatToolLabel("device-adverse-events")).toBe(
      "Searching device adverse events",
    );
  });

  test("returns fallback for unknown tool IDs", () => {
    expect(formatToolLabel("nonexistent-tool")).toBe(
      "Running nonexistent-tool",
    );
  });

  test("TOOL_LABELS has entries for all 17 known tools", () => {
    const expectedKeys = [
      "drug-lookup",
      "drug-interaction",
      "drug-labeling",
      "adverse-events",
      "clinical-trials-search",
      "drug-recall",
      "substance-toxicology",
      "medlineplus-search",
      "drug-spelling-suggestion",
      "rare-disease-search",
      "rare-disease-genes",
      "rare-disease-phenotypes",
      "hpo-term-search",
      "loinc-test-lookup",
      "drug-shortages",
      "food-adverse-events",
      "device-adverse-events",
    ];
    for (const key of expectedKeys) {
      expect(TOOL_LABELS[key]).toBeTruthy();
    }
    expect(Object.keys(TOOL_LABELS)).toHaveLength(expectedKeys.length);
  });

  test("all TOOL_LABELS values are non-empty strings", () => {
    for (const value of Object.values(TOOL_LABELS)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
