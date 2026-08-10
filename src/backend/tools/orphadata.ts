import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  searchDiseases,
  getDiseaseGenes,
  getDiseasePhenotypes,
} from "../orphadata-cache";
import type { ToolResult } from "./utils/types";

export const rareDiseaseSearchTool = createTool({
  id: "rare-disease-search",
  description:
    "Search Orphanet rare disease database for rare conditions by name. Returns ORPHAcodes and disease names. Use this when considering rare or genetic diseases in the differential diagnosis. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
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
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            orphacode: z.number(),
            name: z.string(),
          }),
        ),
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
  execute: async ({
    query,
    maxResults,
  }): Promise<
    ToolResult<{
      results: Array<{ orphacode: number; name: string }>;
      noResults?: true;
      message?: string;
    }>
  > => {
    try {
      const diseases = searchDiseases(query, maxResults ?? 10);
      if (diseases.length === 0) {
        return {
          ok: true as const,
          data: {
            results: [],
            noResults: true as const,
            message: "No rare diseases found matching the query.",
          },
        };
      }
      return { ok: true as const, data: { results: diseases } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false as const,
        error: `Failed to search rare disease database: ${msg}`,
        retriable: true,
      };
    }
  },
});

export const rareDiseaseGenesTool = createTool({
  id: "rare-disease-genes",
  description:
    "Look up genes associated with a specific rare disease by its ORPHAcode. You MUST use rare-disease-search first to obtain the ORPHAcode — do not guess or hardcode ORPHAcodes. Returns gene symbols, full names, and association types. Useful for genetic counseling and identifying hereditary patterns. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    orphacode: z
      .number()
      .describe(
        "The ORPHAcode of the rare disease. Obtain this from rare-disease-search first — do not guess.",
      ),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            geneSymbol: z.string(),
            geneName: z.string(),
            associationType: z.string(),
            source: z.string().nullable().optional(),
          }),
        ),
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
  execute: async ({
    orphacode,
  }): Promise<
    ToolResult<{
      results: Array<{
        geneSymbol: string;
        geneName: string;
        associationType: string;
        source?: string | null;
      }>;
      noResults?: true;
      message?: string;
    }>
  > => {
    try {
      const genes = await getDiseaseGenes(orphacode);
      if (genes.length === 0) {
        return {
          ok: true as const,
          data: {
            results: [],
            noResults: true as const,
            message: `No gene data found for ORPHAcode ${orphacode}. The disease may not have associated genes in the database.`,
          },
        };
      }
      return { ok: true as const, data: { results: genes } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false as const,
        error: `Failed to fetch gene data: ${msg}`,
        retriable: true,
      };
    }
  },
});

export const rareDiseasePhenotypesTool = createTool({
  id: "rare-disease-phenotypes",
  description:
    "Look up HPO phenotypes (clinical signs and symptoms) associated with a specific rare disease by its ORPHAcode. You MUST use rare-disease-search first to obtain the ORPHAcode — do not guess or hardcode ORPHAcodes. Returns HPO IDs, phenotype names, and frequency information. Useful for matching patient symptoms to rare diseases. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    orphacode: z
      .number()
      .describe(
        "The ORPHAcode of the rare disease. Obtain this from rare-disease-search first — do not guess.",
      ),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            hpoId: z.string(),
            phenotypeName: z.string(),
            frequency: z.string().nullable().optional(),
          }),
        ),
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
  execute: async ({
    orphacode,
  }): Promise<
    ToolResult<{
      results: Array<{
        hpoId: string;
        phenotypeName: string;
        frequency?: string | null;
      }>;
      noResults?: true;
      message?: string;
    }>
  > => {
    try {
      const phenotypes = await getDiseasePhenotypes(orphacode);
      if (phenotypes.length === 0) {
        return {
          ok: true as const,
          data: {
            results: [],
            noResults: true as const,
            message: `No phenotype data found for ORPHAcode ${orphacode}. The disease may not have associated phenotypes in the database.`,
          },
        };
      }
      return { ok: true as const, data: { results: phenotypes } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false as const,
        error: `Failed to fetch phenotype data: ${msg}`,
        retriable: true,
      };
    }
  },
});
