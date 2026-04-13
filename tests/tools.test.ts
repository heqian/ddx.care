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
    expect(DIAGNOSIS_TIMEOUT_MS).toBeLessThanOrEqual(600_000);
  });
});
