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
} from "./open-fda";

// Clinical trials
export { clinicalTrialsSearchTool } from "./clinical-trials";

// MedlinePlus health info
export { medlinePlusSearchTool } from "./medlineplus";

// --- Type-safe tool assignments ---

import type { SpecialistId } from "../agents";
import type { ToolsInput } from "@mastra/core/agent";

import {
  pubmedSearchTool,
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
} from "./open-fda";
import { clinicalTrialsSearchTool } from "./clinical-trials";
import { medlinePlusSearchTool } from "./medlineplus";

// --- Tool categories ---

/** Tools available to all specialists */
const universal = {
  "pubmed-search": pubmedSearchTool,
  "drug-lookup": drugLookupTool,
  "drug-interaction": drugInteractionTool,
};

/** Additional tools for specialists that prescribe or manage medications */
const prescribing = {
  "drug-labeling": drugLabelingTool,
  "adverse-events": adverseEventsTool,
};

/** Tools for genetic/hereditary condition evaluation */
const genetics = {
  "omim-search": omimSearchTool,
  "gene-reviews-search": geneReviewsSearchTool,
  "clinvar-search": clinVarSearchTool,
};

/** Tools for oncology (cancer treatment, trials, and drug info) */
const oncology = {
  "clinical-trials-search": clinicalTrialsSearchTool,
  "drug-recall": drugRecallTool,
};

/** Tools for toxicology and poisoning */
const toxicology = {
  "substance-toxicology": substanceToxicologyTool,
  "adverse-events": adverseEventsTool,
};

/** Tools for patient education and counseling */
const education = {
  "medlineplus-search": medlinePlusSearchTool,
};

/** Clinical trial search for chronic/serious conditions */
const trials = {
  "clinical-trials-search": clinicalTrialsSearchTool,
};

/** Drug spelling suggestions for identifying unknown substances */
const spelling = {
  "drug-spelling-suggestion": drugSpellingTool,
};

// --- Declarative specialist → tool categories ---

const toolAssignments: Record<SpecialistId, ToolsInput[]> = {
  // Primary Care
  generalist: [universal, prescribing, education],
  pediatrician: [universal, prescribing, genetics, education],
  geriatrician: [universal, prescribing, education],
  // Internal Medicine Subspecialties
  cardiologist: [universal, prescribing, genetics, trials],
  dermatologist: [universal],
  endocrinologist: [universal, prescribing],
  gastroenterologist: [universal, prescribing],
  hematologist: [universal, prescribing, trials],
  infectiologist: [universal, prescribing, trials],
  nephrologist: [universal, prescribing],
  neurologist: [universal, prescribing, genetics, trials],
  oncologist: [universal, prescribing, genetics, oncology, trials],
  pulmonologist: [universal, prescribing, trials],
  rheumatologist: [universal, prescribing, trials],
  // Surgical Specialties
  generalSurgeon: [universal],
  cardiothoracicSurgeon: [universal],
  neurosurgeon: [universal],
  orthopedist: [universal],
  otolaryngologist: [universal],
  urologist: [universal],
  vascularSurgeon: [universal],
  // Diagnostic & Support
  pathologist: [universal],
  radiologist: [universal],
  geneticist: [universal, genetics],
  // Reproductive & Gender-Specific
  obstetricianGynecologist: [universal, prescribing, genetics, education],
  andrologist: [universal, prescribing],
  maternalFetalMedicine: [universal, prescribing, genetics],
  // Mental & Behavioral Health
  psychiatrist: [universal, prescribing, education],
  // Critical Care & Emergency Subspecialties
  intensivist: [universal, prescribing, toxicology],
  toxicologist: [universal, toxicology, spelling],
  // Other Specialized Fields
  allergistImmunologist: [universal, prescribing],
  ophthalmologist: [universal],
  emergencyPhysician: [universal, prescribing, toxicology, spelling],
  sportsMedicinePhysician: [universal, prescribing, education],
  podiatrist: [universal],
};

/**
 * Get the set of tools for a given specialist agent.
 * Tool categories are merged in order; later categories may override
 * duplicate keys from earlier ones.
 */
export function getToolsForSpecialist(id: SpecialistId): ToolsInput {
  const categories = toolAssignments[id];
  return Object.assign({}, ...categories);
}
