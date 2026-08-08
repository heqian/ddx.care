export interface DrugInteractionRegressionCase {
  id: string;
  drugNames: [string, string];
  rxcuis: [string, string];
  labelInteractionText: [string, string];
  expectedStatus: "found" | "none_found";
  reviewNote: string;
}

/**
 * Clinician-reviewed cases for label-text regression behavior. A negative case
 * means no literal cross-mention in the supplied labels, not clinical clearance.
 */
export const clinicianReviewedDrugInteractionCases: DrugInteractionRegressionCase[] =
  [
    {
      id: "aspirin-warfarin-positive",
      drugNames: ["aspirin", "warfarin"],
      rxcuis: ["1191", "11289"],
      labelInteractionText: [
        "Concomitant use of aspirin with warfarin may increase bleeding risk.",
        "Warfarin used with aspirin may increase bleeding risk.",
      ],
      expectedStatus: "found",
      reviewNote:
        "The expected positive is limited to a literal FDA-label cross-mention.",
    },
    {
      id: "acetaminophen-loratadine-label-negative",
      drugNames: ["acetaminophen", "loratadine"],
      rxcuis: ["161", "28889"],
      labelInteractionText: [
        "Use only as directed and do not exceed the recommended dose.",
        "Use as directed for temporary relief of allergy symptoms.",
      ],
      expectedStatus: "none_found",
      reviewNote:
        "The expected negative only asserts no literal cross-mention in these fixtures.",
    },
  ];
