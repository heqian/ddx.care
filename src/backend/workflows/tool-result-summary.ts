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

  let obj = result as Record<string, unknown>;

  if (Array.isArray(obj)) {
    if (obj.length === 0) return null;
    return truncateSummary(
      `${obj.length} result${obj.length === 1 ? "" : "s"}`,
    );
  }

  if (obj.ok === false) {
    const message = extractStringField(obj, "error") ?? "Tool error";
    const retry = obj.retriable === true ? "retriable" : "not retriable";
    return truncateSummary(`${message} (${retry})`);
  }

  if (
    obj.ok === true &&
    typeof obj.data === "object" &&
    obj.data !== null &&
    !Array.isArray(obj.data)
  ) {
    obj = obj.data as Record<string, unknown>;
  }

  // A `noResults: true` marker indicates the API call succeeded but the
  // source had no records for this query. Surface the tool's human-readable
  // message (e.g. "No MedlinePlus information found for this condition.") so
  // the agent and UI log convey why data is missing — without this, the
  // tool-specific count branches below would print "0 results".
  if (obj.noResults === true) {
    const message = extractStringField(obj, "message");
    if (message) return truncateSummary(message);
    return truncateSummary("No results found");
  }

  switch (toolName) {
    case "drug-interaction": {
      const interactions = obj.interactions;
      const coverage = extractStringField(obj, "coverage");
      const interactionStatus = extractStringField(obj, "interactionStatus");
      const checks = Array.isArray(obj.checks) ? obj.checks : [];
      const checkedCount = checks.filter(
        (check) =>
          typeof check === "object" &&
          check !== null &&
          (check as Record<string, unknown>).status === "checked",
      ).length;
      const coverageSummary = coverage
        ? `${coverage} coverage${checks.length > 0 ? `; ${checkedCount} of ${checks.length} drugs checked` : ""}`
        : "coverage not reported";

      if (Array.isArray(interactions)) {
        if (interactionStatus === "none_found" && coverage === "complete") {
          return truncateSummary(
            `No interactions found in checked FDA labels (${coverageSummary}; not comprehensive clearance)`,
          );
        }
        if (interactionStatus === "unknown" || coverage === "unavailable") {
          return truncateSummary(
            `Unknown interaction result (${coverageSummary}); no reliable negative result`,
          );
        }
        if (interactions.length === 0) {
          return truncateSummary(
            `Interaction result has no findings (${coverageSummary})`,
          );
        }
        return truncateSummary(
          `${interactions.length} interaction${interactions.length === 1 ? "" : "s"} found (${coverageSummary})`,
        );
      }
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
      const results = obj.results;
      if (Array.isArray(results)) {
        return truncateSummary(
          `${results.length} topic${results.length === 1 ? "" : "s"}`,
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
