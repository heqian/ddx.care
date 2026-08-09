import { describe, test, expect } from "bun:test";

// These tests call live external APIs (RxNav, OpenFDA, etc.).
// They are skipped by default. Run with: RUN_INTEGRATION=1 bun test
const describeIntegration = process.env.RUN_INTEGRATION
  ? describe
  : describe.skip;

const RXNAV = "https://rxnav.nlm.nih.gov/REST";
const FDA = "https://api.fda.gov";
const CT = "https://clinicaltrials.gov/api/v2";
const MEDLINE = "https://wsearch.nlm.nih.gov/ws/query";

async function fetchJSON(url: string) {
  const res = await fetch(url);
  expect(res.ok).toBe(true);
  return res.json();
}

async function fetchText(url: string) {
  const res = await fetch(url);
  expect(res.ok).toBe(true);
  return res.text();
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

  test("substance toxicology returns data with real fields", async () => {
    const data = await fetchJSON(
      `${FDA}/other/substance.json?search=substance_name:ethylene+glycol&limit=1`,
    );
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBeGreaterThan(0);
    const r = data.results[0];
    expect(r.unii).toBeTruthy();
    expect(r.names).toBeInstanceOf(Array);
    expect(r.names.length).toBeGreaterThan(0);
    expect(r.names[0].name).toBeTruthy();
  });

  test("device adverse events searchable by device.generic_name", async () => {
    const data = await fetchJSON(
      `${FDA}/device/event.json?search=device.generic_name:pacemaker&limit=1`,
    );
    expect(data.meta.results.total).toBeGreaterThan(0);
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results[0].device).toBeInstanceOf(Array);
    expect(data.results[0].device[0].generic_name).toBeTruthy();
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

  test("countTotal=true returns totalCount", async () => {
    const data = await fetchJSON(
      `${CT}/studies?query.term=diabetes&pageSize=1&countTotal=true`,
    );
    expect(data.totalCount).toBeDefined();
    expect(data.totalCount).toBeGreaterThan(0);
  });
});

describeIntegration("MedlinePlus Web Service", () => {
  test("returns health topics for a condition text query", async () => {
    const xml = await fetchText(
      `${MEDLINE}?db=healthTopics&term=diabetes&retmax=3`,
    );
    expect(xml).toContain("<nlmSearchResult>");
    expect(xml).toContain("<count>");
    const count = Number(xml.match(/<count>(\d+)<\/count>/)?.[1] ?? 0);
    expect(count).toBeGreaterThan(0);
    expect(xml).toContain("<document");
  });
});
