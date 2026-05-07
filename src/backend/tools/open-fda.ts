import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJSON as baseFetchJSON } from "./utils/fetch";
import type { ToolResult } from "./utils/types";
import {
  APITimeoutError,
  RateLimitError,
  PermanentAPIError,
} from "../utils/errors";

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

interface FdaDrugShortageRecord {
  generic_name?: string;
  brand_name?: string;
  availability?: string;
  shortage_reason?: string;
  status?: string;
  company_name?: string;
  presentation?: string;
  therapeutic_category?: string[];
  update_date?: string;
  initial_posting_date?: string;
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    manufacturer_name?: string[];
  };
}

interface FdaFoodEventRecord {
  report_number?: string;
  outcomes?: string[];
  reactions?: string[];
  date_started?: string;
  consumer?: {
    age?: string;
    age_unit?: string;
    gender?: string;
  };
  products?: Array<{
    role?: string;
    name_brand?: string;
    industry_name?: string;
  }>;
}

interface FdaDeviceEventRecord {
  report_number?: string;
  event_type?: string;
  date_of_event?: string;
  date_received?: string;
  event_location?: string;
  type_of_report?: string[];
  product_problem_flag?: string;
  source_type?: string[];
  patient?: {
    patient_problems?: string[];
    sequence_number_treatment?: string[];
    sequence_number_outcome?: string[];
  };
  openfda?: {
    device_name?: string[];
    medical_specialty_description?: string[];
    regulation_number?: string[];
  };
}

const FDA_BASE = "https://api.fda.gov";

async function fetchJSON(url: string) {
  return baseFetchJSON(url, { errorPrefix: "OpenFDA API", ignore404: true });
}

/** Classify a caught error for ToolResult retriable flag */
function classifyError(error: unknown): { error: string; retriable: boolean } {
  if (error instanceof APITimeoutError)
    return { error: error.message, retriable: true };
  if (error instanceof RateLimitError)
    return { error: error.message, retriable: true };
  if (error instanceof PermanentAPIError)
    return { error: error.message, retriable: false };
  if (error instanceof Error) return { error: error.message, retriable: true };
  return { error: String(error), retriable: true };
}

/**
 * Search for drug adverse event reports from FDA FAERS database.
 */
export const adverseEventsTool = createTool({
  id: "adverse-events",
  description:
    "Search FDA adverse event reports (FAERS) for a drug. Returns reported adverse reactions, outcomes, and frequencies. Useful for evaluating drug safety and side effects. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    drugName: z
      .string()
      .describe(
        "Drug generic name (e.g. 'metformin', 'ibuprofen'). Use generic names for best results.",
      ),
    limit: z
      .number()
      .min(1)
      .max(10)
      .default(3)
      .describe("Number of reports to return"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
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
      }),
    }),
    z.object({
      ok: z.literal(false),
      error: z.string(),
      retriable: z.boolean(),
    }),
  ]),
  execute: async ({
    drugName,
    limit,
  }): Promise<
    ToolResult<{
      results: Array<{
        reportId?: string;
        serious?: boolean;
        seriousnessDescription?: string;
        reactions?: string[];
        outcomes?: string[];
        patientAge?: string;
        patientSex?: string;
        receiveDate?: string;
      }>;
      meta?: { totalResults?: number; disclaimer?: string };
    }>
  > => {
    try {
      const url = `${FDA_BASE}/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drugName)}"&limit=${limit}`;
      const result = await fetchJSON(url);

      if (result.error) {
        return {
          ok: false,
          error: "No adverse event reports found for this drug.",
          retriable: false,
        };
      }

      const meta = result.meta
        ? {
            totalResults: result.meta.results?.total ?? undefined,
            disclaimer: result.meta.disclaimer ?? undefined,
          }
        : undefined;

      const results = (result.results ?? []).map(
        (r: FdaAdverseEventReport) => ({
          reportId: r.safetyreportid ?? undefined,
          serious:
            r.serious === "1" ? true : r.serious === "2" ? false : undefined,
          seriousnessDescription:
            r.seriousnesscongenitalanomali === "1"
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
          reactions:
            r.patient?.reaction
              ?.map((rx) => rx.reactionmeddrapt ?? "")
              .filter(Boolean) ?? [],
          outcomes:
            r.patient?.reaction
              ?.map((rx) => rx.reactionoutcome ?? "")
              .filter(Boolean) ?? [],
          patientAge: r.patient?.patientonsetage?.toString() ?? undefined,
          patientSex:
            r.patient?.patientsex === "1"
              ? "Male"
              : r.patient?.patientsex === "2"
                ? "Female"
                : undefined,
          receiveDate: r.receivedate ?? undefined,
        }),
      );

      return { ok: true as const, data: { results, meta } };
    } catch (e) {
      const classified = classifyError(e);
      return {
        ok: false as const,
        error: `FDA adverse events search failed: ${classified.error}`,
        retriable: classified.retriable,
      };
    }
  },
});

