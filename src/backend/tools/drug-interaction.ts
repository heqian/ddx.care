import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJSON as baseFetchJSON } from "./utils/fetch";
import type { ToolResult } from "./utils/types";
import {
  APITimeoutError,
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
export const FDA_LABEL_LIMITATION =
  "FDA label-text matching is supporting evidence only. Absence of a literal drug mention is not proof that no interaction exists and is not comprehensive clinical clearance.";

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

export const interactionStatusSchema = z.enum([
  "found",
  "none_found",
  "unknown",
]);

export const interactionCoverageSchema = z.enum([
  "complete",
  "partial",
  "unavailable",
]);

export const drugInteractionCheckSchema = z.discriminatedUnion("status", [
  z.object({
    input: z.string(),
    resolvedName: z.string(),
    status: z.literal("checked"),
  }),
  z.object({
    input: z.string(),
    status: z.literal("unresolved"),
    errorCode: z.literal("drug_not_resolved"),
  }),
  z.object({
    input: z.string(),
    resolvedName: z.string().optional(),
    status: z.literal("failed"),
    errorCode: z.enum([
      "rxnav_unavailable",
      "rxnav_rate_limited",
      "rxnav_timeout",
      "openfda_unavailable",
      "openfda_rate_limited",
      "openfda_timeout",
      "label_not_found",
    ]),
  }),
]);

export const interactionSourceSchema = z.object({
  name: z.literal("OpenFDA Drug Labels"),
  limitation: z.literal(FDA_LABEL_LIMITATION),
});

const interactionSchema = z.object({
  drug: z.string(),
  interactsWith: z.string(),
  severity: z.string().optional(),
  description: z.string().optional(),
  source: z.string().optional(),
});

export const drugInteractionDataSchema = z
  .object({
    interactionStatus: interactionStatusSchema,
    coverage: interactionCoverageSchema,
    checks: z.array(drugInteractionCheckSchema).min(2),
    interactions: z.array(interactionSchema),
    source: interactionSourceSchema,
  })
  .superRefine((data, context) => {
    const checkedCount = data.checks.filter(
      (check) => check.status === "checked",
    ).length;
    const expectedCoverage =
      checkedCount === data.checks.length
        ? "complete"
        : checkedCount === 0
          ? "unavailable"
          : "partial";

    if (data.coverage !== expectedCoverage) {
      context.addIssue({
        code: "custom",
        path: ["coverage"],
        message: `Coverage must be ${expectedCoverage} for this check ledger`,
      });
    }

    const expectedStatus =
      data.interactions.length > 0
        ? "found"
        : data.coverage === "complete"
          ? "none_found"
          : "unknown";

    if (data.interactionStatus !== expectedStatus) {
      context.addIssue({
        code: "custom",
        path: ["interactionStatus"],
        message: `Interaction status must be ${expectedStatus} for these findings and coverage`,
      });
    }
  });

export type DrugInteractionData = z.infer<typeof drugInteractionDataSchema>;
type DrugInteractionCheck = z.infer<typeof drugInteractionCheckSchema>;

type DrugIdentityOutcome =
  | { status: "resolved"; rxcui: string; resolvedName: string }
  | { status: "unresolved" }
  | {
      status: "failed";
      errorCode: "rxnav_unavailable" | "rxnav_rate_limited" | "rxnav_timeout";
    };

type LabelOutcome =
  | { status: "checked"; label: FdaLabelResult }
  | {
      status: "failed";
      errorCode:
        | "openfda_unavailable"
        | "openfda_rate_limited"
        | "openfda_timeout"
        | "label_not_found";
    };

function sourceErrorCode(
  source: "rxnav",
  error: unknown,
): "rxnav_unavailable" | "rxnav_rate_limited" | "rxnav_timeout";
function sourceErrorCode(
  source: "openfda",
  error: unknown,
): "openfda_unavailable" | "openfda_rate_limited" | "openfda_timeout";
function sourceErrorCode(
  source: "rxnav" | "openfda",
  error: unknown,
):
  | "rxnav_unavailable"
  | "rxnav_rate_limited"
  | "rxnav_timeout"
  | "openfda_unavailable"
  | "openfda_rate_limited"
  | "openfda_timeout" {
  if (error instanceof APITimeoutError) return `${source}_timeout`;
  if (error instanceof RateLimitError) return `${source}_rate_limited`;
  return `${source}_unavailable`;
}

async function lookupDrugIdentity(
  drugName: string,
): Promise<DrugIdentityOutcome> {
  try {
    const url = `${RXNAV_BASE}/drugs.json?name=${encodeURIComponent(drugName)}`;
    const result = await baseFetchJSON(url, { errorPrefix: "RxNav API" });
    const drugGroup: RxNavDrugGroup | undefined = result?.drugGroup;
    if (drugGroup?.conceptGroup) {
      for (const cg of drugGroup.conceptGroup) {
        if (cg.conceptProperties?.length) {
          for (const cp of cg.conceptProperties) {
            if (cp.rxcui) {
              return {
                status: "resolved",
                rxcui: cp.rxcui,
                resolvedName: cp.name || drugName,
              };
            }
          }
        }
      }
    }
    return { status: "unresolved" };
  } catch (error) {
    return { status: "failed", errorCode: sourceErrorCode("rxnav", error) };
  }
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

async function fetchDrugLabel(rxcui: string): Promise<LabelOutcome> {
  try {
    const url = `${FDA_BASE}/drug/label.json?search=openfda.rxcui:${rxcui}&limit=1`;
    const result = await baseFetchJSON(url, {
      errorPrefix: "OpenFDA API",
      ignore404: true,
    });
    const label: FdaLabelResult | undefined = result?.results?.[0];
    return label
      ? { status: "checked", label }
      : { status: "failed", errorCode: "label_not_found" };
  } catch (error) {
    return { status: "failed", errorCode: sourceErrorCode("openfda", error) };
  }
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
    "Check drug-drug interactions between two or more medications using literal matches in FDA label text. Returns interactionStatus (found, none_found, or unknown), aggregate coverage (complete, partial, or unavailable), one check ledger entry per input, findings, and a source limitation. none_found is only valid with complete coverage; an empty findings array with incomplete coverage is unknown. FDA label matching is supporting evidence, not comprehensive interaction clearance. On internal failure, returns { ok: false, error: string, retriable: boolean }.",
  inputSchema: z.object({
    drugNames: z
      .array(z.string().max(100))
      .min(2)
      .max(10)
      .describe(
        "Array of drug names to check for interactions (2–10). Use generic names for best results (e.g. ['aspirin', 'warfarin']).",
      ),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: drugInteractionDataSchema,
    }),
    errorResultSchema,
  ]),
  execute: async ({ drugNames }): Promise<ToolResult<DrugInteractionData>> => {
    try {
      const interactions: DrugInteractionData["interactions"] = [];
      const identityCache = new Map<string, Promise<DrugIdentityOutcome>>();
      const lookupIdentityMemoized = async (
        drugName: string,
      ): Promise<DrugIdentityOutcome> => {
        const key = drugName.toLowerCase();
        const cached = identityCache.get(key);
        if (cached) return cached;
        const identity = lookupDrugIdentity(drugName);
        identityCache.set(key, identity);
        return identity;
      };

      const identities = await Promise.all(
        drugNames.map((drugName) => lookupIdentityMemoized(drugName)),
      );
      const labelCache = new Map<string, Promise<LabelOutcome>>();
      const labels = await Promise.all(
        identities.map(async (identity) => {
          if (identity.status !== "resolved") return null;
          const cached = labelCache.get(identity.rxcui);
          if (cached) return cached;
          const outcome = fetchDrugLabel(identity.rxcui);
          labelCache.set(identity.rxcui, outcome);
          return outcome;
        }),
      );

      const checks: DrugInteractionCheck[] = drugNames.map(
        (drugName, index) => {
          const identity = identities[index];
          if (identity.status === "unresolved") {
            return {
              input: drugName,
              status: "unresolved",
              errorCode: "drug_not_resolved",
            };
          }
          if (identity.status === "failed") {
            return {
              input: drugName,
              status: "failed",
              errorCode: identity.errorCode,
            };
          }
          const label = labels[index];
          if (!label || label.status === "failed") {
            return {
              input: drugName,
              resolvedName: identity.resolvedName,
              status: "failed",
              errorCode: label?.errorCode ?? "openfda_unavailable",
            };
          }
          return {
            input: drugName,
            resolvedName: identity.resolvedName,
            status: "checked",
          };
        },
      );

      for (let index = 0; index < drugNames.length; index++) {
        const drugName = drugNames[index];
        const labelOutcome = labels[index];
        if (!labelOutcome || labelOutcome.status !== "checked") continue;
        const label = labelOutcome.label;

        const interactionText = label.drug_interactions?.join(" ") ?? "";
        const contraindicationText = label.contraindications?.join(" ") ?? "";
        const warningText = label.warnings?.join(" ") ?? "";
        const boxedWarningText = label.boxed_warning?.join(" ") ?? "";

        const combinedText = `${interactionText} ${boxedWarningText}`.trim();
        const contraindicationOnly = contraindicationText;
        const warningOnly = warningText;

        for (let otherIndex = 0; otherIndex < drugNames.length; otherIndex++) {
          if (otherIndex === index) continue;
          const otherDrug = drugNames[otherIndex];
          const otherLower = otherDrug.toLowerCase();
          const otherVariants = [otherLower];
          const otherIdentity = identities[otherIndex];
          if (otherIdentity.status === "resolved") {
            otherVariants.push(
              otherIdentity.rxcui,
              otherIdentity.resolvedName.toLowerCase(),
            );
          }

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

      const checkedCount = checks.filter(
        (check) => check.status === "checked",
      ).length;
      const coverage =
        checkedCount === checks.length
          ? ("complete" as const)
          : checkedCount === 0
            ? ("unavailable" as const)
            : ("partial" as const);
      const interactionStatus =
        deduped.length > 0
          ? ("found" as const)
          : coverage === "complete"
            ? ("none_found" as const)
            : ("unknown" as const);

      return {
        ok: true as const,
        data: {
          interactionStatus,
          coverage,
          checks,
          interactions: deduped,
          source: {
            name: "OpenFDA Drug Labels",
            limitation: FDA_LABEL_LIMITATION,
          },
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
