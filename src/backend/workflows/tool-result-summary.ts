import { sanitizeForContext } from "../utils/errors";

const MAX_SUMMARY_LENGTH = 200;

function truncateSummary(text: string): string {
  if (text.length <= MAX_SUMMARY_LENGTH) return text;
  return `${text.slice(0, MAX_SUMMARY_LENGTH - 1)}…`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractStringField(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function extractNumberField(
  obj: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function extractArray(
  obj: Record<string, unknown>,
  key = "results",
): unknown[] | null {
  const value = obj[key];
  return Array.isArray(value) ? value : null;
}

function quantity(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function returnedCount(
  results: unknown[] | null,
  singular: string,
  emptyMessage: string,
  total?: number | null,
  plural = `${singular}s`,
): string | null {
  if (!results) return null;
  if (results.length === 0) return emptyMessage;
  const noun = (total ?? results.length) === 1 ? singular : plural;
  return total !== null && total !== undefined && total >= results.length
    ? `${results.length} of ${total} ${noun} returned`
    : `${quantity(results.length, singular, plural)} returned`;
}

function failureSummary(obj: Record<string, unknown>): string {
  const error = extractStringField(obj, "error", "message", "errorMessage");
  const safeError = sanitizeForContext(error ?? "Tool error", 150);
  if (obj.retriable === true) return `${safeError} (retry may succeed)`;
  if (obj.retriable === false) return `${safeError} (retry not advised)`;
  return safeError;
}

/** Parse JSON-serialized tool results without treating ordinary text as JSON. */
export function normalizeToolResult(result: unknown): unknown {
  if (typeof result !== "string") return result;
  const trimmed = result.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return result;
  try {
    return JSON.parse(trimmed);
  } catch {
    return result;
  }
}

export function summarizeToolResult(
  toolName: string,
  rawResult: unknown,
): string | null {
  if (rawResult === undefined || rawResult === null) return null;

  if (rawResult instanceof Error) {
    return truncateSummary(sanitizeForContext(rawResult.message || "Error"));
  }

  const result = normalizeToolResult(rawResult);
  if (typeof result === "string") {
    return "Tool completed with text output";
  }

  if (Array.isArray(result)) {
    return result.length === 0 ? null : quantity(result.length, "result");
  }

  const resultObject = asRecord(result);
  if (!resultObject) return null;

  if (resultObject.isError === true || resultObject.ok === false) {
    return truncateSummary(failureSummary(resultObject));
  }

  const data =
    resultObject.ok === true && asRecord(resultObject.data)
      ? asRecord(resultObject.data)!
      : resultObject;
  const results = extractArray(data);

  if (data.noResults === true && (!results || results.length === 0)) {
    return truncateSummary(
      extractStringField(data, "message") ?? "No results found",
    );
  }

  let summary: string | null = null;

  switch (toolName) {
    case "drug-lookup": {
      if (extractStringField(data, "name", "rxcui")) {
        summary = "RxNav drug match found";
        break;
      }
      const drugGroup = asRecord(data.drugGroup);
      const conceptGroups = drugGroup
        ? extractArray(drugGroup, "conceptGroup")
        : null;
      const conceptCount =
        conceptGroups?.reduce<number>((count, group) => {
          const properties = asRecord(group)
            ? extractArray(asRecord(group)!, "conceptProperties")
            : null;
          return count + (properties?.length ?? 0);
        }, 0) ?? 0;
      summary =
        conceptCount > 0
          ? `${quantity(conceptCount, "RxNav drug concept")} returned`
          : "No RxNav drug match found";
      break;
    }
    case "drug-interaction": {
      const interactions = extractArray(data, "interactions");
      const coverage = extractStringField(data, "coverage");
      const interactionStatus = extractStringField(data, "interactionStatus");
      const checks = extractArray(data, "checks") ?? [];
      const checkedCount = checks.filter(
        (check) => asRecord(check)?.status === "checked",
      ).length;
      const checkSummary =
        checks.length > 0
          ? `${checkedCount} of ${checks.length} drugs checked`
          : "drug coverage not reported";

      if (interactions) {
        if (interactionStatus === "none_found" && coverage === "complete") {
          summary = `No interactions found in checked FDA labels; ${checkSummary}. Not comprehensive clearance.`;
        } else if (
          interactionStatus === "unknown" ||
          coverage === "unavailable"
        ) {
          summary = `Interaction status unknown; ${checkSummary}. No reliable negative result.`;
        } else if (interactions.length === 0) {
          summary = `No FDA-label findings reported; ${checkSummary}.`;
        } else {
          summary = `${quantity(interactions.length, "FDA-label finding")}; ${checkSummary}${coverage === "partial" ? ". Partial coverage." : "."}`;
        }
      }
      break;
    }
    case "drug-labeling":
      summary = returnedCount(
        results,
        "FDA label record",
        "No FDA labeling information found for this drug.",
      );
      break;
    case "adverse-events": {
      const meta = asRecord(data.meta);
      const count = returnedCount(
        results,
        "FDA adverse-event report",
        "No FDA adverse-event reports found for this drug.",
        meta ? extractNumberField(meta, "totalResults") : null,
      );
      summary = count
        ? `${count}${results && results.length > 0 ? "; reports do not establish causality" : ""}`
        : null;
      break;
    }
    case "food-adverse-events": {
      const count = returnedCount(
        results,
        "FDA food adverse-event report",
        "No FDA food or supplement adverse-event reports found.",
      );
      summary = count
        ? `${count}${results && results.length > 0 ? "; reports do not establish causality" : ""}`
        : null;
      break;
    }
    case "device-adverse-events": {
      const count = returnedCount(
        results,
        "FDA device adverse-event report",
        "No FDA medical-device adverse-event reports found.",
      );
      summary = count
        ? `${count}${results && results.length > 0 ? "; reports do not establish causality" : ""}`
        : null;
      break;
    }
    case "drug-recall":
      summary = returnedCount(
        results,
        "FDA recall record",
        "No FDA recall records found for this drug.",
      );
      break;
    case "substance-toxicology":
      summary = returnedCount(
        results,
        "FDA substance record",
        "No FDA substance records found.",
      );
      break;
    case "drug-shortages":
      summary = returnedCount(
        results,
        "FDA shortage record",
        "No FDA drug-shortage records found.",
      );
      break;
    case "clinical-trials-search":
      summary = returnedCount(
        results,
        "clinical trial",
        "No clinical trials found for this search.",
        extractNumberField(data, "totalCount"),
      );
      break;
    case "medlineplus-search":
      summary = returnedCount(
        results,
        "MedlinePlus topic",
        "No MedlinePlus information found for this condition.",
      );
      break;
    case "drug-spelling-suggestion": {
      const suggestions = extractArray(data, "suggestions");
      summary = suggestions
        ? suggestions.length > 0
          ? quantity(suggestions.length, "spelling suggestion")
          : "No drug-spelling suggestions found"
        : null;
      break;
    }
    case "rare-disease-search":
      summary = returnedCount(
        results,
        "rare disease",
        "No rare diseases found matching the query.",
      );
      break;
    case "rare-disease-genes":
      summary = returnedCount(
        results,
        "associated gene",
        "No associated gene data found for this rare disease.",
      );
      break;
    case "rare-disease-phenotypes":
      summary = returnedCount(
        results,
        "associated phenotype",
        "No associated phenotype data found for this rare disease.",
      );
      break;
    case "hpo-term-search":
      summary = returnedCount(
        results,
        "HPO term",
        "No HPO terms found matching the query.",
        extractNumberField(data, "totalAvailable"),
      );
      break;
    case "loinc-test-lookup":
      summary = returnedCount(
        results,
        "LOINC lab test",
        "No LOINC tests found matching the query.",
        extractNumberField(data, "totalAvailable"),
      );
      break;
  }

  if (summary) return truncateSummary(summary);
  return "Tool completed with structured output";
}
