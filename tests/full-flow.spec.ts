import { test, expect } from "@playwright/test";

test.describe("Full diagnosis flow", () => {
  test("submits a case and views the results", async ({ page }) => {
    // 1. Load the app and verify the form renders
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible();

    // 2. Fill the form (labels aren't linked via htmlFor, so use placeholders/roles)
    await page.getByPlaceholder("e.g., 45").fill("45");
    await page.getByRole("combobox").selectOption("Male");
    await page.getByPlaceholder(/Chest pain, shortness of breath/).fill("Severe headache with blurred vision");

    await page.getByPlaceholder(/Past diagnoses, medications/).fill(
      "Hypertension diagnosed 5 years ago. On lisinopril 10mg daily.",
    );
    await page.getByPlaceholder(/Doctor-patient encounter/).fill(
      "The individual reports a severe headache for 3 days. Clinician asked about vision changes. Confirmed blurred vision present.",
    );
    await page.getByPlaceholder(/Blood panels, urinalysis/).fill("BP: 180/110. HR: 90.");

    // 3. Submit — click the submit button, then confirm in the PII modal
    await page.getByRole("button", { name: "Submit for Diagnosis" }).click();
    await expect(page.getByRole("heading", { name: "Privacy Reminder" })).toBeVisible();
    await page.getByRole("button", { name: "I Understand — Submit" }).click();

    // 4. Waiting room should appear (briefly — mock completes quickly)
    await expect(page.getByRole("heading", { name: "Analyzing Case..." })).toBeVisible({
      timeout: 10_000,
    });

    // 5. Results view — transition happens after the mock workflow completes
    await expect(page.getByRole("heading", { name: "Differential Diagnosis" })).toBeVisible({
      timeout: 15_000,
    });

    // Verify key UI elements in the results
    await expect(page.getByText("Severe headache with blurred vision")).toBeVisible();

    // Diagnosis cards
    await expect(page.getByRole("heading", { name: "Hypertensive Urgency" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Migraine with Aura" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tension-Type Headache" })).toBeVisible();

    // Urgency badge
    await expect(page.getByText("Emergent")).toBeVisible();

    // Cross-specialty observations
    await expect(page.getByText("Cross-Specialty Observations")).toBeVisible();

    // Recommended actions
    await expect(page.getByText("Recommended Immediate Actions")).toBeVisible();

    // Disclaimer
    await expect(page.getByText("AI-generated report")).toBeVisible();

    // 6. Verify the "New Case" button returns to the form
    await page.getByRole("button", { name: "New Case" }).click();
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible();
  });
});