/**
 * Search FDA drug labeling (package insert) information.
 */
export const drugLabelingTool = createTool({
  id: "drug-labeling",
  description:
    "Search FDA drug labeling (package insert) for official indications, contraindications, warnings, adverse reactions, dosing, and mechanism of action. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    drugName: z.string().describe("Drug generic or brand name"),
    limit: z
      .number()
      .min(1)
      .max(5)
      .default(1)
      .describe("Number of labeling records"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
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
      }),
    }),
    z.object({
      ok: z.literal(false),
      error: z.string(),
      retriable: z.boolean(),
    }),
  ]),
  execute: async ({
    drugName,
    limit,
  }): Promise<
    ToolResult<{
      results: Array<{
        id?: string;
        brandName?: string;
        genericName?: string;
        indications?: string;
        contraindications?: string;
        warnings?: string;
        adverseReactions?: string;
        dosage?: string;
        mechanismOfAction?: string;
        pregnancyCategory?: string;
      }>;
    }>
  > => {
    try {
      const url = `${FDA_BASE}/drug/label.json?search=openfda.generic_name:${encodeURIComponent(drugName)}+openfda.brand_name:${encodeURIComponent(drugName)}&limit=${limit}`;
      const result = await fetchJSON(url);

      if (result.error) {
        return {
          ok: false,
          error: "No labeling information found for this drug.",
          retriable: false,
        };
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
        pregnancyCategory:
          (Array.isArray(r.pregnancy) ? r.pregnancy.join(" ") : r.pregnancy) ??
          r.openfda?.pregnancy_category?.join(", ") ??
          undefined,
      }));

      return { ok: true as const, data: { results } };
    } catch (e) {
      const classified = classifyError(e);
      return {
        ok: false as const,
        error: `FDA drug labeling search failed: ${classified.error}`,
        retriable: classified.retriable,
      };
    }
  },
});

/**
 * Search FDA drug recall and enforcement reports.
 */
export const drugRecallTool = createTool({
  id: "drug-recall",
  description:
    "Search FDA drug recalls and enforcement reports. Returns recall reason, classification, and product details. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    drugName: z.string().describe("Drug name to search recalls for"),
    limit: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of recall records"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
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
      }),
    }),
    z.object({
      ok: z.literal(false),
      error: z.string(),
      retriable: z.boolean(),
    }),
  ]),
  execute: async ({
    drugName,
    limit,
  }): Promise<
    ToolResult<{
      results: Array<{
        recallNumber?: string;
        productDescription?: string;
        reason?: string;
        classification?: string;
        status?: string;
        initiatingFirm?: string;
        recallDate?: string;
      }>;
    }>
  > => {
    try {
      const url = `${FDA_BASE}/drug/enforcement.json?search=product_description:${encodeURIComponent(drugName)}&limit=${limit}`;
      const result = await fetchJSON(url);

      if (result.error) {
        return {
          ok: false,
          error: "No recall data found for this drug.",
          retriable: false,
        };
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

      return { ok: true as const, data: { results } };
    } catch (e) {
      const classified = classifyError(e);
      return {
        ok: false as const,
        error: `FDA drug recall search failed: ${classified.error}`,
        retriable: classified.retriable,
      };
    }
  },
});

/**
 * Search FDA substance toxicology data.
 */
