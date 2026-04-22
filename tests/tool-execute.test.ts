import { test, expect, describe, beforeEach, afterEach, vi } from "bun:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("drug-interaction tool execute", () => {
  test("drugLookupTool returns parsed drug info", async () => {
    const { drugLookupTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        drugGroup: {
          name: "Aspirin",
          conceptGroup: [
            {
              tty: "SBD",
              conceptProperties: [
                { rxcui: "12345", name: "Aspirin", synonym: "ASA", tty: "SBD" },
              ],
            },
          ],
        },
      }),
    }) as any;

    const result = await drugLookupTool.execute({ drugName: "aspirin" });
    expect(result.rxcui).toBe("12345");
    expect(result.name).toBe("Aspirin");
  });

  test("drugLookupTool handles empty response", async () => {
    const { drugLookupTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ drugGroup: { name: null, conceptGroup: [] } }),
    }) as any;

    const result = await drugLookupTool.execute({ drugName: "unknown" });
    expect(result.rxcui).toBeUndefined();
  });

  test("drugInteractionTool returns interactions", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        fullInteractionTypeGroupList: [
          {
            fullInteractionTypeList: [
              {
                interactionPair: [
                  {
                    interactionConcept: [
                      { minConceptItem: { rxcui: "123", name: "Drug A" } },
                      { minConceptItem: { rxcui: "456", name: "Drug B" } },
                    ],
                    severity: "high",
                    description: "Major interaction",
                  },
                ],
                comment: "DrugBank",
              },
            ],
          },
        ],
      }),
    }) as any;

    const result = await drugInteractionTool.execute({
      rxcuis: ["123", "456"],
    });
    expect(result.interactions).toHaveLength(1);
    expect(result.interactions[0].severity).toBe("high");
    expect(result.noInteractionsFound).toBe(false);
  });

  test("drugInteractionTool handles API error gracefully", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await drugInteractionTool.execute({
      rxcuis: ["123", "456"],
    });
    expect(result.interactions).toEqual([]);
    expect(result.noInteractionsFound).toBe(true);
  });

  test("drugInteractionTool handles non-200 HTTP response gracefully", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    }) as any;

    const result = await drugInteractionTool.execute({
      rxcuis: ["123", "456"],
    });
    expect(result.interactions).toEqual([]);
    expect(result.noInteractionsFound).toBe(true);
  });

  test("drugInteractionTool handles empty interaction list", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        fullInteractionTypeGroupList: [],
      }),
    }) as any;

    const result = await drugInteractionTool.execute({
      rxcuis: ["123", "456"],
    });
    expect(result.interactions).toEqual([]);
    expect(result.noInteractionsFound).toBe(true);
  });

  test("drugSpellingTool returns suggestions", async () => {
    const { drugSpellingTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        suggestionGroup: {
          suggestionList: { suggestion: ["aspirin", "asprin"] },
        },
      }),
    }) as any;

    const result = await drugSpellingTool.execute({ drugName: "asprin" });
    expect(result.suggestions).toEqual(["aspirin", "asprin"]);
  });
});

