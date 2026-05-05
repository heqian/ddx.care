import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJSON } from "./utils/fetch";

const NLM_BASE = "https://clinicaltables.nlm.nih.gov/api";

interface NlmResponse {
  0: number;
  1: string[];
  2: null;
  3: string[][];
}

export const hpoTermSearchTool = createTool({
  id: "hpo-term-search",
  description:
    "Search the Human Phenotype Ontology (HPO) for clinical phenotype terms. Returns HPO IDs and term names. Use this to identify standardized phenotype terms for patient symptoms and signs.",
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
  outputSchema: z.object({
    results: z.array(
      z.object({
        hpoId: z.string(),
        name: z.string(),
      }),
    ),
    totalAvailable: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ query, maxResults }) => {
    try {
      const url = `${NLM_BASE}/hpo/v3/search?terms=${encodeURIComponent(query)}&maxList=${maxResults}`;
      const data = (await fetchJSON(url, {
        errorPrefix: "NLM HPO",
        ignore404: true,
      })) as unknown as NlmResponse;

      if (!data || !data[3] || data[3].length === 0) {
        return { results: [], error: "No HPO terms found matching the query." };
      }

      const results = data[3].map((item: string[]) => ({
        hpoId: item[0],
        name: item[1],
      }));

      return { results, totalAvailable: data[0] };
    } catch {
      return { results: [], error: "Failed to search HPO terms." };
    }
  },
});

export const loincTestLookupTool = createTool({
  id: "loinc-test-lookup",
  description:
    "Search LOINC database for laboratory test codes and names. Returns LOINC codes, component names, and specimen information. Use this to identify or clarify laboratory test codes referenced in patient results.",
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
  outputSchema: z.object({
    results: z.array(
      z.object({
        loincCode: z.string(),
        componentName: z.string(),
        system: z.string().optional(),
        method: z.string().optional(),
      }),
    ),
    totalAvailable: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ query, maxResults }) => {
    try {
      const url = `${NLM_BASE}/loinc_items/v3/search?terms=${encodeURIComponent(query)}&maxList=${maxResults}&df=LOINC_NUM,COMPONENT,SYSTEM,METHOD_TYP`;
      const data = (await fetchJSON(url, {
        errorPrefix: "NLM LOINC",
        ignore404: true,
      })) as unknown as NlmResponse;

      if (!data || !data[3] || data[3].length === 0) {
        return {
          results: [],
          error: "No LOINC tests found matching the query.",
        };
      }

      const results = data[3].map((item: string[]) => ({
        loincCode: item[0] ?? "",
        componentName: item[1] ?? "",
        system: item[2] || undefined,
        method: item[3] || undefined,
      }));

      return { results, totalAvailable: data[0] };
    } catch {
      return { results: [], error: "Failed to search LOINC tests." };
    }
  },
});
