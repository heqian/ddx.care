import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJSON as baseFetchJSON } from "./utils/fetch";
import type { ToolResult } from "./utils/types";
import {
  APITimeoutError,
  PermanentAPIError,
  RateLimitError,
  isRetriableError,
} from "../utils/errors";

interface RxNavMinConcept {
  rxcui?: string;
  name?: string;
}

interface RxNavInteractionConcept {
  minConceptItem?: RxNavMinConcept;
}

interface RxNavInteractionPair {
  interactionConcept?: RxNavInteractionConcept[];
  severity?: string;
  description?: string;
}

interface RxNavInteractionType {
  interactionPair?: RxNavInteractionPair[];
  comment?: string;
}

interface RxNavInteractionTypeGroup {
  fullInteractionTypeList?: RxNavInteractionType[];
}

interface RxNavInteractionResponse {
  fullInteractionTypeGroupList?: RxNavInteractionTypeGroup[];
}

const RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST";

async function fetchJSON(url: string) {
  return baseFetchJSON(url, { errorPrefix: "RxNav API" });
}

const errorResultSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  retriable: z.boolean(),
});

/**
 * Classify a caught error and return a `ToolResult<never>` failure object.
 */
function toErrorResult(error: unknown): ToolResult<never> {
  const message =
    error instanceof Error ? error.message : "Unknown RxNav API error";
  return {
    ok: false as const,
    error: `RxNav API error: ${message}`,
    retriable: isRetriableError(error),
  };
}

/**
 * Look up drug information including RxCUI, brand names, and generic names.
 * On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.
 */
export const drugLookupTool = createTool({
  id: "drug-lookup",
  description:
    "Look up drug information by name. Returns RxCUI (drug identifier), generic name, brand names, and drug class. Use before checking interactions. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    drugName: z
      .string()
      .describe("Drug name (generic or brand, e.g. 'aspirin', 'Lipitor')"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        rxcui: z.string().optional(),
        name: z.string().optional(),
        synonym: z.string().optional(),
        drugGroup: z
          .object({
            name: z.string().nullable(),
            conceptGroup: z
              .array(
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
    }),
    errorResultSchema,
  ]),
  execute: async ({
    drugName,
  }): Promise<
    ToolResult<{
      rxcui?: string;
      name?: string;
      synonym?: string;
      drugGroup?: {
        name: string | null;
        conceptGroup?: Array<{
          tty: string;
          conceptProperties?: Array<{
            rxcui: string;
            name: string;
            synonym?: string;
            tty: string;
          }>;
        }>;
      };
    }>
  > => {
    try {
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

      return {
        ok: true as const,
        data: { rxcui, name, synonym: undefined, drugGroup },
      };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

/**
 * Check drug-drug interactions between two or more drugs.
 * On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.
 */
export const drugInteractionTool = createTool({
  id: "drug-interaction",
  description:
    "Check drug-drug interactions between two or more medications. Provide RxCUIs (use drug-lookup first to get them). Returns severity, description, and affected drugs. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    rxcuis: z
      .array(z.string())
      .min(2)
      .describe(
        "Array of RxCUIs to check for interactions (at least 2). Use drug-lookup to get RxCUIs first.",
      ),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
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
    }),
    errorResultSchema,
  ]),
  execute: async ({
    rxcuis,
  }): Promise<
    ToolResult<{
      interactions: Array<{
        rxcui1: string;
        rxcui2: string;
        name1?: string;
        name2?: string;
        severity?: string;
        description?: string;
        source?: string;
      }>;
      noInteractionsFound?: boolean;
    }>
  > => {
    try {
      const url = `${RXNAV_BASE}/interaction/list.json?rxcuis=${rxcuis.join("+")}`;
      const result: RxNavInteractionResponse = await fetchJSON(url);

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
        return {
          ok: true as const,
          data: { interactions: [], noInteractionsFound: true },
        };
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

      return {
        ok: true as const,
        data: { interactions, noInteractionsFound: interactions.length === 0 },
      };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

/**
 * Get spelling suggestions for drug names.
 * On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.
 */
export const drugSpellingTool = createTool({
  id: "drug-spelling-suggestion",
  description:
    "Get spelling suggestions for drug names. Use when a drug name might be misspelled. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    drugName: z.string().describe("Possibly misspelled drug name"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        suggestions: z.array(z.string()),
      }),
    }),
    errorResultSchema,
  ]),
  execute: async ({
    drugName,
  }): Promise<ToolResult<{ suggestions: string[] }>> => {
    try {
      const url = `${RXNAV_BASE}/spellingsuggestions.json?name=${encodeURIComponent(drugName)}`;
      const result = await fetchJSON(url);
      const suggestions: string[] =
        result?.suggestionGroup?.suggestionList?.suggestion ?? [];
      return { ok: true as const, data: { suggestions } };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});
