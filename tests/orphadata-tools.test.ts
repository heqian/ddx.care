import { test, expect, describe, afterAll, vi } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resetToolCache } from "../src/backend/tools/utils/tool-cache";

const originalFetch = globalThis.fetch;
const tmpDir = "/tmp/ddx-test-orphadata-tools";

const MOCK_DISEASES = [
  { ORPHAcode: 58, "Preferred term": "Alexander disease" },
  { ORPHAcode: 586, "Preferred term": "Cystic fibrosis" },
  { ORPHAcode: 61, "Preferred term": "Alpha-mannosidosis" },
];

const MOCK_GENES: Record<number, any> = {
  58: {
    data: {
      results: {
        DisorderGeneAssociation: [
          {
            Gene: {
              Symbol: "GFAP",
              name: "glial fibrillary acidic protein",
              ExternalReference: [{ Source: "HGNC", Reference: "4235" }],
            },
            DisorderGeneAssociationType:
              "Disease-causing germline mutation(s) in",
          },
        ],
      },
    },
  },
};

const MOCK_PHENOTYPES: Record<number, any> = {
  58: {
    data: {
      results: {
        Disorder: {
          HPODisorderAssociation: [
            {
              HPO: { HPOId: "HP:0000256", HPOTerm: "Macrocephaly" },
              HPOFrequency: "Very frequent (99-80%)",
            },
            {
              HPO: { HPOId: "HP:0001250", HPOTerm: "Seizure" },
              HPOFrequency: "Very frequent (99-80%)",
            },
          ],
        },
      },
    },
  },
};

function setupMocks() {
  mkdirSync(tmpDir, { recursive: true });
  process.env.ORPHADATA_DB_PATH = join(
    tmpDir,
    `tools-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`,
  );
  globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes("/rd-cross-referencing/orphacodes?lang=en")) {
      return {
        ok: true,
        json: async () => ({ data: { results: MOCK_DISEASES } }),
      };
    }
    if (url.includes("/rd-associated-genes/orphacodes/")) {
      const match = url.match(/orphacodes\/(\d+)/);
      const code = match ? Number.parseInt(match[1]) : 0;
      const data = MOCK_GENES[code] || { error: { code: 404 } };
      return { ok: true, json: async () => data };
    }
    if (url.includes("/rd-phenotypes/orphacodes/")) {
      const match = url.match(/orphacodes\/(\d+)/);
      const code = match ? Number.parseInt(match[1]) : 0;
      const data = MOCK_PHENOTYPES[code] || { error: { code: 404 } };
      return { ok: true, json: async () => data };
    }
    return { ok: false, status: 404, statusText: "Not Found" };
  }) as any;
}

