import { test, expect, describe, afterEach, vi } from "bun:test";
import { resetToolCache } from "../src/backend/tools/utils/tool-cache";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetToolCache();
});

describe("hpoTermSearchTool", () => {
  test("returns parsed HPO terms on success", async () => {
    const { hpoTermSearchTool } = await import(
      "../src/backend/tools/nlm-clinical-tables"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        6,
        ["HP:0000256", "HP:0004481", "HP:0004482"],
        null,
        [
          ["HP:0000256", "Macrocephaly"],
          ["HP:0004481", "Progressive macrocephaly"],
          ["HP:0004482", "Relative macrocephaly"],
        ],
      ],
    }) as any;

    const result = await hpoTermSearchTool.execute({
      query: "macrocephaly",
      maxResults: 10,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(3);
    expect(result.data.results[0].hpoId).toBe("HP:0000256");
    expect(result.data.results[0].name).toBe("Macrocephaly");
    expect(result.data.totalAvailable).toBe(6);
  });

  test("returns noResults when no terms found", async () => {
    const { hpoTermSearchTool } = await import(
      "../src/backend/tools/nlm-clinical-tables"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [0, [], null, []],
    }) as any;

    const result = await hpoTermSearchTool.execute({
      query: "zzz-nonexistent",
      maxResults: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected success result");
    expect(result.data.results).toEqual([]);
    expect(result.data.noResults).toBe(true);
    expect(result.data.message).toBe("No HPO terms found matching the query.");
  });

  test("handles 404 response with noResults", async () => {
    const { hpoTermSearchTool } = await import(
      "../src/backend/tools/nlm-clinical-tables"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }) as any;

    const result = await hpoTermSearchTool.execute({
      query: "test",
      maxResults: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected success result");
    expect(result.data.results).toEqual([]);
    expect(result.data.noResults).toBe(true);
    expect(result.data.message).toBe("No HPO terms found matching the query.");
  });

  test("handles network error", async () => {
    const { hpoTermSearchTool } = await import(
      "../src/backend/tools/nlm-clinical-tables"
    );

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await hpoTermSearchTool.execute({
      query: "seizure",
      maxResults: 10,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected error result");
    expect(result.error).toContain("Network error");
    expect(result.retriable).toBe(true);
  });

  test("handles null data with noResults", async () => {
    const { hpoTermSearchTool } = await import(
      "../src/backend/tools/nlm-clinical-tables"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => null,
    }) as any;

    const result = await hpoTermSearchTool.execute({
      query: "test",
      maxResults: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected success result");
    expect(result.data.results).toEqual([]);
    expect(result.data.noResults).toBe(true);
    expect(result.data.message).toBe("No HPO terms found matching the query.");
  });
});

describe("loincTestLookupTool", () => {
  test("returns parsed LOINC tests on success", async () => {
    const { loincTestLookupTool } = await import(
      "../src/backend/tools/nlm-clinical-tables"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        467,
        ["43113-0", "94537-8"],
        null,
        [
          ["43113-0", "Hemoglobin panel", "-", "Electrophoresis"],
          ["94537-8", "Hemoglobin panel", "-", "HPLC"],
        ],
      ],
    }) as any;

    const result = await loincTestLookupTool.execute({
      query: "hemoglobin",
      maxResults: 10,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(2);
    expect(result.data.results[0].loincCode).toBe("43113-0");
    expect(result.data.results[0].componentName).toBe("Hemoglobin panel");
    expect(result.data.results[0].method).toBe("Electrophoresis");
    expect(result.data.totalAvailable).toBe(467);
  });

  test("returns empty system and method when missing", async () => {
    const { loincTestLookupTool } = await import(
      "../src/backend/tools/nlm-clinical-tables"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [1, ["723-7"], null, [["723-7", "Hemoglobin", "", ""]]],
    }) as any;

    const result = await loincTestLookupTool.execute({
      query: "hemoglobin",
      maxResults: 10,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].loincCode).toBe("723-7");
    expect(result.data.results[0].componentName).toBe("Hemoglobin");
    expect(result.data.results[0].system).toBeUndefined();
    expect(result.data.results[0].method).toBeUndefined();
  });

  test("returns noResults when no tests found", async () => {
    const { loincTestLookupTool } = await import(
      "../src/backend/tools/nlm-clinical-tables"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [0, [], null, []],
    }) as any;

    const result = await loincTestLookupTool.execute({
      query: "zzz-nonexistent",
      maxResults: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected success result");
    expect(result.data.results).toEqual([]);
    expect(result.data.noResults).toBe(true);
    expect(result.data.message).toBe(
      "No LOINC tests found matching the query.",
    );
  });

  test("handles 404 with noResults", async () => {
    const { loincTestLookupTool } = await import(
      "../src/backend/tools/nlm-clinical-tables"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }) as any;

    const result = await loincTestLookupTool.execute({
      query: "test",
      maxResults: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected success result");
    expect(result.data.results).toEqual([]);
    expect(result.data.noResults).toBe(true);
    expect(result.data.message).toBe(
      "No LOINC tests found matching the query.",
    );
  });

  test("handles network error", async () => {
    const { loincTestLookupTool } = await import(
      "../src/backend/tools/nlm-clinical-tables"
    );

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await loincTestLookupTool.execute({
      query: "troponin",
      maxResults: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network error");
    expect(result.retriable).toBe(true);
  });

  test("handles LOINC records with system info", async () => {
    const { loincTestLookupTool } = await import(
      "../src/backend/tools/nlm-clinical-tables"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        1,
        ["2345-7"],
        null,
        [["2345-7", "Glucose", "Serum", ""]],
      ],
    }) as any;

    const result = await loincTestLookupTool.execute({
      query: "glucose",
      maxResults: 10,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results[0].system).toBe("Serum");
    expect(result.data.results[0].method).toBeUndefined();
  });
});