export const substanceToxicologyTool = createTool({
  id: "substance-toxicology",
  description:
    "Search FDA Substance Data System for toxicology and pharmacology data on chemicals and substances. Useful for toxicology and poisoning cases. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    substanceName: z
      .string()
      .describe(
        "Chemical or substance name (e.g. 'ethylene glycol', 'arsenic')",
      ),
    limit: z.number().min(1).max(5).default(3).describe("Number of records"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            substanceId: z.string().optional(),
            substanceName: z.string().optional(),
            approvalId: z.string().optional(),
          }),
        ),
      }),
    }),
    z.object({
      ok: z.literal(false),
      error: z.string(),
      retriable: z.boolean(),
    }),
  ]),
  execute: async ({
    substanceName,
    limit,
  }): Promise<
    ToolResult<{
      results: Array<{
        substanceId?: string;
        substanceName?: string;
        approvalId?: string;
      }>;
    }>
  > => {
    try {
      const url = `${FDA_BASE}/other/substance.json?search=substance_name:${encodeURIComponent(substanceName)}&limit=${limit}`;
      const result = await fetchJSON(url);

      if (result.error) {
        return {
          ok: false,
          error: "No substance data found.",
          retriable: false,
        };
      }

      const results = (result.results ?? []).map((r: FdaSubstanceRecord) => ({
        substanceId: r.substance_id ?? undefined,
        substanceName: r.substance_name ?? undefined,
        approvalId: r.approval_id ?? undefined,
      }));

      return { ok: true as const, data: { results } };
    } catch (e) {
      const classified = classifyError(e);
      return {
        ok: false as const,
        error: `FDA substance toxicology search failed: ${classified.error}`,
        retriable: classified.retriable,
      };
    }
  },
});

export const drugShortagesTool = createTool({
  id: "drug-shortages",
  description:
    "Search FDA drug shortage database for current and resolved drug shortages. Returns availability, reason for shortage, and therapeutic category. Useful for identifying alternative therapies when a drug is unavailable. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    drugName: z
      .string()
      .describe("Drug generic or brand name to check for shortages"),
    limit: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of shortage records"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            genericName: z.string().optional(),
            brandName: z.string().optional(),
            availability: z.string().optional(),
            reason: z.string().optional(),
            status: z.string().optional(),
            company: z.string().optional(),
            presentation: z.string().optional(),
            therapeuticCategory: z.array(z.string()).optional(),
            updateDate: z.string().optional(),
          }),
        ),
      }),
    }),
    z.object({
      ok: z.literal(false),
      error: z.string(),
      retriable: z.boolean(),
    }),
  ]),
  execute: async ({
    drugName,
    limit,
  }): Promise<
    ToolResult<{
      results: Array<{
        genericName?: string;
        brandName?: string;
        availability?: string;
        reason?: string;
        status?: string;
        company?: string;
        presentation?: string;
        therapeuticCategory?: string[];
        updateDate?: string;
      }>;
    }>
  > => {
    try {
      const url = `${FDA_BASE}/drug/shortages.json?search=generic_name:${encodeURIComponent(drugName)}+openfda.brand_name:${encodeURIComponent(drugName)}&limit=${limit}`;
      const result = await fetchJSON(url);

      if (result.error) {
        return {
          ok: false,
          error: "No drug shortage data found.",
          retriable: false,
        };
      }

      const results = (result.results ?? []).map(
        (r: FdaDrugShortageRecord) => ({
          genericName:
            r.generic_name ?? r.openfda?.generic_name?.join(", ") ?? undefined,
          brandName:
            r.brand_name ?? r.openfda?.brand_name?.join(", ") ?? undefined,
          availability: r.availability ?? undefined,
          reason: r.shortage_reason ?? undefined,
          status: r.status ?? undefined,
          company:
            r.company_name ??
            r.openfda?.manufacturer_name?.join(", ") ??
            undefined,
          presentation: r.presentation ?? undefined,
          therapeuticCategory: r.therapeutic_category ?? undefined,
          updateDate: r.update_date ?? undefined,
        }),
      );

      return { ok: true as const, data: { results } };
    } catch (e) {
      const classified = classifyError(e);
      return {
        ok: false as const,
        error: `FDA drug shortage search failed: ${classified.error}`,
        retriable: classified.retriable,
      };
    }
  },
});

