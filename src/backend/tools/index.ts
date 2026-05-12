import type { ToolsInput } from "@mastra/core/agent";

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

// --- Tool Categories ---

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

type ToolCategory =
  | "universal"
  | "prescribing"
  | "rareDisease"
  | "toxicology"
  | "trials"
  | "labPhenotype";

const TOOL_DEFS = {
  universal: {
    "medlineplus-search": medlinePlusSearchTool,
    "drug-labeling": drugLabelingTool,
    "adverse-events": adverseEventsTool,
    "food-adverse-events": foodAdverseEventsTool,
    "device-adverse-events": deviceAdverseEventsTool,
  },
  prescribing: {
    "drug-lookup": drugLookupTool,
    "drug-interaction": drugInteractionTool,
    "drug-spelling-suggestion": drugSpellingTool,
    "drug-shortages": drugShortagesTool,
    "drug-recall": drugRecallTool,
  },
  rareDisease: {
    "rare-disease-search": rareDiseaseSearchTool,
    "rare-disease-genes": rareDiseaseGenesTool,
    "rare-disease-phenotypes": rareDiseasePhenotypesTool,
  },
  toxicology: {
    "substance-toxicology": substanceToxicologyTool,
  },
  trials: {
    "clinical-trials-search": clinicalTrialsSearchTool,
  },
  labPhenotype: {
    "hpo-term-search": hpoTermSearchTool,
    "loinc-test-lookup": loincTestLookupTool,
  },
} satisfies Record<ToolCategory, ToolsInput>;

const TOOL_ASSIGNMENTS: Record<string, ToolCategory[]> = {
  // Primary Care
  generalist: ["universal", "prescribing"],
  pediatrician: ["universal", "prescribing", "rareDisease"],
  geriatrician: ["universal", "prescribing"],

  // Internal Medicine
  cardiologist: ["universal", "prescribing"],
  dermatologist: ["universal"],
  endocrinologist: ["universal", "prescribing"],
  gastroenterologist: ["universal", "prescribing"],
  hematologist: ["universal", "prescribing", "trials"],
  infectiologist: ["universal", "prescribing"],
  nephrologist: ["universal", "prescribing"],
  neurologist: ["universal", "prescribing", "rareDisease", "trials"],
  oncologist: ["universal", "prescribing", "trials"],
  pulmonologist: ["universal", "prescribing"],
  rheumatologist: ["universal", "prescribing", "trials", "labPhenotype"],

  // Surgical
  generalSurgeon: ["universal", "prescribing"],
  cardiothoracicSurgeon: ["universal", "prescribing"],
  neurosurgeon: ["universal", "prescribing"],
  orthopedist: ["universal", "prescribing"],
  otolaryngologist: ["universal", "prescribing"],
  urologist: ["universal", "prescribing"],
  vascularSurgeon: ["universal", "prescribing"],

  // Diagnostic & Support
  pathologist: ["universal", "rareDisease", "labPhenotype"],
  radiologist: ["universal"],
  geneticist: ["universal", "rareDisease", "labPhenotype"],

  // Reproductive
  obstetricianGynecologist: ["universal", "prescribing"],
  andrologist: ["universal", "prescribing"],
  maternalFetalMedicine: ["universal", "prescribing", "rareDisease"],

  // Mental Health
  psychiatrist: ["universal", "prescribing"],

  // Critical Care & Emergency
  intensivist: ["universal", "prescribing", "toxicology"],
  toxicologist: ["universal", "prescribing", "toxicology"],

  // Other
  allergistImmunologist: ["universal", "prescribing"],
  ophthalmologist: ["universal", "prescribing"],
  emergencyPhysician: ["universal", "prescribing", "toxicology"],
  sportsMedicinePhysician: ["universal", "prescribing"],
  podiatrist: ["universal", "prescribing"],
};

export function getToolsForSpecialist(specialistId: string): ToolsInput {
  const categories = TOOL_ASSIGNMENTS[specialistId];
  if (!categories) {
    // Fallback: universal tools only for unknown specialists
    return { ...TOOL_DEFS.universal };
  }

  const tools: ToolsInput = {};
  for (const cat of categories) {
    Object.assign(tools, TOOL_DEFS[cat]);
  }
  return tools;
}

export function getAllTools(): ToolsInput {
  return {
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
    "drug-spelling-suggestion": drugSpellingTool,
    "rare-disease-search": rareDiseaseSearchTool,
    "rare-disease-genes": rareDiseaseGenesTool,
    "rare-disease-phenotypes": rareDiseasePhenotypesTool,
    "hpo-term-search": hpoTermSearchTool,
    "loinc-test-lookup": loincTestLookupTool,
  };
}
