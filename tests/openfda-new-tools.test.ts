import { test, expect, describe, afterEach, vi } from "bun:test";
import { resetToolCache } from "../src/backend/tools/utils/tool-cache";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetToolCache();
});

describe("drugShortagesTool", () => {
  test("returns parsed shortage records", async () => {
    const { drugShortagesTool } = await import("../src/backend/tools/open-fda");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            generic_name: "Furosemide Injection",
            availability: "Unavailable",
            shortage_reason: "Manufacturing delay",
            status: "Current",
            company_name: "Pharma Inc",
            presentation: "Furosemide, Injection, 10 mg/1 mL",
            therapeutic_category: ["Cardiovascular"],
            update_date: "04/24/2026",
            openfda: {
              brand_name: ["FUROSEMIDE"],
              generic_name: ["FUROSEMIDE"],
              manufacturer_name: ["Accord Healthcare, Inc."],
            },
          },
        ],
      }),
    }) as any;

    const result = await drugShortagesTool.execute({
      drugName: "furosemide",
      limit: 5,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].genericName).toBe("Furosemide Injection");
    expect(result.data.results[0].availability).toBe("Unavailable");
    expect(result.data.results[0].reason).toBe("Manufacturing delay");
    expect(result.data.results[0].status).toBe("Current");
    expect(result.data.results[0].company).toBe("Pharma Inc");
    expect(result.data.results[0].presentation).toBe(
      "Furosemide, Injection, 10 mg/1 mL",
    );
    expect(result.data.results[0].therapeuticCategory).toEqual([
      "Cardiovascular",
    ]);
    expect(result.data.results[0].updateDate).toBe("04/24/2026");
  });

  test("falls back to openfda fields when top-level missing", async () => {
    const { drugShortagesTool } = await import("../src/backend/tools/open-fda");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            status: "Resolved",
            openfda: {
              brand_name: ["LIPITOR"],
              generic_name: ["ATORVASTATIN"],
              manufacturer_name: ["Pfizer"],
            },
          },
        ],
      }),
    }) as any;

    const result = await drugShortagesTool.execute({
      drugName: "lipitor",
      limit: 5,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results[0].brandName).toBe("LIPITOR");
    expect(result.data.results[0].genericName).toBe("ATORVASTATIN");
    expect(result.data.results[0].company).toBe("Pfizer");
  });

  test("handles 404 (no shortage data)", async () => {
    const { drugShortagesTool } = await import("../src/backend/tools/open-fda");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }) as any;

    const result = await drugShortagesTool.execute({
      drugName: "unknown",
      limit: 5,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("No drug shortage data found.");
    expect(result.retriable).toBe(false);
  });

  test("handles empty results array", async () => {
    const { drugShortagesTool } = await import("../src/backend/tools/open-fda");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    }) as any;

    const result = await drugShortagesTool.execute({
      drugName: "aspirin",
      limit: 5,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toEqual([]);
  });
});

describe("foodAdverseEventsTool", () => {
  test("returns parsed food adverse event reports", async () => {
    const { foodAdverseEventsTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            report_number: "149779",
            outcomes: ["Other Serious or Important Medical Event"],
            reactions: ["CHOKING", "COUGH"],
            date_started: "20120229",
            consumer: { age: "89", age_unit: "year(s)", gender: "Female" },
            products: [
              {
                role: "SUSPECT",
                name_brand: "CENTRUM SILVER",
                industry_name: "Vit/Min/Prot/Unconv Diet",
              },
            ],
          },
        ],
      }),
    }) as any;

    const result = await foodAdverseEventsTool.execute({
      productName: "centrum",
      limit: 5,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].reportNumber).toBe("149779");
    expect(result.data.results[0].reactions).toEqual(["CHOKING", "COUGH"]);
    expect(result.data.results[0].outcomes).toEqual([
      "Other Serious or Important Medical Event",
    ]);
    expect(result.data.results[0].consumerAge).toBe("89 year(s)");
    expect(result.data.results[0].consumerGender).toBe("Female");
    expect(result.data.results[0].products).toHaveLength(1);
    expect(result.data.results[0].products![0].name).toBe("CENTRUM SILVER");
    expect(result.data.results[0].products![0].industry).toBe(
      "Vit/Min/Prot/Unconv Diet",
    );
    expect(result.data.results[0].dateStarted).toBe("20120229");
  });

  test("handles report with missing consumer info", async () => {
    const { foodAdverseEventsTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            report_number: "R001",
            reactions: ["NAUSEA"],
            outcomes: [],
          },
        ],
      }),
    }) as any;

    const result = await foodAdverseEventsTool.execute({
      productName: "test",
      limit: 5,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results[0].consumerAge).toBeUndefined();
    expect(result.data.results[0].consumerGender).toBeUndefined();
    expect(result.data.results[0].products).toEqual([]);
  });

  test("handles 404 (no food events)", async () => {
    const { foodAdverseEventsTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }) as any;

    const result = await foodAdverseEventsTool.execute({
      productName: "unknown",
      limit: 5,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("No food adverse event reports found.");
    expect(result.retriable).toBe(false);
  });

  test("handles empty results", async () => {
    const { foodAdverseEventsTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    }) as any;

    const result = await foodAdverseEventsTool.execute({
      productName: "test",
      limit: 5,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toEqual([]);
  });

  test("handles consumer with age but no age_unit", async () => {
    const { foodAdverseEventsTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            report_number: "R002",
            reactions: [],
            outcomes: [],
            consumer: { age: "45" },
          },
        ],
      }),
    }) as any;

    const result = await foodAdverseEventsTool.execute({
      productName: "test",
      limit: 5,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results[0].consumerAge).toBe("45");
  });
});