describe("medlineplus tool execute", () => {
  test("medlinePlusSearchTool returns results by ICD-10", async () => {
    const { medlinePlusSearchTool } = await import(
      "../src/backend/tools/medlineplus"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        feed: {
          entry: [
            {
              title: { _value: "Diabetes" },
              summary: { _value: "Diabetes overview" },
              link: [{ href: "https://medlineplus.gov/diabetes.html" }],
            },
          ],
        },
      }),
    }) as any;

    const result = await medlinePlusSearchTool.execute({
      condition: "diabetes",
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Diabetes");
    expect(result.results[0].summary).toBe("Diabetes overview");
  });

  test("medlinePlusSearchTool falls back to condition name search", async () => {
    const { medlinePlusSearchTool } = await import(
      "../src/backend/tools/medlineplus"
    );

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // ICD-10 lookup fails
        return { ok: false, status: 404 };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          feed: {
            entry: [
              {
                title: "Hypertension",
                summary: "High blood pressure info",
                link: [{ href: "https://medlineplus.gov/hypertension.html" }],
              },
            ],
          },
        }),
      };
    }) as any;

    const result = await medlinePlusSearchTool.execute({
      condition: "hypertension",
    });
    expect(result.results).toHaveLength(1);
    expect(callCount).toBe(2);
  });

  test("medlinePlusSearchTool returns empty array for unknown condition", async () => {
    const { medlinePlusSearchTool } = await import(
      "../src/backend/tools/medlineplus"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ feed: {} }),
    }) as any;

    const result = await medlinePlusSearchTool.execute({
      condition: "xyz-unknown",
    });
    expect(result.results).toEqual([]);
    expect(result.error).toBe("No information found for this condition.");
  });

  test("medlinePlusSearchTool handles fetch timeout gracefully", async () => {
    const { medlinePlusSearchTool } = await import(
      "../src/backend/tools/medlineplus"
    );

    const abortError = new Error("The operation was aborted");
    (abortError as any).name = "AbortError";
    globalThis.fetch = vi.fn().mockRejectedValue(abortError) as any;

    const result = await medlinePlusSearchTool.execute({
      condition: "diabetes",
    });
    expect(result.results).toEqual([]);
    expect(result.error).toBe("No information found for this condition.");
  });
});

describe("clinical-trials tool execute", () => {
  test("clinicalTrialsSearchTool returns parsed trials", async () => {
    const { clinicalTrialsSearchTool } = await import(
      "../src/backend/tools/clinical-trials"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        studies: [
          {
            protocolSection: {
              identificationModule: {
                nctId: "NCT001",
                briefTitle: "Trial 1",
              },
              statusModule: { overallStatus: "RECRUITING" },
              designModule: {
                phases: ["Phase 2"],
                studyType: "Interventional",
              },
              conditionsModule: { conditions: ["Diabetes"] },
            },
          },
        ],
        totalCount: 1,
      }),
    }) as any;

    const result = await clinicalTrialsSearchTool.execute({
      query: "diabetes",
      status: "RECRUITING",
      pageSize: 5,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].nctId).toBe("NCT001");
    expect(result.results[0].status).toBe("RECRUITING");
  });

  test("clinicalTrialsSearchTool handles empty results", async () => {
    const { clinicalTrialsSearchTool } = await import(
      "../src/backend/tools/clinical-trials"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ studies: [], totalCount: 0 }),
    }) as any;

    const result = await clinicalTrialsSearchTool.execute({
      query: "xyz",
      status: "ALL",
      pageSize: 5,
    });
    expect(result.results).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});

