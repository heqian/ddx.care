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

interface RxNavConceptProperty {
  rxcui: string;
  name: string;
  synonym?: string;
  tty: string;
}

interface RxNavConceptGroup {
  tty: string;
  conceptProperties?: RxNavConceptProperty[];
}

interface RxNavDrugGroup {
  name?: string;
  conceptGroup?: RxNavConceptGroup[];
}

const RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST";
const FDA_BASE = "https://api.fda.gov";

async function fetchJSON(
  url: string,
  options?: Parameters<typeof baseFetchJSON>[1],
) {
  return baseFetchJSON(url, { errorPrefix: "RxNav API", ...options });
}

const errorResultSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  retriable: z.boolean(),
});

function toErrorResult(error: unknown): ToolResult<never> {
  const message = error instanceof Error ? error.message : "Unknown API error";
  return {
    ok: false as const,
    error: message,
    retriable: isRetriableError(error),
  };
}

async function lookupRxcui(drugName: string): Promise<string | undefined> {
  try {
    const url = `${RXNAV_BASE}/drugs.json?name=${encodeURIComponent(drugName)}`;
    const result = await baseFetchJSON(url, { errorPrefix: "RxNav API" });
    const drugGroup: RxNavDrugGroup | undefined = result?.drugGroup;
    if (drugGroup?.conceptGroup) {
      for (const cg of drugGroup.conceptGroup) {
        if (cg.conceptProperties?.length) {
          for (const cp of cg.conceptProperties) {
            if (cp.rxcui) return cp.rxcui;
          }
        }
      }
    }
  } catch {
    // RxCUI lookup is best-effort; fall back to name-based search
  }
  return undefined;
}

interface FdaLabelResult {
  id?: string;
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
  };
  drug_interactions?: string[];
  contraindications?: string[];
  warnings?: string[];
  boxed_warning?: string[];
}

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

export const drugInteractionTool = createTool({
  id: "drug-interaction",
  description:
    "Check drug-drug interactions between two or more medications by searching FDA drug labeling data. Provide drug names (generic or brand). Returns interaction details including severity and descriptions from official FDA labels. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    drugNames: z
      .array(z.string())
      .min(2)
      .describe(
        "Array of drug names to check for interactions (at least 2). Use generic names for best results (e.g. ['aspirin', 'warfarin']).",
      ),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        interactions: z.array(
          z.object({
            drug: z.string(),
            interactsWith: z.string(),
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
    drugNames,
  }): Promise<
    ToolResult<{
      interactions: Array<{
        drug: string;
        interactsWith: string;
        severity?: string;
        description?: string;
        source?: string;
      }>;
      noInteractionsFound?: boolean;
    }>
  > => {
    try {
      const interactions: Array<{
        drug: string;
        interactsWith: string;
        severity?: string;
        description?: string;
        source?: string;
      }> = [];

      const labelCache = new Map<string, FdaLabelResult | null>();

      for (const drugName of drugNames) {
        const rxcui = await lookupRxcui(drugName);

        let labelUrl: string;
        if (rxcui) {
          labelUrl = `${FDA_BASE}/drug/label.json?search=openfda.rxcui:${rxcui}&limit=1`;
        } else {
          labelUrl = `${FDA_BASE}/drug/label.json?search=openfda.generic_name:${encodeURIComponent(drugName)}+openfda.brand_name:${encodeURIComponent(drugName)}&limit=1`;
        }

        let label: FdaLabelResult | null;
        if (labelCache.has(drugName.toLowerCase())) {
          label = labelCache.get(drugName.toLowerCase()) ?? null;
        } else {
          try {
            const result = await baseFetchJSON(labelUrl, {
              errorPrefix: "OpenFDA API",
              ignore404: true,
            });
            const first = result?.results?.[0];
            label = first ?? null;
          } catch {
            label = null;
          }
          labelCache.set(drugName.toLowerCase(), label);
        }

        if (!label) continue;

        const interactionText = label.drug_interactions?.join(" ") ?? "";
        const contraindicationText = label.contraindications?.join(" ") ?? "";
        const warningText = label.warnings?.join(" ") ?? "";
        const boxedWarningText = label.boxed_warning?.join(" ") ?? "";

        const combinedText = `${interactionText} ${boxedWarningText}`.trim();
        const contraindicationOnly = contraindicationText;
        const warningOnly = warningText;

        const otherDrugs = drugNames.filter(
          (n) => n.toLowerCase() !== drugName.toLowerCase(),
        );

        for (const otherDrug of otherDrugs) {
          const otherLower = otherDrug.toLowerCase();
          const otherVariants = [otherLower];
          const otherRxcui = await lookupRxcui(otherDrug);
          if (otherRxcui) otherVariants.push(otherRxcui);

          let matched = false;

          if (combinedText) {
            for (const variant of otherVariants) {
              const regex = new RegExp(`\\b${escapeRegex(variant)}\\b`, "i");
              if (regex.test(combinedText)) {
                const snippet = extractSnippet(combinedText, variant, 300);
                let severity: string | undefined;
                if (boxedWarningText && regex.test(boxedWarningText)) {
                  severity = "severe";
                } else if (
                  contraindicationOnly &&
                  regex.test(contraindicationOnly)
                ) {
                  severity = "contraindicated";
                } else if (warningOnly && regex.test(warningOnly)) {
                  severity = "moderate";
                }
                interactions.push({
                  drug: drugName,
                  interactsWith: otherDrug,
                  severity,
                  description: snippet,
                  source: "FDA Drug Label",
                });
                matched = true;
                break;
              }
            }
          }

          if (!matched && contraindicationOnly) {
            for (const variant of otherVariants) {
              const regex = new RegExp(`\\b${escapeRegex(variant)}\\b`, "i");
              if (regex.test(contraindicationOnly)) {
                const snippet = extractSnippet(
                  contraindicationOnly,
                  variant,
                  300,
                );
                interactions.push({
                  drug: drugName,
                  interactsWith: otherDrug,
                  severity: "contraindicated",
                  description: snippet,
                  source: "FDA Drug Label (Contraindications)",
                });
                break;
              }
            }
          }
        }
      }

      // Deduplicate: if drug A mentions drug B and drug B mentions drug A, keep both but don't duplicate exact pairs
      const seen = new Set<string>();
      const deduped = interactions.filter((i) => {
        const key = [i.drug.toLowerCase(), i.interactsWith.toLowerCase()]
          .sort()
          .join("|");
        const detailKey = `${key}:${i.severity ?? "none"}:${(i.description ?? "").slice(0, 50)}`;
        if (seen.has(detailKey)) return false;
        seen.add(detailKey);
        return true;
      });

      return {
        ok: true as const,
        data: {
          interactions: deduped,
          noInteractionsFound: deduped.length === 0,
        },
      };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSnippet(
  text: string,
  searchTerm: string,
  maxLength: number,
): string {
  const idx = text.toLowerCase().indexOf(searchTerm.toLowerCase());
  if (idx === -1) return text.slice(0, maxLength);
  const start = Math.max(0, idx - Math.floor(maxLength / 2));
  const end = Math.min(text.length, start + maxLength);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";
  return snippet;
}

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
