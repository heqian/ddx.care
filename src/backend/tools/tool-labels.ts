export const TOOL_LABELS: Record<string, string> = {
  "drug-lookup": "Looking up drug",
  "drug-interaction": "Checking interactions",
  "drug-labeling": "Reviewing FDA label",
  "adverse-events": "Checking adverse events",
  "clinical-trials-search": "Searching clinical trials",
  "drug-recall": "Checking drug recalls",
  "substance-toxicology": "Checking toxicology",
  "medlineplus-search": "Searching MedlinePlus",
  "drug-spelling-suggestion": "Checking drug spelling",
  "rare-disease-search": "Searching rare diseases",
  "rare-disease-genes": "Looking up disease genes",
  "rare-disease-phenotypes": "Retrieving disease phenotypes",
  "hpo-term-search": "Searching phenotype terms",
  "loinc-test-lookup": "Looking up lab test",
  "drug-shortages": "Checking drug shortages",
  "food-adverse-events": "Searching food adverse events",
  "device-adverse-events": "Searching device adverse events",
};

export function formatToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || `Running ${toolName}`;
}
