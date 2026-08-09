import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  APITimeoutError,
  RateLimitError,
  PermanentAPIError,
} from "../utils/errors";
import { fetchText } from "./utils/fetch";

const MEDLINE_BASE = "https://wsearch.nlm.nih.gov/ws/query";

const MAX_RESULTS = 5;

interface MedlinePlusResult {
  title: string;
  summary: string;
  url: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripSpans(s: string): string {
  return s.replace(/<span[^>]*>/g, "").replace(/<\/span>/g, "");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function extractContent(body: string, name: string): string | undefined {
  const match = body.match(
    new RegExp(`<content name="${name}">([\\s\\S]*?)<\\/content>`),
  );
  if (!match?.[1]) return undefined;
  return stripTags(stripSpans(decodeEntities(match[1]))).trim();
}

function parseMedlinePlusXml(xml: string): MedlinePlusResult[] {
  const documents = [
    ...xml.matchAll(/<document[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/document>/g),
  ];

  const results: MedlinePlusResult[] = [];
  for (const [, url, body] of documents) {
    const title = extractContent(body, "title") ?? "";
    const summary =
      extractContent(body, "FullSummary") ??
      extractContent(body, "snippet") ??
      "";
    results.push({ title, summary, url });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
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
    const url = `${MEDLINE_BASE}?db=healthTopics&term=${encodeURIComponent(condition)}&retmax=${MAX_RESULTS}`;

    try {
      const xml = await fetchText(url);
      const results = parseMedlinePlusXml(xml);

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
