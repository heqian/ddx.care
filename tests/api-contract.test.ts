/**
 * API Contract Tests
 *
 * These tests fetch one real record from each external API and assert the
 * exact response fields that the tools read. Unlike unit tests (which mock
 * API shapes) these catch **API drift** — when an upstream provider changes
 * their response schema, breaking a tool that was written against the old
 * shape.
 *
 * Each test documents which tool reads which fields, so a failure here
 * points directly at the tool that needs updating.
 *
 * Run: RUN_CONTRACT=1 bun test tests/api-contract.test.ts
 * (Skipped by default. Runs on a schedule in GitHub CI.)
 */

import { describe, test, expect } from "bun:test";

const describeContract = process.env.RUN_CONTRACT ? describe : describe.skip;

const RXNAV = "https://rxnav.nlm.nih.gov/REST";
const FDA = "https://api.fda.gov";
const CT = "https://clinicaltrials.gov/api/v2";
const MEDLINE = "https://wsearch.nlm.nih.gov/ws/query";
const NLM = "https://clinicaltables.nlm.nih.gov/api";
const ORPHADATA = "https://api.orphadata.com";

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

// ---------------------------------------------------------------------------
// RxNav — used by drug-lookup, drug-interaction, drug-spelling-suggestion
// ---------------------------------------------------------------------------

describeContract(
  "RxNav /drugs.json contract (drug-lookup, drug-interaction)",
  () => {
    test("response has drugGroup.conceptGroup[].conceptProperties[].rxcui+name+tty", async () => {
      const data = await fetchJSON(`${RXNAV}/drugs.json?name=metformin`);
      expect(data.drugGroup).toBeDefined();
      const groups = data.drugGroup.conceptGroup;
      expect(Array.isArray(groups)).toBe(true);
      expect(groups.length).toBeGreaterThan(0);

      // Find at least one concept property with the fields the tools read
      const allProps = groups.flatMap((g: any) => g.conceptProperties ?? []);
      expect(allProps.length).toBeGreaterThan(0);
      const withRxcui = allProps.filter((p: any) => p.rxcui && p.name && p.tty);
      expect(withRxcui.length).toBeGreaterThan(0);
    });
  },
);

describeContract(
  "RxNav /spellingsuggestions.json contract (drug-spelling)",
  () => {
    test("response has suggestionGroup.suggestionList.suggestion[]", async () => {
      const data = await fetchJSON(
        `${RXNAV}/spellingsuggestions.json?name=aspririn`,
      );
      expect(data.suggestionGroup).toBeDefined();
      expect(data.suggestionGroup.suggestionList).toBeDefined();
      expect(
        Array.isArray(data.suggestionGroup.suggestionList.suggestion),
      ).toBe(true);
      expect(data.suggestionGroup.suggestionList.suggestion).toContain(
        "aspirin",
      );
    });
  },
);

// ---------------------------------------------------------------------------
// OpenFDA — used by adverse-events, drug-labeling, drug-recall,
// substance-toxicology, drug-shortages, food-adverse-events, device-adverse-events
// ---------------------------------------------------------------------------

describeContract("OpenFDA /drug/event.json contract (adverse-events)", () => {
  test("results have safetyreportid + patient.reaction[].reactionmeddrapt", async () => {
    const data = await fetchJSON(
      `${FDA}/drug/event.json?search=patient.drug.medicinalproduct:metformin&limit=1`,
    );
    expect(data.meta.results.total).toBeGreaterThan(0);
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBe(1);
    const r = data.results[0];
    // Fields the tool reads:
    expect(r.safetyreportid).toBeTruthy();
    expect(r.patient).toBeDefined();
    expect(Array.isArray(r.patient.reaction)).toBe(true);
    if (r.patient.reaction.length > 0) {
      expect(r.patient.reaction[0].reactionmeddrapt).toBeDefined();
    }
  });
});

describeContract(
  "OpenFDA /drug/label.json contract (drug-labeling, drug-interaction)",
  () => {
    test("results have openfda.generic_name + drug_interactions[]", async () => {
      const data = await fetchJSON(
        `${FDA}/drug/label.json?search=openfda.generic_name:warfarin&limit=1`,
      );
      expect(data.meta.results.total).toBeGreaterThan(0);
      const r = data.results[0];
      // Fields the tools read:
      expect(r.openfda).toBeDefined();
      expect(Array.isArray(r.openfda.generic_name)).toBe(true);
      expect(r.openfda.generic_name.length).toBeGreaterThan(0);
      // drug_interactions is the key field for the interaction tool
      expect(Array.isArray(r.drug_interactions)).toBe(true);
    });

    test("openfda.rxcui is populated for some labels (drug-interaction primary lookup)", async () => {
      // The drug-interaction tool's primary lookup is openfda.rxcui. Verify
      // that at least some label records have this field.
      const data = await fetchJSON(
        `${FDA}/drug/label.json?search=openfda.generic_name:warfarin&limit=5`,
      );
      const withRxcui = data.results.filter(
        (r: any) => r.openfda?.rxcui && r.openfda.rxcui.length > 0,
      );
      expect(withRxcui.length).toBeGreaterThan(0);
    });
  },
);