describe("open-fda tool execute", () => {
  test("adverseEventsTool returns parsed events", async () => {
    const { adverseEventsTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            safetyreportid: "SR001",
            serious: "1",
            patient: {
              reaction: [
                { reactionmeddrapt: "Nausea", reactionoutcome: "Recovered" },
              ],
              patientonsetage: 45,
              patientsex: "1",
            },
            receivedate: "20240101",
          },
        ],
        meta: { results: { total: 100 }, disclaimer: "Test disclaimer" },
      }),
    }) as any;

    const result = await adverseEventsTool.execute({
      drugName: "aspirin",
      limit: 3,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].reportId).toBe("SR001");
    expect(result.results[0].serious).toBe(true);
    expect(result.meta?.totalResults).toBe(100);
  });

  test("adverseEventsTool handles 404 with ignore404", async () => {
    const { adverseEventsTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }) as any;

    const result = await adverseEventsTool.execute({
      drugName: "unknown-drug",
      limit: 3,
    });
    expect(result.results).toEqual([]);
    expect(result.error).toBe("No adverse event reports found for this drug.");
  });

  test("drugLabelingTool returns parsed labeling", async () => {
    const { drugLabelingTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: "label-1",
            openfda: {
              brand_name: ["Lipitor"],
              generic_name: ["Atorvastatin"],
            },
            indications_and_usage: ["Lowers cholesterol"],
          },
        ],
      }),
    }) as any;

    const result = await drugLabelingTool.execute({
      drugName: "atorvastatin",
      limit: 1,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].brandName).toBe("Lipitor");
  });

  test("drugRecallTool returns parsed recalls", async () => {
    const { drugRecallTool } = await import("../src/backend/tools/open-fda");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            recall_number: "R-123",
            product_description: "Drug A 10mg",
            reason_for_recall: "Labeling error",
            classification: "Class II",
            status: "Ongoing",
            recalling_firm: "Pharma Inc",
            recall_initiation_date: "20240115",
          },
        ],
      }),
    }) as any;

    const result = await drugRecallTool.execute({
      drugName: "drug-a",
      limit: 5,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].recallNumber).toBe("R-123");
  });

  test("substanceToxicologyTool returns parsed substances", async () => {
    const { substanceToxicologyTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            substance_id: "SUB-001",
            substance_name: "Ethylene Glycol",
            approval_id: "APP-001",
          },
        ],
      }),
    }) as any;

    const result = await substanceToxicologyTool.execute({
      substanceName: "ethylene glycol",
      limit: 3,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].substanceName).toBe("Ethylene Glycol");
  });
});

describe("pubmed-search tool execute", () => {
  test("pubmedSearchTool returns articles", async () => {
    const { pubmedSearchTool } = await import(
      "../src/backend/tools/pubmed-search"
    );

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // esearch
        return {
          ok: true,
          status: 200,
          json: async () => ({
            esearchresult: { idlist: ["12345"], count: "1" },
          }),
        };
      }
      if (callCount === 2) {
        // esummary
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              12345: {
                title: "Test Article",
                authors: [{ name: "Smith J" }],
                fulljournalname: "Test Journal",
                pubdate: "2024",
              },
            },
          }),
        };
      }
      // efetch (abstracts)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          PubmedArticle: [
            {
              MedlineCitation: {
                PMID: "12345",
                Article: {
                  Abstract: { AbstractText: "Test abstract" },
                },
              },
            },
          ],
        }),
      };
    }) as any;

    const result = await pubmedSearchTool.execute({
      query: "test",
      maxResults: 5,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].pmid).toBe("12345");
    expect(result.totalResults).toBe(1);
  });

  test("pubmedSearchTool handles empty search", async () => {
    const { pubmedSearchTool } = await import(
      "../src/backend/tools/pubmed-search"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        esearchresult: { idlist: [], count: "0" },
      }),
    }) as any;

    const result = await pubmedSearchTool.execute({
      query: "xyz-nonexistent",
      maxResults: 5,
    });
    expect(result.results).toEqual([]);
    expect(result.totalResults).toBe(0);
  });

  test("relatedArticlesTool returns related articles", async () => {
    const { relatedArticlesTool } = await import(
      "../src/backend/tools/pubmed-search"
    );

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            linksets: [
              {
                linksetdbs: [{ links: ["67890"] }],
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            67890: {
              title: "Related Article",
              authors: [{ name: "Doe J" }],
              fulljournalname: "Related Journal",
              pubdate: "2023",
            },
          },
        }),
      };
    }) as any;

    const result = await relatedArticlesTool.execute({
      pmid: "12345",
      maxResults: 5,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].pmid).toBe("67890");
  });

  test("omimSearchTool returns genetic conditions", async () => {
    const { omimSearchTool } = await import(
      "../src/backend/tools/pubmed-search"
    );

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            esearchresult: { idlist: ["OMIM-001"], count: "1" },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            "OMIM-001": {
              title: "Marfan Syndrome",
              summary: "Connective tissue disorder",
            },
          },
        }),
      };
    }) as any;

    const result = await omimSearchTool.execute({
      query: "marfan",
      maxResults: 5,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Marfan Syndrome");
  });
});
