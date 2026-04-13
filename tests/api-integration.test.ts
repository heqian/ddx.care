import { describe, test, expect } from "bun:test";

// These tests call live external APIs (PubMed, RxNav, OpenFDA, etc.).
// They are skipped by default. Run with: RUN_INTEGRATION=1 bun test
const describeIntegration = process.env.RUN_INTEGRATION
  ? describe
  : describe.skip;

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const RXNAV = "https://rxnav.nlm.nih.gov/REST";
const FDA = "https://api.fda.gov";
const CT = "https://clinicaltrials.gov/api/v2";
const MEDLINE = "https://connect.medlineplus.gov/service";

async function fetchJSON(url: string) {
  // NCBI rate limits to 3 req/sec without API key — add delay between calls
  if (url.includes("eutils.ncbi")) {
    await new Promise((r) => setTimeout(r, 350));
  }
  const res = await fetch(url);
  if (!res.ok && url.includes("eutils.ncbi")) {
    await new Promise((r) => setTimeout(r, 1000));
    const retry = await fetch(url);
    expect(retry.ok).toBe(true);
    return retry.json();
  }
  expect(res.ok).toBe(true);
  return res.json();
}

describeIntegration("PubMed / NCBI E-utilities", () => {
  test("esearch returns results for a medical query", async () => {
    const data = await fetchJSON(
      `${EUTILS}/esearch.fcgi?db=pubmed&term=sepsis+treatment&retmax=3&retmode=json`,
    );
    expect(data.esearchresult.idlist.length).toBeGreaterThan(0);
    expect(parseInt(data.esearchresult.count)).toBeGreaterThan(0);
  });

  test("esummary returns article metadata", async () => {
    const data = await fetchJSON(
      `${EUTILS}/esummary.fcgi?db=pubmed&id=41934189&retmode=json`,
    );
    const article = data.result["41934189"];
    expect(article.title).toBeTruthy();
    expect(article.authors).toBeInstanceOf(Array);
  });

  test("OMIM search returns genetic conditions", async () => {
    const data = await fetchJSON(
      `${EUTILS}/esearch.fcgi?db=omim&term=%22cystic+fibrosis%22&retmax=3&retmode=json`,
    );
    expect(data.esearchresult.idlist.length).toBeGreaterThan(0);
  });

  test("ClinVar search returns genetic variants", async () => {
    const data = await fetchJSON(
      `${EUTILS}/esearch.fcgi?db=clinvar&term=BRCA1&retmax=3&retmode=json`,
    );
    expect(data.esearchresult.idlist.length).toBeGreaterThan(0);
  });

  test("GeneReviews search returns results", async () => {
    const data = await fetchJSON(
      `${EUTILS}/esearch.fcgi?db=books&term=%22Huntington+disease%22+GeneReviews&retmax=3&retmode=json`,
    );
    expect(data.esearchresult.idlist.length).toBeGreaterThan(0);
  });
});

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
