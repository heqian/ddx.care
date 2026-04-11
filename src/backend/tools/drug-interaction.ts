import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJSON as baseFetchJSON } from "./utils/fetch";

const RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST";

async function fetchJSON(url: string) {
  return baseFetchJSON(url, { errorPrefix: "RxNav API" });
}

/**
 * Look up drug information including RxCUI, brand names, and generic names.
 */
export const drugLookupTool = createTool({
  id: "drug-lookup",
  description:
    "Look up drug information by name. Returns RxCUI (drug identifier), generic name, brand names, and drug class. Use before checking interactions.",
  inputSchema: z.object({
    drugName: z.string().describe("Drug name (generic or brand, e.g. 'aspirin', 'Lipitor')"),
  }),
  outputSchema: z.object({
    rxcui: z.string().optional(),
    name: z.string().optional(),
    synonym: z.string().optional(),
    drugGroup: z
      .object({
        name: z.string().nullable(),
        conceptGroup: z.array(
          z.object({
            tty: z.string(),
            conceptProperties: z
              .array(
                z.object({
                  rxcui: z.string(),
                  name: z.string(),
                  synonym: z.string().optional(),
                  tty: z.string(),
                }),
              )
              .optional(),
          }),
        )
        .optional(),
      })
      .optional(),
  }),
  execute: async ({ drugName }) => {
    const url = `${RXNAV_BASE}/drugs.json?name=${encodeURIComponent(drugName)}`;
    const result = await fetchJSON(url);
    const drugGroup = result?.drugGroup;

    // Extract the first RxCUI from the results
    let rxcui: string | undefined;
    let name: string | undefined;
    if (drugGroup?.conceptGroup) {
      for (const cg of drugGroup.conceptGroup) {
        if (cg.conceptProperties?.length) {
          for (const cp of cg.conceptProperties) {
            if (cp.rxcui) {
              rxcui ??= cp.rxcui;
              name ??= cp.name;
            }
          }
        }
      }
    }

    return { rxcui, name, synonym: undefined, drugGroup };
  },
});

/**
 * Check drug-drug interactions between two or more drugs.
 */
export const drugInteractionTool = createTool({
  id: "drug-interaction",
  description:
    "Check drug-drug interactions between two or more medications. Provide RxCUIs (use drug-lookup first to get them). Returns severity, description, and affected drugs.",
  inputSchema: z.object({
    rxcuis: z
      .array(z.string())
      .min(2)
      .describe("Array of RxCUIs to check for interactions (at least 2). Use drug-lookup to get RxCUIs first."),
  }),
  outputSchema: z.object({
    interactions: z.array(
      z.object({
        rxcui1: z.string(),
        rxcui2: z.string(),
        name1: z.string().optional(),
        name2: z.string().optional(),
        severity: z.string().optional(),
        description: z.string().optional(),
        source: z.string().optional(),
      }),
    ),
    noInteractionsFound: z.boolean().optional(),
  }),
  execute: async ({ rxcuis }) => {
    const url = `${RXNAV_BASE}/interaction/list.json?rxcuis=${rxcuis.join("+")}`;
    let result: any;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        // RxNav interaction API may be temporarily unavailable
        return { interactions: [], noInteractionsFound: true };
      }
      result = await res.json();
    } catch {
      return { interactions: [], noInteractionsFound: true };
    }

    const interactions: Array<{
      rxcui1: string;
      rxcui2: string;
      name1?: string;
      name2?: string;
      severity?: string;
      description?: string;
      source?: string;
    }> = [];

    const interactionTypeGroups = result?.fullInteractionTypeGroupList ?? [];

    if (interactionTypeGroups.length === 0) {
      return { interactions: [], noInteractionsFound: true };
    }

    for (const group of interactionTypeGroups) {
      const interactionTypes = group?.fullInteractionTypeList ?? [];
      for (const interaction of interactionTypes) {
        const pairs = interaction?.interactionPair ?? [];
        for (const pair of pairs) {
          const concepts = pair?.interactionConcept ?? [];
          if (concepts.length >= 2) {
            interactions.push({
              rxcui1: concepts[0]?.minConceptItem?.rxcui ?? "",
              rxcui2: concepts[1]?.minConceptItem?.rxcui ?? "",
              name1: concepts[0]?.minConceptItem?.name ?? undefined,
              name2: concepts[1]?.minConceptItem?.name ?? undefined,
              severity: pair?.severity ?? undefined,
              description: pair?.description ?? undefined,
              source: interaction?.comment ?? undefined,
            });
          }
        }
      }
    }

    return { interactions, noInteractionsFound: interactions.length === 0 };
  },
});

/**
 * Get spelling suggestions for drug names.
 */
export const drugSpellingTool = createTool({
  id: "drug-spelling-suggestion",
  description: "Get spelling suggestions for drug names. Use when a drug name might be misspelled.",
  inputSchema: z.object({
    drugName: z.string().describe("Possibly misspelled drug name"),
  }),
  outputSchema: z.object({
    suggestions: z.array(z.string()),
  }),
  execute: async ({ drugName }) => {
    const url = `${RXNAV_BASE}/spellingsuggestions.json?name=${encodeURIComponent(drugName)}`;
    const result = await fetchJSON(url);
    const suggestions: string[] = result?.suggestionGroup?.suggestionList?.suggestion ?? [];
    return { suggestions };
  },
});
