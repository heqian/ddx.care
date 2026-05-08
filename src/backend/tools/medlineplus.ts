import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  APITimeoutError,
  RateLimitError,
  PermanentAPIError,
} from "../utils/errors";
import { fetchJSON } from "./utils/fetch";

const MEDLINE_BASE = "https://connect.medlineplus.gov/service";

interface MedlinePlusEntry {
  title?: string | { _value?: string };
  summary?: string | { _value?: string };
  link?: Array<{ href?: string }>;
  id?: string;
}

export const medlinePlusSearchTool = createTool({
  id: "medlineplus-search",
  description:
    "Search MedlinePlus for patient-friendly health information on diseases, conditions, and wellness topics. Returns plain-language summaries of causes, symptoms, diagnosis, and treatment. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    condition: z
      .string()
      .describe(
        "Disease or condition name (e.g. 'diabetes', 'heart failure', 'pneumonia')",
      ),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            title: z.string(),
            summary: z.string(),
            url: z.string().optional(),
          }),
        ),
      }),
    }),
    z.object({
      ok: z.literal(false),
      error: z.string(),
      retriable: z.boolean(),
    }),
  ]),
  execute: async ({ condition }) => {
    const url = `${MEDLINE_BASE}?mainSearchCriteria.v.cs=2.16.840.1.113883.6.103&mainSearchCriteria.v.dn=${encodeURIComponent(condition)}&knowledgeResponseType=application/json`;

    try {
      const data = await fetchJSON(url);

      const entries = data?.feed?.entry ?? [];
      const entryArray = Array.isArray(entries)
        ? entries
        : entries
          ? [entries]
          : [];

      const results = entryArray.map((entry: MedlinePlusEntry) => ({
        title:
          (typeof entry.title === "object"
            ? entry.title?._value
            : entry.title) ?? "",
        summary:
          (typeof entry.summary === "object"
            ? entry.summary?._value
            : entry.summary) ?? "",
        url: entry.link?.[0]?.href ?? entry.id ?? undefined,
      }));

      if (results.length > 0) {
        return { ok: true as const, data: { results } };
      }

      return {
        ok: false as const,
        error: "No information found for this condition.",
        retriable: true,
      };
    } catch (error: unknown) {
      if (error instanceof APITimeoutError) {
        return { ok: false as const, error: error.message, retriable: true };
      }
      if (error instanceof RateLimitError) {
        return { ok: false as const, error: error.message, retriable: true };
      }
      if (error instanceof PermanentAPIError) {
        return { ok: false as const, error: error.message, retriable: false };
      }
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
        retriable: true,
      };
    }
  },
});
