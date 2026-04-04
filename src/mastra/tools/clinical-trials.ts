import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const CT_BASE = "https://clinicaltrials.gov/api/v2";

async function fetchJSON(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ClinicalTrials.gov API error: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Search ClinicalTrials.gov for active and completed clinical trials.
 */
export const clinicalTrialsSearchTool = createTool({
  id: "clinical-trials-search",
  description:
    "Search ClinicalTrials.gov for clinical trials by condition, intervention, or keyword. Returns trial status, phase, eligibility criteria, and sponsor information. Useful for finding treatment options and research studies.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Search query (e.g. 'pancreatic cancer immunotherapy', 'heart failure sacubitril'). Use condition + intervention for best results.",
      ),
    status: z
      .enum(["RECRUITING", "ACTIVE_NOT_RECRUITING", "COMPLETED", "ALL"])
      .default("RECRUITING")
      .describe("Filter by trial status. RECRUITING shows currently enrolling trials."),
    pageSize: z.number().min(1).max(10).default(5).describe("Number of trials to return"),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        nctId: z.string().optional(),
        title: z.string().optional(),
        status: z.string().optional(),
        phase: z.string().optional(),
        studyType: z.string().optional(),
        conditions: z.array(z.string()).optional(),
        interventions: z.array(z.string()).optional(),
        eligibilityCriteria: z.string().optional(),
        sponsor: z.string().optional(),
        startDate: z.string().optional(),
        completionDate: z.string().optional(),
        enrollment: z.number().optional(),
        briefSummary: z.string().optional(),
      }),
    ),
    totalCount: z.number().optional(),
  }),
  execute: async ({ query, status, pageSize }) => {
    const statusFilter = status === "ALL" ? "" : `&filter.overallStatus=${status}`;
    const url = `${CT_BASE}/studies?query.term=${encodeURIComponent(query)}${statusFilter}&pageSize=${pageSize}&fields=NCTId,BriefTitle,OverallStatus,Phase,StudyType,Condition,InterventionName,EligibilityCriteria,LeadSponsorName,StartDate,CompletionDate,EnrollmentCount,BriefSummary`;

    const result = await fetchJSON(url);

    const results = (result.studies ?? []).map((study: any) => {
      const protocol = study.protocolSection ?? {};
      const identification = protocol.identificationModule ?? {};
      const statusModule = protocol.statusModule ?? {};
      const descriptionModule = protocol.descriptionModule ?? {};
      const designModule = protocol.designModule ?? {};
      const conditionsModule = protocol.conditionsModule ?? {};
      const eligibilityModule = protocol.eligibilityModule ?? {};
      const sponsorModule = protocol.sponsorCollaboratorsModule ?? {};

      return {
        nctId: identification.nctId ?? undefined,
        title: identification.briefTitle ?? undefined,
        status: statusModule.overallStatus ?? undefined,
        phase: designModule.phases?.join(", ") ?? undefined,
        studyType: designModule.studyType ?? undefined,
        conditions: conditionsModule.conditions ?? undefined,
        interventions: designModule.interventions?.map((i: any) => i.name ?? i).filter(Boolean) ?? undefined,
        eligibilityCriteria: eligibilityModule.eligibilityCriteria ?? undefined,
        sponsor: sponsorModule.leadSponsor?.name ?? undefined,
        startDate: statusModule.startDateStruct?.date ?? undefined,
        completionDate: statusModule.completionDateStruct?.date ?? undefined,
        enrollment: designModule.enrollmentInfo?.enrollmentCount
          ? parseInt(designModule.enrollmentInfo.enrollmentCount, 10)
          : undefined,
        briefSummary: descriptionModule.briefSummary ?? undefined,
      };
    });

    return {
      results,
      totalCount: result.totalCount ?? undefined,
    };
  },
});
