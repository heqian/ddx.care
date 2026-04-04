import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const MEDLINE_BASE = "https://connect.medlineplus.gov/service";

/** Common condition name to ICD-10-CM code mapping for MedlinePlus Connect */
const CONDITION_ICD10: Record<string, string> = {
  diabetes: "E11.9",
  "type 2 diabetes": "E11.9",
  "type 1 diabetes": "E10.9",
  hypertension: "I10",
  "high blood pressure": "I10",
  asthma: "J45.909",
  copd: "J44.1",
  pneumonia: "J18.9",
  "heart failure": "I50.9",
  "heart disease": "I25.10",
  "breast cancer": "C50.919",
  "lung cancer": "C34.90",
  depression: "F32.9",
  anxiety: "F41.1",
  obesity: "E66.01",
  stroke: "I63.9",
  "kidney disease": "N18.6",
  "kidney failure": "N19",
  arthritis: "M19.90",
  alzheimer: "G30.9",
  "alzheimer's disease": "G30.9",
  dementia: "F03.90",
  anemia: "D64.9",
  migraine: "G43.909",
  epilepsy: "G40.909",
  "celiac disease": "K90.0",
  "crohn's disease": "K50.90",
  "liver disease": "K74.60",
  "thyroid disease": "E03.9",
  "urinary tract infection": "N39.0",
  osteoporosis: "M81.0",
  gout: "M10.9",
  lupus: "M32.9",
  "sickle cell": "D57.00",
  "cystic fibrosis": "E84.9",
  "down syndrome": "Q90.9",
  autism: "F84.0",
  adhd: "F90.9",
  bipolar: "F31.9",
  schizophrenia: "F20.9",
  ptsd: "F43.10",
  fibromyalgia: "M79.7",
  "lyme disease": "A69.20",
  "multiple sclerosis": "G35",
  "parkinson's disease": "G20",
  sepsis: "A41.9",
};

/**
 * Look up patient-friendly health information from MedlinePlus by condition name.
 */
export const medlinePlusSearchTool = createTool({
  id: "medlineplus-search",
  description:
    "Search MedlinePlus for patient-friendly health information on diseases, conditions, and wellness topics. Returns plain-language summaries of causes, symptoms, diagnosis, and treatment.",
  inputSchema: z.object({
    condition: z.string().describe("Disease or condition name (e.g. 'diabetes', 'heart failure', 'pneumonia')"),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        summary: z.string(),
        url: z.string().optional(),
      }),
    ),
    error: z.string().optional(),
  }),
  execute: async ({ condition }) => {
    // Look up ICD-10-CM code for the condition
    const icd10 = CONDITION_ICD10[condition.toLowerCase().trim()];

    // Try ICD-10-CM code system first (most reliable), then fall back to condition name
    const attempts: string[] = [];
    if (icd10) {
      attempts.push(
        `${MEDLINE_BASE}?mainSearchCriteria.v.cs=2.16.840.1.113883.6.90&mainSearchCriteria.v.c=${encodeURIComponent(icd10)}&mainSearchCriteria.v.dn=${encodeURIComponent(condition)}&knowledgeResponseType=application/json`,
      );
    }
    // Fallback: try with condition name as the search term
    attempts.push(
      `${MEDLINE_BASE}?mainSearchCriteria.v.cs=2.16.840.1.113883.6.103&mainSearchCriteria.v.dn=${encodeURIComponent(condition)}&knowledgeResponseType=application/json`,
    );

    for (const url of attempts) {
      try {
        const result = await fetch(url);
        if (!result.ok) continue;
        const data = await result.json();

        const entries = data?.feed?.entry ?? [];
        const entryArray = Array.isArray(entries) ? entries : entries ? [entries] : [];

        const results = entryArray.map((entry: any) => ({
          title: entry.title?._value ?? entry.title ?? "",
          summary: entry.summary?._value ?? entry.summary ?? "",
          url: entry.link?.[0]?.href ?? entry.id ?? undefined,
        }));

        if (results.length > 0) {
          return { results };
        }
      } catch {
        continue;
      }
    }

    return { results: [], error: "No information found for this condition." };
  },
});
