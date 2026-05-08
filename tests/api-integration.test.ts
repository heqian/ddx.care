import { describe, test, expect } from "bun:test";

// These tests call live external APIs (RxNav, OpenFDA, etc.).
// They are skipped by default. Run with: RUN_INTEGRATION=1 bun test
const describeIntegration = process.env.RUN_INTEGRATION
  ? describe
  : describe.skip;

const RXNAV = "https://rxnav.nlm.nih.gov/REST";
const FDA = "https://api.fda.gov";
const CT = "https://clinicaltrials.gov/api/v2";
const MEDLINE = "https://connect.medlineplus.gov/service";

async function fetchJSON(url: string) {
  const res = await fetch(url);
  expect(res.ok).toBe(true);
  return res.json();
}

describeIntegration("RxNav Drug API", () => {
  test("drug lookup returns RxCUI for a known drug", async () => {
    const data = await fetchJSON(`${RXNAV}/drugs.json?name=metformin`);
    expect(data.drugGroup).toBeDefined();
    expect(data.drugGroup.conceptGroup).toBeInstanceOf(Array);
    const allProps = data.drugGroup.conceptGroup.flatMap(
      (cg: any) => cg.conceptProperties ?? [],
    );
    const withRxCUI = allProps.filter((p: any) => p.rxcui);
    expect(withRxCUI.length).toBeGreaterThan(0);
  });

  test("spelling suggestions correct misspelled drug names", async () => {
    const data = await fetchJSON(
      `${RXNAV}/spellingsuggestions.json?name=aspririn`,
    );
    expect(data.suggestionGroup.suggestionList.suggestion).toContain("aspirin");
  });

  test("RxCUI lookup returns ID for a known drug", async () => {
    const data = await fetchJSON(`${RXNAV}/rxcui.json?name=warfarin`);
    expect(data.idGroup.rxnormId).toBeInstanceOf(Array);
    expect(data.idGroup.rxnormId[0]).toBe("11289");
  });
});

describeIntegration("OpenFDA API", () => {
  test("adverse events returns reports for a known drug", async () => {
    const data = await fetchJSON(
      `${FDA}/drug/event.json?search=patient.drug.medicinalproduct:metformin&limit=1`,
    );
    expect(data.meta.results.total).toBeGreaterThan(0);
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBe(1);
  });

  test("drug labeling returns package insert data", async () => {
    const data = await fetchJSON(
      `${FDA}/drug/label.json?search=openfda.generic_name:metformin&limit=1`,
    );
    expect(data.meta.results.total).toBeGreaterThan(0);
    expect(data.results[0].openfda.generic_name).toBeDefined();
  });

  test("drug enforcement returns recall data", async () => {
    const data = await fetchJSON(`${FDA}/drug/enforcement.json?limit=1`);
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results[0].recall_number).toBeTruthy();
  });

  test("substance toxicology returns data", async () => {
    const data = await fetchJSON(
      `${FDA}/other/substance.json?search=substance_name:ethylene+glycol&limit=1`,
    );
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBeGreaterThan(0);
  });
});

describeIntegration("ClinicalTrials.gov API v2", () => {
  test("search returns trials for a condition", async () => {
    const data = await fetchJSON(
      `${CT}/studies?query.term=diabetes&pageSize=2`,
    );
    expect(data.studies).toBeInstanceOf(Array);
    expect(data.studies.length).toBeGreaterThan(0);
    expect(
      data.studies[0].protocolSection.identificationModule.nctId,
    ).toBeTruthy();
  });
});

describeIntegration("MedlinePlus Connect API", () => {
  test("returns health info for a condition", async () => {
    const url = `${MEDLINE}?mainSearchCriteria.v.cs=2.16.840.1.113883.6.103&mainSearchCriteria.v.dn=diabetes&knowledgeResponseType=application/json`;
    const data = await fetchJSON(url);
    expect(data.feed).toBeDefined();
  });
});
