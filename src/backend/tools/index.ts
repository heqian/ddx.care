import type { ToolsInput } from "@mastra/core/agent";

// PubMed / NCBI E-utilities
export {
  pubmedSearchTool,
  relatedArticlesTool,
  omimSearchTool,
  geneReviewsSearchTool,
  clinVarSearchTool,
} from "./pubmed-search";

// Drug interactions (RxNav)
export {
  drugLookupTool,
  drugInteractionTool,
  drugSpellingTool,
} from "./drug-interaction";

// FDA drug safety (OpenFDA)
export {
  adverseEventsTool,
  drugLabelingTool,
  drugRecallTool,
  substanceToxicologyTool,
  drugShortagesTool,
  foodAdverseEventsTool,
  deviceAdverseEventsTool,
} from "./open-fda";

// Clinical trials
export { clinicalTrialsSearchTool } from "./clinical-trials";

// MedlinePlus health info
export { medlinePlusSearchTool } from "./medlineplus";

// Orphadata rare diseases
export {
  rareDiseaseSearchTool,
  rareDiseaseGenesTool,
  rareDiseasePhenotypesTool,
} from "./orphadata";

// NLM Clinical Tables (HPO + LOINC)
export { hpoTermSearchTool, loincTestLookupTool } from "./nlm-clinical-tables";

// --- All tools available to all specialists ---

import {
  pubmedSearchTool,
  relatedArticlesTool,
  omimSearchTool,
  geneReviewsSearchTool,
  clinVarSearchTool,
} from "./pubmed-search";
import {
  drugLookupTool,
  drugInteractionTool,
  drugSpellingTool,
} from "./drug-interaction";
import {
  adverseEventsTool,
  drugLabelingTool,
  drugRecallTool,
  substanceToxicologyTool,
  drugShortagesTool,
  foodAdverseEventsTool,
  deviceAdverseEventsTool,
} from "./open-fda";
import { clinicalTrialsSearchTool } from "./clinical-trials";
import { medlinePlusSearchTool } from "./medlineplus";
import {
  rareDiseaseSearchTool,
  rareDiseaseGenesTool,
  rareDiseasePhenotypesTool,
} from "./orphadata";
import { hpoTermSearchTool, loincTestLookupTool } from "./nlm-clinical-tables";

export function getAllTools(): ToolsInput {
  return {
    "pubmed-search": pubmedSearchTool,
    "related-articles": relatedArticlesTool,
    "drug-lookup": drugLookupTool,
    "drug-interaction": drugInteractionTool,
    "drug-labeling": drugLabelingTool,
    "adverse-events": adverseEventsTool,
    "drug-recall": drugRecallTool,
    "substance-toxicology": substanceToxicologyTool,
    "drug-shortages": drugShortagesTool,
    "food-adverse-events": foodAdverseEventsTool,
    "device-adverse-events": deviceAdverseEventsTool,
    "clinical-trials-search": clinicalTrialsSearchTool,
    "medlineplus-search": medlinePlusSearchTool,
    "omim-search": omimSearchTool,
    "gene-reviews-search": geneReviewsSearchTool,
    "clinvar-search": clinVarSearchTool,
    "drug-spelling-suggestion": drugSpellingTool,
    "rare-disease-search": rareDiseaseSearchTool,
    "rare-disease-genes": rareDiseaseGenesTool,
    "rare-disease-phenotypes": rareDiseasePhenotypesTool,
    "hpo-term-search": hpoTermSearchTool,
    "loinc-test-lookup": loincTestLookupTool,
  };
}
