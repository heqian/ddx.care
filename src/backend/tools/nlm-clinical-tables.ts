import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJSON } from "./utils/fetch";
import {
  APITimeoutError,
  RateLimitError,
  PermanentAPIError,
} from "../utils/errors";

const NLM_BASE = "https://clinicaltables.nlm.nih.gov/api";

interface NlmResponse {
  0: number;
  1: string[];
  2: null;
  3: string[][];
}

function classifyError(error: unknown): { error: string; retriable: boolean } {
  if (error instanceof APITimeoutError)
    return { error: error.message, retriable: true };
  if (error instanceof RateLimitError)
    return { error: error.message, retriable: true };
  if (error instanceof PermanentAPIError)
    return { error: error.message, retriable: false };
  if (error instanceof Error) return { error: error.message, retriable: true };
  return { error: String(error), retriable: true };
}

export const hpoTermSearchTool = createTool({
  id: "hpo-term-search",
  description:
    "Search the Human Phenotype Ontology (HPO) for clinical phenotype terms. Returns HPO IDs and term names. Use this to identify standardized phenotype terms for patient symptoms and signs. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Phenotype term to search for (e.g. 'macrocephaly', 'seizure', 'ataxia')",
      ),
    maxResults: z
      .number()
      .min(1)
      .max(20)
      .default(10)
      .describe("Maximum number of results to return"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            hpoId: z.string(),
            name: z.string(),
          }),
        ),
        totalAvailable: z.number().optional(),
        noResults: z.literal(true).optional(),
        message: z.string().optional(),
      }),
    }),
    z.object({
      ok: z.literal(false),
      error: z.string(),
      retriable: z.boolean(),
    }),
  ]),
  execute: async ({ query, maxResults }) => {
    try {
      const url = `${NLM_BASE}/hpo/v3/search?terms=${encodeURIComponent(query)}&maxList=${maxResults}`;
      const data = (await fetchJSON(url, {
        errorPrefix: "NLM HPO",
        ignore404: true,
      })) as unknown as NlmResponse;

      if (!data || !data[3] || data[3].length === 0) {
        return {
          ok: true as const,
          data: {
            results: [],
            noResults: true as const,
            message: "No HPO terms found matching the query.",
          },
        };
      }

      const results = data[3].map((item: string[]) => ({
        hpoId: item[0],
        name: item[1],
      }));

      return { ok: true as const, data: { results, totalAvailable: data[0] } };
    } catch (e) {
      const classified = classifyError(e);
      return {
        ok: false as const,
        error: `HPO term search failed: ${classified.error}`,
        retriable: classified.retriable,
      };
    }
  },
});

export const loincTestLookupTool = createTool({
  id: "loinc-test-lookup",
  description:
    "Search LOINC database for laboratory test codes and names. Returns LOINC codes, component names, and specimen information. Use this to identify or clarify laboratory test codes referenced in patient results. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Lab test name to search for (e.g. 'hemoglobin', 'troponin', 'TSH')",
      ),
    maxResults: z
      .number()
      .min(1)
      .max(20)
      .default(10)
      .describe("Maximum number of results to return"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            loincCode: z.string(),
            componentName: z.string(),
            system: z.string().optional(),
            method: z.string().optional(),
          }),
        ),
        totalAvailable: z.number().optional(),
        noResults: z.literal(true).optional(),
        message: z.string().optional(),
      }),
    }),
    z.object({
      ok: z.literal(false),
      error: z.string(),
      retriable: z.boolean(),
    }),
  ]),
  execute: async ({ query, maxResults }) => {
    try {
      const url = `${NLM_BASE}/loinc_items/v3/search?terms=${encodeURIComponent(query)}&maxList=${maxResults}&df=LOINC_NUM,COMPONENT,SYSTEM,METHOD_TYP`;
      const data = (await fetchJSON(url, {
        errorPrefix: "NLM LOINC",
        ignore404: true,
      })) as unknown as NlmResponse;

      if (!data || !data[3] || data[3].length === 0) {
        return {
          ok: true as const,
          data: {
            results: [],
            noResults: true as const,
            message: "No LOINC tests found matching the query.",
          },
        };
      }

      const results = data[3].map((item: string[]) => ({
        loincCode: item[0] ?? "",
        componentName: item[1] ?? "",
        system: item[2] || undefined,
        method: item[3] || undefined,
      }));

      return { ok: true as const, data: { results, totalAvailable: data[0] } };
    } catch (e) {
      const classified = classifyError(e);
      return {
        ok: false as const,
        error: `LOINC test lookup failed: ${classified.error}`,
        retriable: classified.retriable,
      };
    }
  },
});