describeContract(
  "OpenFDA /drug/enforcement.json contract (drug-recall)",
  () => {
    test("results have recall_number + product_description", async () => {
      const data = await fetchJSON(`${FDA}/drug/enforcement.json?limit=1`);
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results.length).toBe(1);
      const r = data.results[0];
      expect(r.recall_number).toBeTruthy();
      expect(r.product_description).toBeTruthy();
    });
  },
);

describeContract(
  "OpenFDA /other/substance.json contract (substance-toxicology)",
  () => {
    test("results have unii + names[].name + codes[].code (NOT substance_id)", async () => {
      const data = await fetchJSON(
        `${FDA}/other/substance.json?search=substance_name:ethylene+glycol&limit=1`,
      );
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results.length).toBeGreaterThan(0);
      const r = data.results[0];
      // Fields the tool reads (after fix):
      expect(r.unii).toBeTruthy();
      expect(Array.isArray(r.names)).toBe(true);
      expect(r.names.length).toBeGreaterThan(0);
      expect(r.names[0].name).toBeTruthy();
      expect(Array.isArray(r.codes)).toBe(true);
      // Fields the tool NO LONGER reads (regression guard):
      expect(r.substance_id).toBeUndefined();
      expect(r.substance_name).toBeUndefined();
      expect(r.approval_id).toBeUndefined();
    });
  },
);

describeContract(
  "OpenFDA /drug/shortages.json contract (drug-shortages)",
  () => {
    test("results have generic_name + status (when shortages exist)", async () => {
      const data = await fetchJSON(`${FDA}/drug/shortages.json?limit=5`);
      if (data.results && data.results.length > 0) {
        const r = data.results[0];
        // Fields the tool reads (generic_name is always present; availability
        // and shortage_reason are optional on some records):
        expect(r.generic_name ?? r.openfda?.generic_name).toBeTruthy();
        expect(r.status).toBeDefined();
      }
      // If no results, the tool returns "No drug shortage data found" — valid.
    });
  },
);

describeContract(
  "OpenFDA /food/event.json contract (food-adverse-events)",
  () => {
    test("results have report_number + reactions[] + products[].name_brand", async () => {
      const data = await fetchJSON(
        `${FDA}/food/event.json?search=products.name_brand:centrum&limit=1`,
      );
      expect(data.meta.results.total).toBeGreaterThan(0);
      const r = data.results[0];
      expect(r.report_number).toBeTruthy();
      expect(Array.isArray(r.reactions)).toBe(true);
      expect(Array.isArray(r.products)).toBe(true);
      if (r.products.length > 0) {
        expect(r.products[0].name_brand).toBeDefined();
      }
    });
  },
);

describeContract(
  "OpenFDA /device/event.json contract (device-adverse-events)",
  () => {
    test("results have device[].generic_name (NOT openfda.device_name)", async () => {
      const data = await fetchJSON(
        `${FDA}/device/event.json?search=device.generic_name:pacemaker&limit=1`,
      );
      expect(data.meta.results.total).toBeGreaterThan(0);
      const r = data.results[0];
      // Fields the tool reads (after fix):
      expect(Array.isArray(r.device)).toBe(true);
      expect(r.device.length).toBeGreaterThan(0);
      expect(r.device[0].generic_name).toBeTruthy();
      expect(r.report_number).toBeTruthy();
      expect(r.event_type).toBeDefined();
      // Regression guard: openfda.device_name is NOT populated (was the old bug)
      expect(r.openfda?.device_name).toBeUndefined();
    });
  },
);

// ---------------------------------------------------------------------------
// ClinicalTrials.gov — used by clinical-trials-search
// ---------------------------------------------------------------------------

describeContract(
  "ClinicalTrials.gov v2 contract (clinical-trials-search)",
  () => {
    test("studies have protocolSection.identificationModule.nctId", async () => {
      const data = await fetchJSON(
        `${CT}/studies?query.term=diabetes&pageSize=1`,
      );
      expect(data.studies).toBeInstanceOf(Array);
      expect(data.studies.length).toBeGreaterThan(0);
      const s = data.studies[0];
      expect(s.protocolSection).toBeDefined();
      expect(s.protocolSection.identificationModule).toBeDefined();
      expect(s.protocolSection.identificationModule.nctId).toBeTruthy();
    });

    test("countTotal=true returns totalCount (drug-interaction relies on this)", async () => {
      const data = await fetchJSON(
        `${CT}/studies?query.term=diabetes&pageSize=1&countTotal=true`,
      );
      expect(data.totalCount).toBeDefined();
      expect(typeof data.totalCount).toBe("number");
      expect(data.totalCount).toBeGreaterThan(0);
    });
  },
);

// ---------------------------------------------------------------------------
// MedlinePlus Web Service — used by medlineplus-search
// ---------------------------------------------------------------------------