afterAll(() => {
  globalThis.fetch = originalFetch;
  resetToolCache();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("rareDiseaseSearchTool", () => {
  test("returns matching diseases from cache", async () => {
    setupMocks();
    const { initializeOrphadataCache } = await import(
      "../src/backend/orphadata-cache"
    );
    const { rareDiseaseSearchTool } = await import(
      "../src/backend/tools/orphadata"
    );
    await initializeOrphadataCache();

    const result = await rareDiseaseSearchTool.execute({
      query: "Alexander",
      maxResults: 10,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].orphacode).toBe(58);
    expect(result.data.results[0].name).toBe("Alexander disease");
  });

  test("returns multiple matches", async () => {
    setupMocks();
    const { initializeOrphadataCache } = await import(
      "../src/backend/orphadata-cache"
    );
    const { rareDiseaseSearchTool } = await import(
      "../src/backend/tools/orphadata"
    );
    await initializeOrphadataCache();

    const result = await rareDiseaseSearchTool.execute({
      query: "a",
      maxResults: 10,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results.length).toBeGreaterThanOrEqual(2);
  });

  test("returns error when no diseases match", async () => {
    setupMocks();
    const { initializeOrphadataCache } = await import(
      "../src/backend/orphadata-cache"
    );
    const { rareDiseaseSearchTool } = await import(
      "../src/backend/tools/orphadata"
    );
    await initializeOrphadataCache();

    const result = await rareDiseaseSearchTool.execute({
      query: "zzz-nonexistent",
      maxResults: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("No rare diseases found matching the query.");
    expect(result.retriable).toBe(false);
  });

  test("respects maxResults parameter", async () => {
    setupMocks();
    const { initializeOrphadataCache } = await import(
      "../src/backend/orphadata-cache"
    );
    const { rareDiseaseSearchTool } = await import(
      "../src/backend/tools/orphadata"
    );
    await initializeOrphadataCache();

    const result = await rareDiseaseSearchTool.execute({
      query: "a",
      maxResults: 1,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results.length).toBeLessThanOrEqual(1);
  });
});

describe("rareDiseaseGenesTool", () => {
  test("returns genes for a known disease", async () => {
    setupMocks();
    const { initializeOrphadataCache } = await import(
      "../src/backend/orphadata-cache"
    );
    const { rareDiseaseGenesTool } = await import(
      "../src/backend/tools/orphadata"
    );
    await initializeOrphadataCache();

    const result = await rareDiseaseGenesTool.execute({ orphacode: 58 });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].geneSymbol).toBe("GFAP");
    expect(result.data.results[0].geneName).toBe(
      "glial fibrillary acidic protein",
    );
    expect(result.data.results[0].associationType).toBe(
      "Disease-causing germline mutation(s) in",
    );
    expect(result.data.results[0].source).toBe("4235");
  });

  test("returns error for disease with no genes", async () => {
    setupMocks();
    const { initializeOrphadataCache } = await import(
      "../src/backend/orphadata-cache"
    );
    const { rareDiseaseGenesTool } = await import(
      "../src/backend/tools/orphadata"
    );
    await initializeOrphadataCache();

    const result = await rareDiseaseGenesTool.execute({ orphacode: 99999 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("99999");
    expect(result.retriable).toBe(false);
  });

  test("returns error for uncached disease when fetch fails", async () => {
    setupMocks();
    const { initializeOrphadataCache } = await import(
      "../src/backend/orphadata-cache"
    );
    const { rareDiseaseGenesTool } = await import(
      "../src/backend/tools/orphadata"
    );
    await initializeOrphadataCache();

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await rareDiseaseGenesTool.execute({ orphacode: 12345 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("12345");
    expect(result.retriable).toBe(false);
  });
});

describe("rareDiseasePhenotypesTool", () => {
  test("returns phenotypes for a known disease", async () => {
    setupMocks();
    const { initializeOrphadataCache } = await import(
      "../src/backend/orphadata-cache"
    );
    const { rareDiseasePhenotypesTool } = await import(
      "../src/backend/tools/orphadata"
    );
    await initializeOrphadataCache();

    const result = await rareDiseasePhenotypesTool.execute({ orphacode: 58 });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(2);
    expect(result.data.results[0].hpoId).toBe("HP:0000256");
    expect(result.data.results[0].phenotypeName).toBe("Macrocephaly");
    expect(result.data.results[0].frequency).toBe("Very frequent (99-80%)");
  });

  test("returns error for disease with no phenotypes", async () => {
    setupMocks();
    const { initializeOrphadataCache } = await import(
      "../src/backend/orphadata-cache"
    );
    const { rareDiseasePhenotypesTool } = await import(
      "../src/backend/tools/orphadata"
    );
    await initializeOrphadataCache();

    const result = await rareDiseasePhenotypesTool.execute({
      orphacode: 99999,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("99999");
    expect(result.retriable).toBe(false);
  });

  test("returns error for uncached disease when fetch fails", async () => {
    setupMocks();
    const { initializeOrphadataCache } = await import(
      "../src/backend/orphadata-cache"
    );
    const { rareDiseasePhenotypesTool } = await import(
      "../src/backend/tools/orphadata"
    );
    await initializeOrphadataCache();

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await rareDiseasePhenotypesTool.execute({
      orphacode: 12345,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("12345");
    expect(result.retriable).toBe(false);
  });
});
