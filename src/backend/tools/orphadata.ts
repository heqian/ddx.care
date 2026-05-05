import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  searchDiseases,
  getDiseaseGenes,
  getDiseasePhenotypes,
} from "../orphadata-cache";

export const rareDiseaseSearchTool = createTool({
  id: "rare-disease-search",
  description:
    "Search Orphanet rare disease database for rare conditions by name. Returns ORPHAcodes and disease names. Use this when considering rare or genetic diseases in the differential diagnosis.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Disease name or partial name to search for (e.g. 'epidermolysis', 'Marfan')",
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
        orphacode: z.number(),
        name: z.string(),
      }),
    ),
    error: z.string().optional(),
  }),
  execute: async ({ query, maxResults }) => {
    try {
      const diseases = searchDiseases(query, maxResults ?? 10);
      if (diseases.length === 0) {
        return {
          results: [],
          error: "No rare diseases found matching the query.",
        };
      }
      return { results: diseases };
    } catch {
      return { results: [], error: "Failed to search rare disease database." };
    }
  },
});

export const rareDiseaseGenesTool = createTool({
  id: "rare-disease-genes",
  description:
    "Look up genes associated with a specific rare disease by its ORPHAcode. Returns gene symbols, full names, and association types. Useful for genetic counseling and identifying hereditary patterns.",
  inputSchema: z.object({
    orphacode: z
      .number()
      .describe(
        "The ORPHAcode of the rare disease (e.g. 58 for Alexander disease)",
      ),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        geneSymbol: z.string(),
        geneName: z.string(),
        associationType: z.string(),
        source: z.string().nullable().optional(),
      }),
    ),
    error: z.string().optional(),
  }),
  execute: async ({ orphacode }) => {
    try {
      const genes = await getDiseaseGenes(orphacode);
      if (genes.length === 0) {
        return {
          results: [],
          error: `No gene data found for ORPHAcode ${orphacode}. The disease may not have associated genes in the database.`,
        };
      }
      return { results: genes };
    } catch {
      return { results: [], error: "Failed to fetch gene data." };
    }
  },
});

export const rareDiseasePhenotypesTool = createTool({
  id: "rare-disease-phenotypes",
  description:
    "Look up HPO phenotypes (clinical signs and symptoms) associated with a specific rare disease by its ORPHAcode. Returns HPO IDs, phenotype names, and frequency information. Useful for matching patient symptoms to rare diseases.",
  inputSchema: z.object({
    orphacode: z
      .number()
      .describe(
        "The ORPHAcode of the rare disease (e.g. 58 for Alexander disease)",
      ),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        hpoId: z.string(),
        phenotypeName: z.string(),
        frequency: z.string().nullable().optional(),
      }),
    ),
    error: z.string().optional(),
  }),
  execute: async ({ orphacode }) => {
    try {
      const phenotypes = await getDiseasePhenotypes(orphacode);
      if (phenotypes.length === 0) {
        return {
          results: [],
          error: `No phenotype data found for ORPHAcode ${orphacode}. The disease may not have associated phenotypes in the database.`,
        };
      }
      return { results: phenotypes };
    } catch {
      return { results: [], error: "Failed to fetch phenotype data." };
    }
  },
});
