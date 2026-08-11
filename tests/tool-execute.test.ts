import { test, expect, describe, beforeEach, afterEach, vi } from "bun:test";
import { resetToolCache } from "../src/backend/tools/utils/tool-cache";
import { clinicianReviewedDrugInteractionCases } from "./drug-interaction-corpus";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetToolCache();
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

    const result: any = await drugLookupTool.execute!(
      { drugName: "aspirin" },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.rxcui).toBe("12345");
    expect(result.data.name).toBe("Aspirin");
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

    const result: any = await drugLookupTool.execute!(
      { drugName: "unknown" },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.rxcui).toBeUndefined();
  });

  test("drugLookupTool prefers SCD over BPCK combo packs", async () => {
    const { drugLookupTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        drugGroup: {
          name: "aspirin",
          conceptGroup: [
            {
              tty: "BPCK",
              conceptProperties: [
                {
                  rxcui: "2047428",
                  name: "Excedrin Combo Pack",
                  tty: "BPCK",
                },
              ],
            },
            {
              tty: "SCD",
              conceptProperties: [
                {
                  rxcui: "103863",
                  name: "aspirin 75 MG Oral Tablet",
                  tty: "SCD",
                },
              ],
            },
          ],
        },
      }),
    }) as any;

    const result: any = await drugLookupTool.execute!(
      { drugName: "aspirin" },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.rxcui).toBe("103863");
    expect(result.data.name).toBe("aspirin 75 MG Oral Tablet");
  });

  test("drugInteractionTool returns interactions", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    // Mock fetch to return appropriate responses based on URL:
    // - RxNav drugs.json (RxCUI lookup) → returns drug info
    // - FDA drug/label.json → returns label with drug_interactions mentioning the other drug
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/drugs.json")) {
        // Extract drug name from URL
        const name =
          new URL(url, "https://rxnav.nlm.nih.gov").searchParams.get("name") ??
          "";
        const rxcui = name.toLowerCase() === "warfarin" ? "456" : "123";
        return {
          ok: true,
          status: 200,
          json: async () => ({
            drugGroup: {
              conceptGroup: [
                {
                  tty: "SBD",
                  conceptProperties: [{ rxcui, name, tty: "SBD" }],
                },
              ],
            },
          }),
        };
      }
      if (url.includes("/drug/label.json")) {
        // Return FDA label where aspirin's drug_interactions mention warfarin
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                drug_interactions: [
                  "Concomitant use of aspirin with warfarin may increase the risk of bleeding.",
                ],
                contraindications: [],
                warnings: [],
                boxed_warning: [],
              },
            ],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as any;

    const result: any = await drugInteractionTool.execute!(
      {
        drugNames: ["aspirin", "warfarin"],
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.interactions.length).toBeGreaterThanOrEqual(1);
    expect(result.data.interactionStatus).toBe("found");
    expect(result.data.coverage).toBe("complete");
    expect(result.data.checks).toEqual([
      { input: "aspirin", resolvedName: "aspirin", status: "checked" },
      { input: "warfarin", resolvedName: "warfarin", status: "checked" },
    ]);
  });

  test("drugInteractionTool falls back to generic_name when rxcui label lookup fails", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    let labelCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/drugs.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            drugGroup: {
              conceptGroup: [
                {
                  tty: "SCD",
                  conceptProperties: [
                    {
                      rxcui: "855290",
                      name: "warfarin sodium 1 MG",
                      tty: "SCD",
                    },
                  ],
                },
              ],
            },
          }),
        };
      }
      if (url.includes("/drug/label.json")) {
        labelCallCount++;
        const search =
          new URL(url, "https://api.fda.gov").searchParams.get("search") ?? "";
        // Primary rxcui lookup returns no results (simulates OpenFDA not
        // indexing this branded rxcui)
        if (search.includes("openfda.rxcui")) {
          return { ok: true, status: 200, json: async () => ({ results: [] }) };
        }
        // Fallback generic_name lookup returns a label
        if (search.includes("openfda.generic_name")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  drug_interactions: [
                    "warfarin interacts with aspirin increasing bleeding risk",
                  ],
                  contraindications: [],
                  warnings: [],
                  boxed_warning: [],
                },
              ],
            }),
          };
        }
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as any;

    const result: any = await drugInteractionTool.execute!(
      {
        drugNames: ["warfarin", "aspirin"],
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.coverage).toBe("complete");
    expect(result.data.interactionStatus).toBe("found");
    expect(labelCallCount).toBeGreaterThanOrEqual(2);
  });

  test("drugInteractionTool handles API error gracefully", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("Network error")) as any;

    const result: any = await drugInteractionTool.execute!(
      {
        drugNames: ["aspirin", "warfarin"],
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Unexpected error: ${result.error}`);
    expect(result.data.interactions).toEqual([]);
    expect(result.data.interactionStatus).toBe("unknown");
    expect(result.data.coverage).toBe("unavailable");
    expect(result.data.checks).toEqual([
      {
        input: "aspirin",
        status: "failed",
        errorCode: "rxnav_unavailable",
      },
      {
        input: "warfarin",
        status: "failed",
        errorCode: "rxnav_unavailable",
      },
    ]);
    expect(JSON.stringify(result.data.checks)).not.toContain("http");
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

    const result: any = await drugInteractionTool.execute!(
      {
        drugNames: ["aspirin", "warfarin"],
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Unexpected error: ${result.error}`);
    expect(result.data.interactions).toEqual([]);
    expect(result.data.interactionStatus).toBe("unknown");
    expect(result.data.coverage).toBe("unavailable");
    expect(
      result.data.checks.every((check: any) => check.status === "failed"),
    ).toBe(true);
  });

  test("drugInteractionTool handles empty interaction list", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    // Mock fetch to return RxCUI + FDA label without any interaction mentions
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/drugs.json")) {
        const name =
          new URL(url, "https://rxnav.nlm.nih.gov").searchParams.get("name") ??
          "";
        return {
          ok: true,
          status: 200,
          json: async () => ({
            drugGroup: {
              conceptGroup: [
                {
                  tty: "SBD",
                  conceptProperties: [{ rxcui: "123", name, tty: "SBD" }],
                },
              ],
            },
          }),
        };
      }
      if (url.includes("/drug/label.json")) {
        // Return FDA label with no interaction data mentioning other drugs
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                drug_interactions: ["No known interactions with other drugs."],
                contraindications: [],
                warnings: [],
                boxed_warning: [],
              },
            ],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as any;

    const result: any = await drugInteractionTool.execute!(
      {
        drugNames: ["aspirin", "ibuprofen"],
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.interactions).toEqual([]);
    expect(result.data.interactionStatus).toBe("none_found");
    expect(result.data.coverage).toBe("complete");
    expect(result.data.source.name).toBe("OpenFDA Drug Labels");
    expect(result.data.source.limitation).toContain(
      "not proof that no interaction exists",
    );
  });

  test("drugInteractionTool marks unresolved drugs as partial coverage", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/drugs.json")) {
        const name = new URL(url).searchParams.get("name") ?? "";
        return {
          ok: true,
          status: 200,
          json: async () =>
            name === "unknown-drug"
              ? { drugGroup: { conceptGroup: [] } }
              : {
                  drugGroup: {
                    conceptGroup: [
                      {
                        tty: "SCD",
                        conceptProperties: [
                          { rxcui: "123", name: "Aspirin", tty: "SCD" },
                        ],
                      },
                    ],
                  },
                },
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [{ drug_interactions: [] }] }),
      };
    }) as any;

    const result: any = await drugInteractionTool.execute!(
      {
        drugNames: ["aspirin", "unknown-drug"],
      },
      {} as any,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.interactionStatus).toBe("unknown");
    expect(result.data.coverage).toBe("partial");
    expect(result.data.checks).toEqual([
      { input: "aspirin", resolvedName: "Aspirin", status: "checked" },
      {
        input: "unknown-drug",
        status: "unresolved",
        errorCode: "drug_not_resolved",
      },
    ]);
  });

  test("drugInteractionTool preserves findings with partial coverage", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/drugs.json")) {
        const name = new URL(url).searchParams.get("name") ?? "";
        const concepts: Record<string, { rxcui: string; name: string }> = {
          aspirin: { rxcui: "111", name: "Aspirin" },
          warfarin: { rxcui: "222", name: "Warfarin" },
        };
        const concept = concepts[name];
        return {
          ok: true,
          status: 200,
          json: async () => ({
            drugGroup: {
              conceptGroup: concept
                ? [
                    {
                      tty: "SCD",
                      conceptProperties: [{ ...concept, tty: "SCD" }],
                    },
                  ]
                : [],
            },
          }),
        };
      }
      const rxcui = new URL(url).searchParams.get("search") ?? "";
      if (rxcui.includes("111")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                drug_interactions: [
                  "Aspirin used with warfarin may increase bleeding.",
                ],
              },
            ],
          }),
        };
      }
      return {
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      };
    }) as any;

    const result: any = await drugInteractionTool.execute!(
      {
        drugNames: ["aspirin", "warfarin", "unknown-drug"],
      },
      {} as any,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.interactionStatus).toBe("found");
    expect(result.data.coverage).toBe("partial");
    expect(result.data.interactions).toHaveLength(1);
    expect(result.data.checks.map((check: any) => check.status)).toEqual([
      "checked",
      "failed",
      "unresolved",
    ]);
  });

  test("drug interaction schema rejects unsafe negative status combinations", async () => {
    const { drugInteractionDataSchema, FDA_LABEL_LIMITATION } = await import(
      "../src/backend/tools/drug-interaction"
    );
    const source = {
      name: "OpenFDA Drug Labels" as const,
      limitation: FDA_LABEL_LIMITATION,
    };

    const partialNegative = drugInteractionDataSchema.safeParse({
      interactionStatus: "none_found",
      coverage: "partial",
      checks: [
        { input: "aspirin", resolvedName: "Aspirin", status: "checked" },
        {
          input: "unknown",
          status: "unresolved",
          errorCode: "drug_not_resolved",
        },
      ],
      interactions: [],
      source,
    });
    const unavailableNegative = drugInteractionDataSchema.safeParse({
      interactionStatus: "none_found",
      coverage: "unavailable",
      checks: [
        {
          input: "aspirin",
          status: "failed",
          errorCode: "rxnav_unavailable",
        },
        {
          input: "warfarin",
          status: "failed",
          errorCode: "rxnav_unavailable",
        },
      ],
      interactions: [],
      source,
    });

    expect(partialNegative.success).toBe(false);
    expect(unavailableNegative.success).toBe(false);
  });

  for (const regressionCase of clinicianReviewedDrugInteractionCases) {
    test(`clinician-reviewed interaction regression: ${regressionCase.id}`, async () => {
      const { drugInteractionTool } = await import(
        "../src/backend/tools/drug-interaction"
      );

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/drugs.json")) {
          const name = new URL(url).searchParams.get("name") ?? "";
          const index = regressionCase.drugNames.indexOf(name);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              drugGroup: {
                conceptGroup: [
                  {
                    tty: "SCD",
                    conceptProperties: [
                      {
                        rxcui: regressionCase.rxcuis[index],
                        name,
                        tty: "SCD",
                      },
                    ],
                  },
                ],
              },
            }),
          };
        }

        const search = new URL(url).searchParams.get("search") ?? "";
        const index = regressionCase.rxcuis.findIndex((rxcui) =>
          search.includes(rxcui),
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                drug_interactions: [regressionCase.labelInteractionText[index]],
              },
            ],
          }),
        };
      }) as any;

      const result: any = await drugInteractionTool.execute!(
        {
          drugNames: regressionCase.drugNames,
        },
        {} as any,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
      expect(result.data.coverage).toBe("complete");
      expect(result.data.interactionStatus).toBe(regressionCase.expectedStatus);
    });
  }

  test("drugInteractionTool memoizes RxCUI lookups (no N² RxNorm calls)", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    let rxnavLookupCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/drugs.json")) {
        rxnavLookupCount++;
        const name =
          new URL(url, "https://rxnav.nlm.nih.gov").searchParams.get("name") ??
          "";
        return {
          ok: true,
          status: 200,
          json: async () => ({
            drugGroup: {
              conceptGroup: [
                {
                  tty: "SBD",
                  conceptProperties: [{ rxcui: "123", name, tty: "SBD" }],
                },
              ],
            },
          }),
        };
      }
      if (url.includes("/drug/label.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as any;

    // 3 unique drugs. Without memoization the N×N loop makes 6 RxNorm calls
    // (3 outer + 3 inner). With memoization it makes exactly 3 (one per drug).
    await drugInteractionTool.execute!(
      {
        drugNames: ["aspirin", "warfarin", "ibuprofen"],
      },
      {} as any,
    );
    expect(rxnavLookupCount).toBe(3);
  });

  test("drugInteractionTool memoizes RxCUI lookups case-insensitively", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );

    let rxnavLookupCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/drugs.json")) {
        rxnavLookupCount++;
        const name =
          new URL(url, "https://rxnav.nlm.nih.gov").searchParams.get("name") ??
          "";
        return {
          ok: true,
          status: 200,
          json: async () => ({
            drugGroup: {
              conceptGroup: [
                {
                  tty: "SBD",
                  conceptProperties: [{ rxcui: "123", name, tty: "SBD" }],
                },
              ],
            },
          }),
        };
      }
      if (url.includes("/drug/label.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as any;

    // "Aspirin" and "aspirin" share a cache key (lowercased) → a single RxNorm
    // lookup, not two.
    await drugInteractionTool.execute!(
      {
        drugNames: ["Aspirin", "aspirin"],
      },
      {} as any,
    );
    expect(rxnavLookupCount).toBe(1);
  });

  test("drugInteractionTool schema rejects more than 10 drug names", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );
    const schema = (drugInteractionTool as any).inputSchema;
    const eleven = Array.from({ length: 11 }, (_, i) => `drug${i}`);
    expect(schema.safeParse({ drugNames: eleven }).success).toBe(false);
  });

  test("drugInteractionTool schema rejects fewer than 2 drug names", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );
    const schema = (drugInteractionTool as any).inputSchema;
    expect(schema.safeParse({ drugNames: ["aspirin"] }).success).toBe(false);
  });

  test("drugInteractionTool schema accepts up to 10 drug names", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );
    const schema = (drugInteractionTool as any).inputSchema;
    const ten = Array.from({ length: 10 }, (_, i) => `drug${i}`);
    expect(schema.safeParse({ drugNames: ten }).success).toBe(true);
  });

  test("drugInteractionTool schema rejects drug names over 100 characters", async () => {
    const { drugInteractionTool } = await import(
      "../src/backend/tools/drug-interaction"
    );
    const schema = (drugInteractionTool as any).inputSchema;
    // 101 chars → rejected.
    expect(
      schema.safeParse({ drugNames: ["aspirin", "a".repeat(101)] }).success,
    ).toBe(false);
    // Exactly 100 chars → accepted (boundary).
    expect(
      schema.safeParse({ drugNames: ["aspirin", "b".repeat(100)] }).success,
    ).toBe(true);
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

    const result: any = await drugSpellingTool.execute!(
      { drugName: "asprin" },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.suggestions).toEqual(["aspirin", "asprin"]);
  });
});

