import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJSON as baseFetchJSON } from "./utils/fetch";

interface FdaAdverseEventReport {
  safetyreportid?: string;
  serious?: string;
  seriousnesscongenitalanomali?: string;
  seriousnessdeath?: string;
  seriousnesshospitalization?: string;
  seriousnesslifethreatening?: string;
  seriousnessdisabling?: string;
  patient?: {
    reaction?: Array<{ reactionmeddrapt?: string; reactionoutcome?: string }>;
    patientonsetage?: string | number;
    patientsex?: string;
  };
  receivedate?: string;
}

interface FdaDrugLabelRecord {
  id?: string;
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    pregnancy_category?: string[];
  };
  indications_and_usage?: string[];
  contraindications?: string[];
  warnings?: string[];
  adverse_reactions?: string[];
  dosage_and_administration?: string[];
  mechanism_of_action?: string[];
  pregnancy?: string | string[];
}

interface FdaRecallRecord {
  recall_number?: string;
  product_description?: string;
  reason_for_recall?: string;
  classification?: string;
  status?: string;
  recalling_firm?: string;
  recall_initiation_date?: string;
}

interface FdaSubstanceRecord {
  substance_id?: string;
  substance_name?: string;
  approval_id?: string;
}

const FDA_BASE = "https://api.fda.gov";

async function fetchJSON(url: string) {
  return baseFetchJSON(url, { errorPrefix: "OpenFDA API", ignore404: true });
}

/**
 * Search for drug adverse event reports from FDA FAERS database.
 */
export const adverseEventsTool = createTool({
  id: "adverse-events-search",
  description:
    "Search FDA adverse event reports (FAERS) for a drug. Returns reported adverse reactions, outcomes, and frequencies. Useful for evaluating drug safety and side effects.",
  inputSchema: z.object({
    drugName: z
      .string()
      .describe("Drug generic name (e.g. 'metformin', 'ibuprofen'). Use generic names for best results."),
    limit: z.number().min(1).max(10).default(3).describe("Number of reports to return"),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        reportId: z.string().optional(),
        serious: z.boolean().optional(),
        seriousnessDescription: z.string().optional(),
        reactions: z.array(z.string()).optional(),
        outcomes: z.array(z.string()).optional(),
        patientAge: z.string().optional(),
        patientSex: z.string().optional(),
        receiveDate: z.string().optional(),
      }),
    ),
    meta: z
      .object({
        totalResults: z.number().optional(),
        disclaimer: z.string().optional(),
      })
      .optional(),
    error: z.string().optional(),
  }),
  execute: async ({ drugName, limit }) => {
    const url = `${FDA_BASE}/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drugName)}"&limit=${limit}`;
    const result = await fetchJSON(url);

    if (result.error) {
      return { results: [], error: "No adverse event reports found for this drug." };
    }

    const meta = result.meta
      ? {
          totalResults: result.meta.results?.total ?? undefined,
          disclaimer: result.meta.disclaimer ?? undefined,
        }
      : undefined;

    const results = (result.results ?? []).map((r: FdaAdverseEventReport) => ({
      reportId: r.safetyreportid ?? undefined,
      serious: r.serious === "1" ? true : r.serious === "2" ? false : undefined,
      seriousnessDescription: r.seriousnesscongenitalanomali === "1"
        ? "Congenital anomaly"
        : r.seriousnessdeath === "1"
          ? "Death"
          : r.seriousnesshospitalization === "1"
            ? "Hospitalization"
            : r.seriousnesslifethreatening === "1"
              ? "Life threatening"
              : r.seriousnessdisabling === "1"
                ? "Disabling"
                : undefined,
      reactions: r.patient?.reaction?.map((rx) => rx.reactionmeddrapt ?? "").filter(Boolean) ?? [],
      outcomes: r.patient?.reaction?.map((rx) => rx.reactionoutcome ?? "").filter(Boolean) ?? [],
      patientAge: r.patient?.patientonsetage?.toString() ?? undefined,
      patientSex: r.patient?.patientsex === "1" ? "Male" : r.patient?.patientsex === "2" ? "Female" : undefined,
      receiveDate: r.receivedate ?? undefined,
    }));

    return { results, meta };
  },
});

/**
 * Search FDA drug labeling (package insert) information.
 */