export const foodAdverseEventsTool = createTool({
  id: "food-adverse-events",
  description:
    "Search FDA CFSAN adverse event reporting system (CAERS) for food, cosmetic, and dietary supplement adverse events. Returns product names, reactions, and outcomes. Useful for identifying food-supplement interactions or adverse reactions. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    productName: z
      .string()
      .describe(
        "Product name to search (e.g. 'centrum', 'ensure', 'whey protein')",
      ),
    limit: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of reports to return"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            reportNumber: z.string().optional(),
            reactions: z.array(z.string()).optional(),
            outcomes: z.array(z.string()).optional(),
            products: z
              .array(
                z.object({
                  name: z.string().optional(),
                  industry: z.string().optional(),
                }),
              )
              .optional(),
            consumerAge: z.string().optional(),
            consumerGender: z.string().optional(),
            dateStarted: z.string().optional(),
          }),
        ),
      }),
    }),
    z.object({
      ok: z.literal(false),
      error: z.string(),
      retriable: z.boolean(),
    }),
  ]),
  execute: async ({
    productName,
    limit,
  }): Promise<
    ToolResult<{
      results: Array<{
        reportNumber?: string;
        reactions?: string[];
        outcomes?: string[];
        products?: Array<{ name?: string; industry?: string }>;
        consumerAge?: string;
        consumerGender?: string;
        dateStarted?: string;
      }>;
    }>
  > => {
    try {
      const url = `${FDA_BASE}/food/event.json?search=products.name_brand:${encodeURIComponent(productName)}&limit=${limit}`;
      const result = await fetchJSON(url);

      if (result.error) {
        return {
          ok: false,
          error: "No food adverse event reports found.",
          retriable: false,
        };
      }

      const results = (result.results ?? []).map((r: FdaFoodEventRecord) => ({
        reportNumber: r.report_number ?? undefined,
        reactions: r.reactions ?? [],
        outcomes: r.outcomes ?? [],
        products:
          r.products?.map((p) => ({
            name: p.name_brand ?? undefined,
            industry: p.industry_name ?? undefined,
          })) ?? [],
        consumerAge: r.consumer?.age
          ? `${r.consumer.age} ${r.consumer.age_unit ?? ""}`.trim()
          : undefined,
        consumerGender: r.consumer?.gender ?? undefined,
        dateStarted: r.date_started ?? undefined,
      }));

      return { ok: true as const, data: { results } };
    } catch (e) {
      const classified = classifyError(e);
      return {
        ok: false as const,
        error: `FDA food adverse events search failed: ${classified.error}`,
        retriable: classified.retriable,
      };
    }
  },
});

export const deviceAdverseEventsTool = createTool({
  id: "device-adverse-events",
  description:
    "Search FDA MAUDE database for medical device adverse events. Returns device names, event types, patient problems, and outcomes. Useful for identifying device-related complications or failures. On failure, returns { ok: false, error: string, retriable: boolean } where retriable indicates whether retrying might succeed.",
  inputSchema: z.object({
    deviceName: z
      .string()
      .describe(
        "Device name to search (e.g. 'pacemaker', 'ventilator', 'infusion pump')",
      ),
    limit: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of reports to return"),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      data: z.object({
        results: z.array(
          z.object({
            reportNumber: z.string().optional(),
            eventType: z.string().optional(),
            deviceName: z.string().optional(),
            medicalSpecialty: z.string().optional(),
            patientProblems: z.array(z.string()).optional(),
            eventLocation: z.string().optional(),
            dateOfEvent: z.string().optional(),
            dateReceived: z.string().optional(),
          }),
        ),
      }),
    }),
    z.object({
      ok: z.literal(false),
      error: z.string(),
      retriable: z.boolean(),
    }),
  ]),
  execute: async ({
    deviceName,
    limit,
  }): Promise<
    ToolResult<{
      results: Array<{
        reportNumber?: string;
        eventType?: string;
        deviceName?: string;
        medicalSpecialty?: string;
        patientProblems?: string[];
        eventLocation?: string;
        dateOfEvent?: string;
        dateReceived?: string;
      }>;
    }>
  > => {
    try {
      const url = `${FDA_BASE}/device/event.json?search=openfda.device_name:${encodeURIComponent(deviceName)}&limit=${limit}`;
      const result = await fetchJSON(url);

      if (result.error) {
        return {
          ok: false,
          error: "No device adverse event reports found.",
          retriable: false,
        };
      }

      const results = (result.results ?? []).map((r: FdaDeviceEventRecord) => ({
        reportNumber: r.report_number ?? undefined,
        eventType: r.event_type ?? undefined,
        deviceName: r.openfda?.device_name?.join(", ") ?? undefined,
        medicalSpecialty:
          r.openfda?.medical_specialty_description?.join(", ") ?? undefined,
        patientProblems: r.patient?.patient_problems ?? [],
        eventLocation: r.event_location ?? undefined,
        dateOfEvent: r.date_of_event ?? undefined,
        dateReceived: r.date_received ?? undefined,
      }));

      return { ok: true as const, data: { results } };
    } catch (e) {
      const classified = classifyError(e);
      return {
        ok: false as const,
        error: `FDA device adverse events search failed: ${classified.error}`,
        retriable: classified.retriable,
      };
    }
  },
});
