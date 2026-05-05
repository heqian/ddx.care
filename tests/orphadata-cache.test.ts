import {
  test,
  expect,
  describe,
  beforeAll,
  afterAll,
  vi,
} from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const originalFetch = globalThis.fetch;
const tmpDir = "/tmp/ddx-test-orphadata-cache";

const MOCK_DISEASES = [
  { ORPHAcode: 58, "Preferred term": "Alexander disease" },
  { ORPHAcode: 586, "Preferred term": "Cystic fibrosis" },
  { ORPHAcode: 61, "Preferred term": "Alpha-mannosidosis" },
  {
    ORPHAcode: 166024,
    "Preferred term":
      "Multiple epiphyseal dysplasia-macrocephaly-facial dysmorphism syndrome",
  },
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
              ExternalReference: [
                { Source: "HGNC", Reference: "4235" },
                { Source: "OMIM", Reference: "137780" },
              ],
            },
            DisorderGeneAssociationType:
              "Disease-causing germline mutation(s) in",
          },
        ],
      },
    },
  },
  586: {
    data: {
      results: {
        DisorderGeneAssociation: [
          {
            Gene: {
              Symbol: "CFTR",
              name: "cystic fibrosis transmembrane conductance regulator",
              ExternalReference: [{ Source: "HGNC", Reference: "1884" }],
            },
            DisorderGeneAssociationType:
              "Disease-causing germline mutation(s) in",
          },
          {
            Gene: {
              Symbol: "SERPINA1",
              name: "serpin family A member 1",
              ExternalReference: [{ Source: "OMIM", Reference: "107400" }],
            },
            DisorderGeneAssociationType: "Modifying germline mutation in",
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
            {
              HPO: {
                HPOId: "HP:0001249",
                HPOTerm: "Intellectual disability",
              },
              HPOFrequency: "Frequent (79-30%)",
            },
          ],
        },
      },
    },
  },
  586: {
    data: {
      results: {
        Disorder: {
          HPODisorderAssociation: [
            {
              HPO: {
                HPOId: "HP:0001738",
                HPOTerm: "Exocrine pancreatic insufficiency",
              },
              HPOFrequency: "Very frequent (99-80%)",
            },
          ],
        },
      },
    },
  },
};