export const drugLabelingTool = createTool({
  id: "drug-labeling-search",
  description:
    "Search FDA drug labeling (package insert) for official indications, contraindications, warnings, adverse reactions, dosing, and mechanism of action.",
  inputSchema: z.object({
    drugName: z.string().describe("Drug generic or brand name"),
    limit: z.number().min(1).max(5).default(1).describe("Number of labeling records"),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        id: z.string().optional(),
        brandName: z.string().optional(),
        genericName: z.string().optional(),
        indications: z.string().optional(),
        contraindications: z.string().optional(),
        warnings: z.string().optional(),
        adverseReactions: z.string().optional(),
        dosage: z.string().optional(),
        mechanismOfAction: z.string().optional(),
        pregnancyCategory: z.string().optional(),
      }),
    ),
    error: z.string().optional(),
  }),
  execute: async ({ drugName, limit }) => {
    const url = `${FDA_BASE}/drug/label.json?search=openfda.generic_name:${encodeURIComponent(drugName)}+openfda.brand_name:${encodeURIComponent(drugName)}&limit=${limit}`;
    const result = await fetchJSON(url);

    if (result.error) {
      return { results: [], error: "No labeling information found for this drug." };
    }

    const results = (result.results ?? []).map((r: FdaDrugLabelRecord) => ({
      id: r.id ?? undefined,
      brandName: r.openfda?.brand_name?.join(", ") ?? undefined,
      genericName: r.openfda?.generic_name?.join(", ") ?? undefined,
      indications: r.indications_and_usage?.join(" ") ?? undefined,
      contraindications: r.contraindications?.join(" ") ?? undefined,
      warnings: r.warnings?.join(" ") ?? undefined,
      adverseReactions: r.adverse_reactions?.join(" ") ?? undefined,
      dosage: r.dosage_and_administration?.join(" ") ?? undefined,
      mechanismOfAction: r.mechanism_of_action?.join(" ") ?? undefined,
      pregnancyCategory: (Array.isArray(r.pregnancy) ? r.pregnancy.join(" ") : r.pregnancy) ?? r.openfda?.pregnancy_category?.join(", ") ?? undefined,
    }));

    return { results };
  },
});

/**
 * Search FDA drug recall and enforcement reports.
 */
export const drugRecallTool = createTool({
  id: "drug-recall-search",
  description:
    "Search FDA drug recalls and enforcement reports. Returns recall reason, classification, and product details.",
  inputSchema: z.object({
    drugName: z.string().describe("Drug name to search recalls for"),
    limit: z.number().min(1).max(10).default(5).describe("Number of recall records"),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        recallNumber: z.string().optional(),
        productDescription: z.string().optional(),
        reason: z.string().optional(),
        classification: z.string().optional(),
        status: z.string().optional(),
        initiatingFirm: z.string().optional(),
        recallDate: z.string().optional(),
      }),
    ),
    error: z.string().optional(),
  }),
  execute: async ({ drugName, limit }) => {
    const url = `${FDA_BASE}/drug/enforcement.json?search=product_description:${encodeURIComponent(drugName)}&limit=${limit}`;
    const result = await fetchJSON(url);

    if (result.error) {
      return { results: [], error: "No recall data found for this drug." };
    }

    const results = (result.results ?? []).map((r: FdaRecallRecord) => ({
      recallNumber: r.recall_number ?? undefined,
      productDescription: r.product_description ?? undefined,
      reason: r.reason_for_recall ?? undefined,
      classification: r.classification ?? undefined,
      status: r.status ?? undefined,
      initiatingFirm: r.recalling_firm ?? undefined,
      recallDate: r.recall_initiation_date ?? undefined,
    }));

    return { results };
  },
});

/**
 * Search FDA substance toxicology data.
 */
export const substanceToxicologyTool = createTool({
  id: "substance-toxicology-search",
  description:
    "Search FDA Substance Data System for toxicology and pharmacology data on chemicals and substances. Useful for toxicology and poisoning cases.",
  inputSchema: z.object({
    substanceName: z.string().describe("Chemical or substance name (e.g. 'ethylene glycol', 'arsenic')"),
    limit: z.number().min(1).max(5).default(3).describe("Number of records"),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        substanceId: z.string().optional(),
        substanceName: z.string().optional(),
        approvalId: z.string().optional(),
      }),
    ),
    error: z.string().optional(),
  }),
  execute: async ({ substanceName, limit }) => {
    const url = `${FDA_BASE}/other/substance.json?search=substance_name:${encodeURIComponent(substanceName)}&limit=${limit}`;
    const result = await fetchJSON(url);

    if (result.error) {
      return { results: [], error: "No substance data found." };
    }

    const results = (result.results ?? []).map((r: FdaSubstanceRecord) => ({
      substanceId: r.substance_id ?? undefined,
      substanceName: r.substance_name ?? undefined,
      approvalId: r.approval_id ?? undefined,
    }));

    return { results };
  },
});
