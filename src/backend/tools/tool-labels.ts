export const TOOL_LABELS: Record<string, string> = {
  "pubmed-search": "Searching PubMed",
  "related-articles": "Finding related articles",
  "drug-lookup": "Looking up drug",
  "drug-interaction": "Checking interactions",
  "drug-labeling": "Reviewing FDA label",
  "adverse-events": "Checking adverse events",
  "omim-search": "Searching OMIM",
  "gene-reviews-search": "Searching GeneReviews",
  "clinvar-search": "Searching ClinVar",
  "clinical-trials-search": "Searching clinical trials",
  "drug-recall": "Checking drug recalls",
  "substance-toxicology": "Checking toxicology",
  "medlineplus-search": "Searching MedlinePlus",
  "drug-spelling-suggestion": "Checking drug spelling",
};

export function formatToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || `Running ${toolName}`;
}
