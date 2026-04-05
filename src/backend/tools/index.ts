// PubMed / NCBI E-utilities
export { pubmedSearchTool, relatedArticlesTool, omimSearchTool, geneReviewsSearchTool, clinVarSearchTool } from "./pubmed-search";

// Drug interactions (RxNav)
export { drugLookupTool, drugInteractionTool, drugSpellingTool } from "./drug-interaction";

// FDA drug safety (OpenFDA)
export { adverseEventsTool, drugLabelingTool, drugRecallTool, substanceToxicologyTool } from "./open-fda";

// Clinical trials
export { clinicalTrialsSearchTool } from "./clinical-trials";

// MedlinePlus health info
export { medlinePlusSearchTool } from "./medlineplus";

// --- Tool groupings by specialist category ---

import { pubmedSearchTool, omimSearchTool, geneReviewsSearchTool, clinVarSearchTool } from "./pubmed-search";
import { drugLookupTool, drugInteractionTool, drugSpellingTool } from "./drug-interaction";
import { adverseEventsTool, drugLabelingTool, substanceToxicologyTool } from "./open-fda";
import { clinicalTrialsSearchTool } from "./clinical-trials";
import { medlinePlusSearchTool } from "./medlineplus";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = any;

/** Tools available to all specialists */
const universalTools: Record<string, AnyTool> = {
  "pubmed-search": pubmedSearchTool,
  "drug-lookup": drugLookupTool,
  "drug-interaction": drugInteractionTool,
};

/** Additional tools for specialists that prescribe or manage medications heavily */
const prescribingTools: Record<string, AnyTool> = {
  "drug-labeling": drugLabelingTool,
  "adverse-events": adverseEventsTool,
};

/** Tools for genetic/hereditary condition evaluation */
const geneticsTools: Record<string, AnyTool> = {
  "omim-search": omimSearchTool,
  "gene-reviews-search": geneReviewsSearchTool,
  "clinvar-search": clinVarSearchTool,
};

/** Tools for oncology (cancer treatment and trials) */
const oncologyTools: Record<string, AnyTool> = {
  "clinical-trials-search": clinicalTrialsSearchTool,
  "drug-recall": drugLabelingTool, // reuse labeling for drug info
};

/** Tools for toxicology and poisoning */
const toxicologyTools: Record<string, AnyTool> = {
  "substance-toxicology": substanceToxicologyTool,
  "adverse-events": adverseEventsTool,
};

/** Tools for patient education and counseling */
const patientEducationTools: Record<string, AnyTool> = {
  "medlineplus-search": medlinePlusSearchTool,
};

/**
 * Tool assignments per specialist ID.
 * Every specialist gets universal tools. Domain-specific tools are layered on top.
 */
export function getToolsForSpecialist(specialistId: string): Record<string, AnyTool> {
  const tools: Record<string, AnyTool> = { ...universalTools };

  // Add prescribing tools for specialists that commonly prescribe
  const prescribers = new Set([
    "generalist", "cardiologist", "endocrinologist", "gastroenterologist",
    "hematologist", "infectiologist", "nephrologist", "neurologist",
    "oncologist", "pulmonologist", "rheumatologist", "psychiatrist",
    "pediatrician", "geriatrician", "intensivist", "emergencyPhysician",
    "allergistImmunologist", "obstetricianGynecologist", "andrologist",
    "maternalFetalMedicine", "sportsMedicinePhysician",
  ]);

  if (prescribers.has(specialistId)) {
    Object.assign(tools, prescribingTools);
  }

  // Add genetics tools for specialists that deal with inherited conditions
  const geneticsUsers = new Set([
    "geneticist", "oncologist", "pediatrician", "obstetricianGynecologist",
    "maternalFetalMedicine", "neurologist", "cardiologist",
  ]);
  if (geneticsUsers.has(specialistId)) {
    Object.assign(tools, geneticsTools);
  }

  // Add oncology-specific tools
  if (specialistId === "oncologist") {
    Object.assign(tools, oncologyTools);
  }

  // Add toxicology tools
  if (specialistId === "toxicologist" || specialistId === "emergencyPhysician" || specialistId === "intensivist") {
    Object.assign(tools, toxicologyTools);
  }

  // Add patient education tools for primary care and counseling specialties
  const educators = new Set([
    "generalist", "pediatrician", "geriatrician", "psychiatrist",
    "obstetricianGynecologist", "sportsMedicinePhysician",
  ]);
  if (educators.has(specialistId)) {
    Object.assign(tools, patientEducationTools);
  }

  // Clinical trials for specialists dealing with serious/chronic conditions
  const trialUsers = new Set([
    "oncologist", "hematologist", "neurologist", "pulmonologist",
    "cardiologist", "infectiologist", "rheumatologist",
  ]);
  if (trialUsers.has(specialistId)) {
    tools["clinical-trials-search"] = clinicalTrialsSearchTool;
  }

  // Drug spelling suggestions for toxicologist and emergency (unknown pills)
  if (specialistId === "toxicologist" || specialistId === "emergencyPhysician") {
    tools["drug-spelling-suggestion"] = drugSpellingTool;
  }

  return tools;
}