describe("deviceAdverseEventsTool", () => {
  test("returns parsed device adverse event reports", async () => {
    const { deviceAdverseEventsTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            report_number: "10",
            event_type: "Injury",
            event_location: "HOSPITAL",
            date_of_event: "19920220",
            date_received: "19920310",
            device: [
              {
                generic_name: "ELECTRODE, PACEMAKER, PERMANENT",
                brand_name: "CAPSUREFIX",
                device_report_product_code: "DTB",
              },
            ],
            patient: {
              patient_problems: ["Burn", "Infection"],
            },
            openfda: {
              medical_specialty_description: ["Cardiovascular"],
            },
          },
        ],
      }),
    }) as any;

    const result = await deviceAdverseEventsTool.execute({
      deviceName: "pacemaker",
      limit: 5,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].reportNumber).toBe("10");
    expect(result.data.results[0].eventType).toBe("Injury");
    expect(result.data.results[0].deviceName).toBe(
      "ELECTRODE, PACEMAKER, PERMANENT",
    );
    expect(result.data.results[0].medicalSpecialty).toBe("Cardiovascular");
    expect(result.data.results[0].patientProblems).toEqual([
      "Burn",
      "Infection",
    ]);
    expect(result.data.results[0].eventLocation).toBe("HOSPITAL");
    expect(result.data.results[0].dateOfEvent).toBe("19920220");
    expect(result.data.results[0].dateReceived).toBe("19920310");
  });

  test("falls back to brand_name when generic_name absent", async () => {
    const { deviceAdverseEventsTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            report_number: "11",
            event_type: "Malfunction",
            device: [{ brand_name: "Medtronic Pace-O-Matic" }],
            patient: {},
          },
        ],
      }),
    }) as any;

    const result = await deviceAdverseEventsTool.execute({
      deviceName: "pacemaker",
      limit: 5,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results[0].deviceName).toBe("Medtronic Pace-O-Matic");
  });

  test("handles report with missing device array", async () => {
    const { deviceAdverseEventsTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            report_number: "11",
            event_type: "Malfunction",
            patient: {},
          },
        ],
      }),
    }) as any;

    const result = await deviceAdverseEventsTool.execute({
      deviceName: "test",
      limit: 5,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results[0].deviceName).toBeUndefined();
    expect(result.data.results[0].medicalSpecialty).toBeUndefined();
    expect(result.data.results[0].patientProblems).toEqual([]);
  });

  test("handles 404 (no device events)", async () => {
    const { deviceAdverseEventsTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }) as any;

    const result = await deviceAdverseEventsTool.execute({
      deviceName: "unknown",
      limit: 5,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("No device adverse event reports found.");
    expect(result.retriable).toBe(false);
  });

  test("handles empty results", async () => {
    const { deviceAdverseEventsTool } = await import(
      "../src/backend/tools/open-fda"
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    }) as any;

    const result = await deviceAdverseEventsTool.execute({
      deviceName: "test",
      limit: 5,
    });
    if (!result.ok) throw new Error(`Tool failed: ${result.error}`);
    expect(result.data.results).toEqual([]);
  });
});
