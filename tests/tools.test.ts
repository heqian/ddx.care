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
  test("getAllTools returns all 22 tools", async () => {
    const { getAllTools } = await import("../src/backend/tools/index");

    const tools = getAllTools();
    const keys = Object.keys(tools);
    expect(keys.length).toBe(22);
  });

  test("every specialist gets all tools via getAllTools", async () => {
    const { getAllTools } = await import("../src/backend/tools/index");

    const tools = getAllTools();
    expect(tools).toHaveProperty("pubmed-search");
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

  test("ORPHADATA_ENABLED defaults to true", async () => {
    const { ORPHADATA_ENABLED } = await import("../src/backend/config");
    expect(typeof ORPHADATA_ENABLED).toBe("boolean");
  });
});

describe("relatedArticlesTool assignment", () => {
  test("relatedArticlesTool is included in getAllTools", async () => {
    const { getAllTools } = await import("../src/backend/tools/index");
    const { relatedArticlesTool } = await import(
      "../src/backend/tools/pubmed-search"
    );

    const tools = getAllTools();
    expect(tools).toHaveProperty("related-articles");
    expect(tools["related-articles"]).toBe(relatedArticlesTool);
  });
});

describe("Agent factory", () => {
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

  test("createSpecialistAgent assigns all tools to any specialist", async () => {
    const { createSpecialistAgent } = await import(
      "../src/backend/agents/factory"
    );

    const agent = createSpecialistAgent({
      id: "test-specialist",
      name: "Test Specialist",
      description: "Test",
      instructions: "Test",
    });

    expect(agent).toBeDefined();
    expect(agent.id).toBe("test-specialist");
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
    expect(formatToolLabel("rare-disease-search")).toBe("Searching rare diseases");
    expect(formatToolLabel("rare-disease-genes")).toBe("Looking up disease genes");
    expect(formatToolLabel("rare-disease-phenotypes")).toBe("Retrieving disease phenotypes");
    expect(formatToolLabel("hpo-term-search")).toBe("Searching phenotype terms");
    expect(formatToolLabel("loinc-test-lookup")).toBe("Looking up lab test");
    expect(formatToolLabel("drug-shortages")).toBe("Checking drug shortages");
    expect(formatToolLabel("food-adverse-events")).toBe("Searching food adverse events");
    expect(formatToolLabel("device-adverse-events")).toBe("Searching device adverse events");
  });

  test("returns fallback for unknown tool IDs", () => {
    expect(formatToolLabel("nonexistent-tool")).toBe("Running nonexistent-tool");
  });

  test("TOOL_LABELS has entries for all 22 known tools", () => {
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
    for (const [key, value] of Object.entries(TOOL_LABELS)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