function createFetchMock() {
  return vi.fn().mockImplementation(async (url: string) => {
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

describe("Orphadata Cache — Full Suite", () => {
  let cache: typeof import("../src/backend/orphadata-cache");
  let dbCounter = 0;

  beforeAll(async () => {
    mkdirSync(tmpDir, { recursive: true });
    process.env.ORPHADATA_DB_PATH = join(tmpDir, `full-suite-${Date.now()}.sqlite`);
    globalThis.fetch = createFetchMock();
    cache = await import("../src/backend/orphadata-cache");
    await cache.initializeOrphadataCache();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("Initialization", () => {
    test("populates disease table on init", () => {
      const stats = cache.getCacheStats();
      expect(stats.diseases).toBe(4);
    });

    test("genes and phenotypes tables start empty (lazy loading)", () => {
      const stats = cache.getCacheStats();
      expect(stats.genesForCode(58)).toBe(0);
      expect(stats.phenotypesForCode(58)).toBe(0);
    });
  });

  describe("Disease Search", () => {
    test("searches diseases by partial name", () => {
      const results = cache.searchDiseases("Alexander", 10);
      expect(results).toHaveLength(1);
      expect(results[0].orphacode).toBe(58);
      expect(results[0].name).toBe("Alexander disease");
    });

    test("searches diseases matching multiple results", () => {
      const results = cache.searchDiseases("epiphyseal", 10);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toContain("epiphyseal");
    });

    test("respects maxResults limit", () => {
      const results = cache.searchDiseases("a", 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    test("returns empty array for no matches", () => {
      const results = cache.searchDiseases("zzz-nonexistent-disease", 10);
      expect(results).toEqual([]);
    });

    test("search is case-insensitive via LIKE", () => {
      const lower = cache.searchDiseases("alexander", 10);
      const upper = cache.searchDiseases("ALEXANDER", 10);
      expect(lower).toEqual(upper);
      expect(lower.length).toBe(1);
    });

    test("matches partial terms within longer names", () => {
      const results = cache.searchDiseases("cystic", 10);
      expect(results).toHaveLength(1);
      expect(results[0].orphacode).toBe(586);
    });
  });

  describe("Gene Lazy Loading", () => {
    test("fetches and caches genes on first call", async () => {
      const genes = await cache.getDiseaseGenes(58);
      expect(genes).toHaveLength(1);
      expect(genes[0].geneSymbol).toBe("GFAP");
      expect(genes[0].geneName).toBe("glial fibrillary acidic protein");
      expect(genes[0].associationType).toBe(
        "Disease-causing germline mutation(s) in",
      );
      expect(genes[0].source).toBe("4235");
    });

    test("caches multiple genes per disease", async () => {
      const genes = await cache.getDiseaseGenes(586);
      expect(genes).toHaveLength(2);
      expect(genes.find((g) => g.geneSymbol === "CFTR")).toBeDefined();
      expect(genes.find((g) => g.geneSymbol === "SERPINA1")).toBeDefined();
    });

    test("extracts HGNC reference as source", async () => {
      const genes = await cache.getDiseaseGenes(586);
      const cftr = genes.find((g) => g.geneSymbol === "CFTR");
      expect(cftr?.source).toBe("1884");
    });

    test("returns null source when no HGNC reference", async () => {
      const genes = await cache.getDiseaseGenes(586);
      const serpina1 = genes.find((g) => g.geneSymbol === "SERPINA1");
      expect(serpina1?.source).toBeNull();
    });

    test("returns cached data on second call without fetching", async () => {
      const mockFetch = globalThis.fetch as any;
      const callCountBefore = mockFetch.mock.calls.length;
      await cache.getDiseaseGenes(58);
      const callCountAfter = mockFetch.mock.calls.length;
      expect(callCountAfter).toBe(callCountBefore);
    });

    test("returns empty array for disease with no genes", async () => {
      const genes = await cache.getDiseaseGenes(99999);
      expect(genes).toEqual([]);
    });

    test("getCacheStats reports genes after caching", async () => {
      const stats = cache.getCacheStats();
      expect(stats.genesForCode(58)).toBe(1);
      expect(stats.genesForCode(586)).toBe(2);
      expect(stats.genesForCode(99999)).toBe(0);
    });
  });

  describe("Phenotype Lazy Loading", () => {
    test("fetches and caches phenotypes on first call", async () => {
      const phenotypes = await cache.getDiseasePhenotypes(58);
      expect(phenotypes).toHaveLength(3);
      expect(phenotypes[0].hpoId).toBe("HP:0000256");
      expect(phenotypes[0].phenotypeName).toBe("Macrocephaly");
      expect(phenotypes[0].frequency).toBe("Very frequent (99-80%)");
    });

    test("caches phenotypes with frequency", async () => {
      const phenotypes = await cache.getDiseasePhenotypes(58);
      const seizure = phenotypes.find((p) => p.hpoId === "HP:0001250");
      expect(seizure?.phenotypeName).toBe("Seizure");
      expect(seizure?.frequency).toBe("Very frequent (99-80%)");
    });

    test("returns cached phenotypes on second call", async () => {
      const mockFetch = globalThis.fetch as any;
      const callCountBefore = mockFetch.mock.calls.length;
      await cache.getDiseasePhenotypes(58);
      const callCountAfter = mockFetch.mock.calls.length;
      expect(callCountAfter).toBe(callCountBefore);
    });

    test("returns empty array for disease with no phenotypes", async () => {
      const phenotypes = await cache.getDiseasePhenotypes(99999);
      expect(phenotypes).toEqual([]);
    });

    test("getCacheStats reports phenotypes after caching", async () => {
      const stats = cache.getCacheStats();
      expect(stats.phenotypesForCode(58)).toBe(3);
      expect(stats.phenotypesForCode(99999)).toBe(0);
    });
  });

  describe("Error Handling", () => {
    test("getDiseaseGenes returns empty on fetch failure", async () => {
      const savedFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
      const genes = await cache.getDiseaseGenes(12345);
      expect(genes).toEqual([]);
      globalThis.fetch = savedFetch;
    });

    test("getDiseasePhenotypes returns empty on fetch failure", async () => {
      const savedFetch = globalThis.fetch;
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Network error"));
      const phenotypes = await cache.getDiseasePhenotypes(12345);
      expect(phenotypes).toEqual([]);
      globalThis.fetch = savedFetch;
    });
  });

  describe("Data Integrity", () => {
    test("disease search returns results with correct shape", () => {
      const results = cache.searchDiseases("Alexander", 10);
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty("orphacode");
      expect(results[0]).toHaveProperty("name");
      expect(typeof results[0].orphacode).toBe("number");
      expect(typeof results[0].name).toBe("string");
    });

    test("gene results have correct shape", async () => {
      const genes = await cache.getDiseaseGenes(58);
      for (const g of genes) {
        expect(typeof g.geneSymbol).toBe("string");
        expect(typeof g.geneName).toBe("string");
        expect(typeof g.associationType).toBe("string");
        expect(g.source === null || typeof g.source === "string").toBe(true);
      }
    });

    test("phenotype results have correct shape", async () => {
      const phenotypes = await cache.getDiseasePhenotypes(58);
      for (const p of phenotypes) {
        expect(typeof p.hpoId).toBe("string");
        expect(typeof p.phenotypeName).toBe("string");
        expect(p.hpoId).toMatch(/^HP:\d+$/);
        expect(
          p.frequency === null || typeof p.frequency === "string",
        ).toBe(true);
      }
    });

    test("getCacheStats returns valid numbers", () => {
      const stats = cache.getCacheStats();
      expect(typeof stats.diseases).toBe("number");
      expect(stats.diseases).toBeGreaterThan(0);
      expect(typeof stats.genesForCode(58)).toBe("number");
      expect(typeof stats.phenotypesForCode(58)).toBe("number");
    });
  });
});

describe("Orphadata Cache — Init Failure Handling", () => {
  afterAll(() => {
    globalThis.fetch = originalFetch;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("initializeOrphadataCache handles fetch failure gracefully", async () => {
    mkdirSync(tmpDir, { recursive: true });
    process.env.ORPHADATA_DB_PATH = join(tmpDir, `fail-net-${Date.now()}.sqlite`);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const cache = await import("../src/backend/orphadata-cache");
    await cache.initializeOrphadataCache();

    const stats = cache.getCacheStats();
    expect(stats.diseases).toBe(0);
  });

  test("initializeOrphadataCache handles non-200 response", async () => {
    mkdirSync(tmpDir, { recursive: true });
    process.env.ORPHADATA_DB_PATH = join(tmpDir, `fail-500-${Date.now()}.sqlite`);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const cache = await import("../src/backend/orphadata-cache");
    await cache.initializeOrphadataCache();

    const stats = cache.getCacheStats();
    expect(stats.diseases).toBe(0);
  });
});