describeContract(
  "MedlinePlus Web Service contract (medlineplus-search)",
  () => {
    test("XML has document[].content[name=title/FullSummary] + url attr", async () => {
      const xml = await fetchText(
        `${MEDLINE}?db=healthTopics&term=diabetes&retmax=1`,
      );
      expect(xml).toContain("<nlmSearchResult>");
      expect(xml).toContain("<count>");
      const count = Number(xml.match(/<count>(\d+)<\/count>/)?.[1] ?? 0);
      expect(count).toBeGreaterThan(0);
      expect(xml).toContain("<document");
      // The tool parses: <document url="..."> + <content name="title">
      expect(xml).toContain('name="title"');
      // FullSummary or snippet (tool falls back to snippet)
      expect(
        xml.includes('name="FullSummary"') || xml.includes('name="snippet"'),
      ).toBe(true);
    });

    test("empty query returns count=0 (no documents)", async () => {
      const xml = await fetchText(
        `${MEDLINE}?db=healthTopics&term=zzznonexistentcondition12345&retmax=1`,
      );
      const count = Number(xml.match(/<count>(\d+)<\/count>/)?.[1] ?? -1);
      expect(count).toBe(0);
      expect(xml).not.toContain("<document");
    });
  },
);

// ---------------------------------------------------------------------------
// NLM Clinical Tables — used by hpo-term-search, loinc-test-lookup
// ---------------------------------------------------------------------------

describeContract("NLM HPO contract (hpo-term-search)", () => {
  test("response is [count, headers, null, rows[]] tuple with HPO fields", async () => {
    const data = await fetchJSON(
      `${NLM}/hpo/v3/search?terms=macrocephaly&maxList=1`,
    );
    // NLM Clinical Tables returns a tuple: [total, headers, null, rows]
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(4);
    expect(typeof data[0]).toBe("number");
    expect(data[0]).toBeGreaterThan(0);
    expect(Array.isArray(data[3])).toBe(true);
    expect(data[3].length).toBeGreaterThan(0);
    // Each row is [hpoId, name] — the fields the tool reads
    const row = data[3][0];
    expect(row[0]).toMatch(/^HP:/);
    expect(typeof row[1]).toBe("string");
  });
});

describeContract("NLM LOINC contract (loinc-test-lookup)", () => {
  test("response rows have [LOINC_NUM, COMPONENT, SYSTEM, METHOD_TYP]", async () => {
    const data = await fetchJSON(
      `${NLM}/loinc_items/v3/search?terms=hemoglobin&maxList=1&df=LOINC_NUM,COMPONENT,SYSTEM,METHOD_TYP`,
    );
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toBeGreaterThan(0);
    expect(Array.isArray(data[3])).toBe(true);
    expect(data[3].length).toBeGreaterThan(0);
    const row = data[3][0];
    // LOINC code format: N-N or NNNN-N
    expect(row[0]).toMatch(/^\d+-\d+$/);
    expect(typeof row[1]).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Orphadata — used by rare-disease-search, rare-disease-genes,
// rare-disease-phenotypes
// ---------------------------------------------------------------------------

describeContract(
  "Orphadata disease list contract (rare-disease-search)",
  () => {
    test("results have ORPHAcode + Preferred term", async () => {
      const data = await fetchJSON(
        `${ORPHADATA}/rd-cross-referencing/orphacodes?lang=en`,
      );
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data.results)).toBe(true);
      expect(data.data.results.length).toBeGreaterThan(0);
      const r = data.data.results[0];
      expect(typeof r.ORPHAcode).toBe("number");
      expect(typeof r["Preferred term"]).toBe("string");
    });
  },
);

describeContract("Orphadata genes contract (rare-disease-genes)", () => {
  test("results have DisorderGeneAssociation[].Gene.Symbol", async () => {
    // Use an ORPHAcode known to have gene data (verified in live testing)
    const data = await fetchJSON(
      `${ORPHADATA}/rd-associated-genes/orphacodes/166024?lang=en`,
    );
    expect(data.data).toBeDefined();
    expect(data.data.results).toBeDefined();
    const assoc = data.data.results.DisorderGeneAssociation;
    expect(Array.isArray(assoc)).toBe(true);
    expect(assoc.length).toBeGreaterThan(0);
    expect(assoc[0].Gene).toBeDefined();
    expect(assoc[0].Gene.Symbol).toBeTruthy();
    expect(typeof assoc[0].DisorderGeneAssociationType).toBe("string");
  });
});

describeContract(
  "Orphadata phenotypes contract (rare-disease-phenotypes)",
  () => {
    test("results have Disorder.HPODisorderAssociation[].HPO.HPOId", async () => {
      // Use ORPHA 558 (Marfan) — verified to have 68 phenotype associations
      const data = await fetchJSON(
        `${ORPHADATA}/rd-phenotypes/orphacodes/558?lang=en`,
      );
      expect(data.data).toBeDefined();
      expect(data.data.results).toBeDefined();
      const assoc = data.data.results.Disorder?.HPODisorderAssociation;
      expect(Array.isArray(assoc)).toBe(true);
      expect(assoc.length).toBeGreaterThan(0);
      expect(assoc[0].HPO).toBeDefined();
      expect(assoc[0].HPO.HPOId).toMatch(/^HP:/);
      expect(typeof assoc[0].HPO.HPOTerm).toBe("string");
    });
  },
);