describe("medlineplus tool execute", () => {
  test("medlinePlusSearchTool returns results by condition name", async () => {
    const { medlinePlusSearchTool } = await import(
      "../src/backend/tools/medlineplus"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `<?xml version="1.0"?><nlmSearchResult><term>diabetes</term><count>1</count><list><document rank="0" url="https://medlineplus.gov/diabetes.html"><content name="title">Diabetes</content><content name="FullSummary">Diabetes overview</content></document></list></nlmSearchResult>`,
    }) as any;

    const result: any = await medlinePlusSearchTool.execute!(
      {
        condition: "diabetes",
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].title).toBe("Diabetes");
    expect(result.data.results[0].summary).toBe("Diabetes overview");
    expect(result.data.results[0].url).toBe(
      "https://medlineplus.gov/diabetes.html",
    );
  });

  test("medlinePlusSearchTool searches by condition name", async () => {
    const { medlinePlusSearchTool } = await import(
      "../src/backend/tools/medlineplus"
    );

    let calledUrl = "";
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrl = url;
      return {
        ok: true,
        status: 200,
        text: async () =>
          `<?xml version="1.0"?><nlmSearchResult><term>hypertension</term><count>1</count><list><document rank="0" url="https://medlineplus.gov/hypertension.html"><content name="title">Hypertension</content><content name="FullSummary">High blood pressure info</content></document></list></nlmSearchResult>`,
      };
    }) as any;

    const result: any = await medlinePlusSearchTool.execute!(
      {
        condition: "hypertension",
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(calledUrl).toContain("wsearch.nlm.nih.gov/ws/query");
    expect(calledUrl).toContain("db=healthTopics");
    expect(calledUrl).toContain("term=hypertension");
  });

  test("medlinePlusSearchTool strips highlighting spans and HTML from summary", async () => {
    const { medlinePlusSearchTool } = await import(
      "../src/backend/tools/medlineplus"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `<?xml version="1.0"?><nlmSearchResult><count>1</count><list><document url="https://medlineplus.gov/asthma.html"><content name="title">&lt;span class="qt0"&gt;Asthma&lt;/span&gt;</content><content name="FullSummary">What is &lt;span class="qt0"&gt;asthma&lt;/span&gt;?&lt;p&gt;It is a lung disease.&lt;/p&gt;</content></document></list></nlmSearchResult>`,
    }) as any;

    const result: any = await medlinePlusSearchTool.execute!(
      {
        condition: "asthma",
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results[0].title).toBe("Asthma");
    expect(result.data.results[0].summary).toBe(
      "What is asthma?It is a lung disease.",
    );
  });

  test("medlinePlusSearchTool returns noResults for unknown condition", async () => {
    const { medlinePlusSearchTool } = await import(
      "../src/backend/tools/medlineplus"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `<?xml version="1.0"?><nlmSearchResult><term>xyz-unknown</term><count>0</count></nlmSearchResult>`,
    }) as any;

    const result: any = await medlinePlusSearchTool.execute!(
      {
        condition: "xyz-unknown",
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected success result");
    expect(result.data.results).toEqual([]);
    expect(result.data.noResults).toBe(true);
    expect(result.data.message).toBe(
      "No MedlinePlus information found for this condition.",
    );
  });

  test("medlinePlusSearchTool rejects malformed HTTP 200 responses", async () => {
    const { medlinePlusSearchTool } = await import(
      "../src/backend/tools/medlineplus"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<html><body>Upstream error</body></html>",
    }) as any;

    const result: any = await medlinePlusSearchTool.execute!(
      {
        condition: "malformed-response",
      },
      {} as any,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected error result");
    expect(result.error).toBe(
      "MedlinePlus returned an invalid or incomplete response.",
    );
    expect(result.retriable).toBe(false);
  });

  test("medlinePlusSearchTool rejects positive counts without documents", async () => {
    const { medlinePlusSearchTool } = await import(
      "../src/backend/tools/medlineplus"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `<?xml version="1.0"?><nlmSearchResult><term>schema-drift</term><count>1</count></nlmSearchResult>`,
    }) as any;

    const result: any = await medlinePlusSearchTool.execute!(
      {
        condition: "schema-drift",
      },
      {} as any,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected error result");
    expect(result.error).toBe(
      "MedlinePlus returned an invalid or incomplete response.",
    );
    expect(result.retriable).toBe(false);
  });

  test("medlinePlusSearchTool handles fetch timeout gracefully", async () => {
    const { medlinePlusSearchTool } = await import(
      "../src/backend/tools/medlineplus"
    );

    const abortError = new Error("The operation was aborted");
    (abortError as any).name = "AbortError";
    globalThis.fetch = vi.fn().mockRejectedValue(abortError) as any;

    const result: any = await medlinePlusSearchTool.execute!(
      {
        condition: "diabetes",
      },
      {} as any,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected error result");
    expect(result.retriable).toBe(true);
  });

  test("medlinePlusSearchTool falls back to snippet when FullSummary absent", async () => {
    const { medlinePlusSearchTool } = await import(
      "../src/backend/tools/medlineplus"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `<?xml version="1.0"?><nlmSearchResult><count>1</count><list><document url="https://medlineplus.gov/x.html"><content name="title">Topic</content><content name="snippet">Brief snippet text</content></document></list></nlmSearchResult>`,
    }) as any;

    const result: any = await medlinePlusSearchTool.execute!(
      {
        condition: "topic",
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results[0].summary).toBe("Brief snippet text");
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

    const result: any = await clinicalTrialsSearchTool.execute!(
      {
        query: "diabetes",
        status: "RECRUITING",
        pageSize: 5,
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].nctId).toBe("NCT001");
    expect(result.data.results[0].status).toBe("RECRUITING");
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

    const result: any = await clinicalTrialsSearchTool.execute!(
      {
        query: "xyz",
        status: "ALL",
        pageSize: 5,
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toEqual([]);
    expect(result.data.totalCount).toBe(0);
  });
});

describe("open-fda tool execute", () => {
  test("adverseEventsTool returns parsed events", async () => {
    const { adverseEventsTool } = await import("../src/backend/tools/open-fda");

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

    const result: any = await adverseEventsTool.execute!(
      {
        drugName: "aspirin",
        limit: 3,
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].reportId).toBe("SR001");
    expect(result.data.results[0].serious).toBe(true);
    expect(result.data.meta?.totalResults).toBe(100);
  });

  test("adverseEventsTool handles 404 with noResults", async () => {
    const { adverseEventsTool } = await import("../src/backend/tools/open-fda");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }) as any;

    const result: any = await adverseEventsTool.execute!(
      {
        drugName: "unknown-drug",
        limit: 3,
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected success result");
    expect(result.data.results).toEqual([]);
    expect(result.data.noResults).toBe(true);
    expect(result.data.message).toBe(
      "No adverse event reports found for this drug.",
    );
  });

  test("drugLabelingTool returns parsed labeling", async () => {
    const { drugLabelingTool } = await import("../src/backend/tools/open-fda");

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

    const result: any = await drugLabelingTool.execute!(
      {
        drugName: "atorvastatin",
        limit: 1,
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].brandName).toBe("Lipitor");
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

    const result: any = await drugRecallTool.execute!(
      {
        drugName: "drug-a",
        limit: 5,
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].recallNumber).toBe("R-123");
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
            uuid: "507a6831-264f-47a1-afad-71f1d966d185",
            unii: "3T7J3K0L5Z",
            substance_class: "chemical",
            names: [
              {
                name: "ETHYLENE GLYCOL",
                preferred: true,
                display_name: true,
              },
              { name: "1,2-ethanediol", preferred: false },
            ],
            codes: [
              { code: "3T7J3K0L5Z", code_system: "FDA UNII", type: "PRIMARY" },
              { code: "107-21-1", code_system: "CAS" },
            ],
          },
        ],
      }),
    }) as any;

    const result: any = await substanceToxicologyTool.execute!(
      {
        substanceName: "ethylene glycol",
        limit: 3,
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].substanceName).toBe("ETHYLENE GLYCOL");
    expect(result.data.results[0].unii).toBe("3T7J3K0L5Z");
    expect(result.data.results[0].substanceClass).toBe("chemical");
    expect(result.data.results[0].code).toBe("3T7J3K0L5Z");
    expect(result.data.results[0].codeSystem).toBe("FDA UNII");
  });

  test("substanceToxicologyTool falls back to first name when no preferred", async () => {
    const { substanceToxicologyTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            unii: "ABC123",
            names: [{ name: "Polyethylene glycol", preferred: false }],
            codes: [{ code: "ABC123", code_system: "FDA UNII" }],
          },
        ],
      }),
    }) as any;

    const result: any = await substanceToxicologyTool.execute!(
      {
        substanceName: "polyethylene",
        limit: 1,
      },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results[0].substanceName).toBe("Polyethylene glycol");
    expect(result.data.results[0].unii).toBe("ABC123");
  });
});
