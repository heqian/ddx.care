const MAX_SUMMARY_LENGTH = 200;

function truncateSummary(text: string): string {
  if (text.length <= MAX_SUMMARY_LENGTH) return text;
  return text.slice(0, MAX_SUMMARY_LENGTH) + "…";
}

function extractStringField(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.length > 0) return val;
  }
  return null;
}

function extractNumberField(
  obj: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "number") return val;
  }
  return null;
}

export function summarizeToolResult(
  toolName: string,
  result: unknown,
): string | null {
  if (result === undefined || result === null) return null;

  if (result instanceof Error) {
    return truncateSummary(result.message || "Error");
  }

  const isErrorObject =
    typeof result === "object" &&
    result !== null &&
    "isError" in result &&
    (result as Record<string, unknown>).isError === true;

  if (isErrorObject) {
    const errorObj = result as Record<string, unknown>;
    const errMsg =
      extractStringField(errorObj, "error", "message", "errorMessage") ||
      "Tool error";
    return truncateSummary(errMsg);
  }

  if (typeof result === "string") {
    return result.length > 0 ? truncateSummary(result) : null;
  }

  if (!Array.isArray(result) && typeof result !== "object") {
    return null;
  }

  const obj = result as Record<string, unknown>;

  if (Array.isArray(obj)) {
    if (obj.length === 0) return null;
    return truncateSummary(
      `${obj.length} result${obj.length === 1 ? "" : "s"}`,
    );
  }

  switch (toolName) {
    case "drug-interaction": {
      const interactions = obj.interactions;
      if (Array.isArray(interactions)) {
        if (interactions.length === 0) return "No interactions found";
        return truncateSummary(
          `${interactions.length} interaction${interactions.length === 1 ? "" : "s"} found`,
        );
      }
      if (obj.noInteractionsFound) return "No interactions found";
      break;
    }
    case "drug-lookup": {
      const name = extractStringField(obj, "name", "drugName");
      if (name) return truncateSummary(`Drug: ${name}`);
      break;
    }
    case "drug-labeling": {
      const brand = extractStringField(obj, "brandName", "drugName");
      if (brand) return truncateSummary(`Label found for ${brand}`);
      break;
    }
    case "adverse-events":
    case "food-adverse-events":
    case "device-adverse-events": {
      const count = extractNumberField(obj, "totalResults", "count");
      if (count !== null) {
        return truncateSummary(
          `${count} adverse event${count === 1 ? "" : "s"}`,
        );
      }
      break;
    }
    case "drug-recall": {
      const count = extractNumberField(obj, "totalResults", "count");
      if (count !== null) {
        return truncateSummary(`${count} recall${count === 1 ? "" : "s"}`);
      }
      break;
    }
    case "drug-shortages": {
      const count = extractNumberField(obj, "totalResults", "count");
      if (count !== null) {
        return truncateSummary(`${count} shortage${count === 1 ? "" : "s"}`);
      }
      break;
    }
    case "substance-toxicology": {
      const name = extractStringField(obj, "substanceName", "name");
      if (name) return truncateSummary(`Toxicology data for ${name}`);
      break;
    }
    case "clinical-trials-search": {
      const count = extractNumberField(obj, "totalResults", "count");
      if (count !== null) {
        return truncateSummary(`${count} trial${count === 1 ? "" : "s"} found`);
      }
      break;
    }
    case "medlineplus-search": {
      const topics = obj.topics;
      if (Array.isArray(topics)) {
        return truncateSummary(
          `${topics.length} topic${topics.length === 1 ? "" : "s"}`,
        );
      }
      break;
    }
    case "rare-disease-search": {
      const results = obj.results;
      if (Array.isArray(results)) {
        return truncateSummary(
          `${results.length} rare disease${results.length === 1 ? "" : "s"}`,
        );
      }
      break;
    }
    case "rare-disease-genes": {
      const genes = obj.genes;
      if (Array.isArray(genes)) {
        return truncateSummary(
          `${genes.length} gene${genes.length === 1 ? "" : "s"}`,
        );
      }
      break;
    }
    case "rare-disease-phenotypes": {
      const phenotypes = obj.phenotypes;
      if (Array.isArray(phenotypes)) {
        return truncateSummary(
          `${phenotypes.length} phenotype${phenotypes.length === 1 ? "" : "s"}`,
        );
      }
      break;
    }
    case "hpo-term-search": {
      const terms = obj.terms;
      if (Array.isArray(terms)) {
        return truncateSummary(
          `${terms.length} HPO term${terms.length === 1 ? "" : "s"}`,
        );
      }
      break;
    }
    case "loinc-test-lookup": {
      const results = obj.results;
      if (Array.isArray(results)) {
        return truncateSummary(
          `${results.length} lab test${results.length === 1 ? "" : "s"}`,
        );
      }
      break;
    }
    case "drug-spelling-suggestion": {
      const suggestions = obj.suggestions;
      if (Array.isArray(suggestions)) {
        return truncateSummary(
          `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}`,
        );
      }
      break;
    }
  }

  try {
    const json = JSON.stringify(obj);
    return json.length > 0 ? truncateSummary(json) : null;
  } catch {
    return null;
  }
}
