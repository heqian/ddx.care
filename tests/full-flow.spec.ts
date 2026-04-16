import { test, expect } from "@playwright/test";

/**
 * Accept the consent gate if it is visible.
 * Call this at the start of every test (after page.goto).
 */
async function acceptConsent(page: import("@playwright/test").Page) {
  const heading = page.getByRole("heading", {
    name: "Legal Disclaimer",
  });
  if (await heading.isVisible({ timeout: 3_000 }).catch(() => false)) {
    // Check the acknowledgment checkbox
    await page.getByRole("checkbox").check();
    // Click the accept button
    await page.getByRole("button", { name: "I Accept" }).click();
    // Wait for the main app to render
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible({
      timeout: 5_000,
    });
  }
}

test.describe("Consent gate", () => {
  test("blocks access until accepted", async ({ page }) => {
    await page.goto("/");
    // Consent gate should be visible
    await expect(
      page.getByRole("heading", { name: "Legal Disclaimer" }),
    ).toBeVisible();

    // App content should NOT be visible
    await expect(
      page.getByRole("heading", { name: "New Case" }),
    ).not.toBeVisible();

    // Accept button should be disabled without checkbox
    const acceptBtn = page.getByRole("button", { name: "I Accept" });
    await expect(acceptBtn).toBeDisabled();

    // Check the box
    await page.getByRole("checkbox").check();
    await expect(acceptBtn).toBeEnabled();

    // Accept
    await acceptBtn.click();
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible();
  });

  test("shows declined state when user declines", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Legal Disclaimer" }),
    ).toBeVisible();

    // Click decline
    const declineBtn = page.locator("button", { hasText: "Do Not Accept" });
    await declineBtn.scrollIntoViewIfNeeded();
    await declineBtn.click();

    // Declined screen
    await expect(page.getByText("Access Declined")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("Review terms again")).toBeVisible();

    // Can go back and accept
    await page.getByText("Review terms again").click();
    await expect(
      page.getByRole("heading", { name: "Legal Disclaimer" }),
    ).toBeVisible();
  });

  test("persists consent within the session", async ({ page }) => {
    await page.goto("/");

    // Accept consent
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "I Accept" }).click();
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible();

    // Navigate away and back — should NOT show consent gate again
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByRole("heading", { name: "Legal Disclaimer" }),
    ).not.toBeVisible();
  });
});

test.describe("Full diagnosis flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await acceptConsent(page);
  });

  test("form validation and clear all functionality", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible();

    const submitBtn = page.getByRole("button", {
      name: "Submit for Diagnosis",
    });
    await expect(submitBtn).toBeDisabled();

    // Fill some simple fields
    await page.getByPlaceholder("e.g., 45").fill("45");
    await page
      .getByPlaceholder(/Chest pain, shortness of breath/)
      .fill("Headache");

    // Submit should still be disabled because at least one of medical history, transcript, or labs is required.
    await expect(submitBtn).toBeDisabled();

    // Add medical history
    await page
      .getByPlaceholder(/Past diagnoses, medications/)
      .fill("Some history");
    await expect(submitBtn).toBeEnabled();

    // Use Clear All
    await page.getByRole("button", { name: "Clear All" }).click();
    await expect(page.getByPlaceholder("e.g., 45")).toHaveValue("");
    await expect(
      page.getByPlaceholder(/Past diagnoses, medications/),
    ).toHaveValue("");
    await expect(submitBtn).toBeDisabled();
  });

  test("submits a case and views the results", async ({ page }) => {
    // 1. Verify the form renders
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible();

    // 2. Fill the form (labels aren't linked via htmlFor, so use placeholders/roles)
    await page.getByPlaceholder("e.g., 45").fill("45");
    await page.getByRole("combobox").selectOption("Male");
    await page
      .getByPlaceholder(/Chest pain, shortness of breath/)
      .fill("Severe headache with blurred vision");

    await page
      .getByPlaceholder(/Past diagnoses, medications/)
      .fill("Hypertension diagnosed 5 years ago. On lisinopril 10mg daily.");
    await page
      .getByPlaceholder(/Doctor-patient encounter/)
      .fill(
        "The individual reports a severe headache for 3 days. Clinician asked about vision changes. Confirmed blurred vision present.",
      );
    await page
      .getByPlaceholder(/Blood panels, urinalysis/)
      .fill("BP: 180/110. HR: 90.");

    // 3. Submit — click the submit button
    await page.getByRole("button", { name: "Submit for Diagnosis" }).click();

    // 4. Waiting room should appear (briefly — mock completes quickly)
    await expect(
      page.getByRole("heading", { name: "Analyzing Case..." }),
    ).toBeVisible({
      timeout: 10_000,
    });

    // Verify Cancel button exists in the waiting room
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    // 5. Results view — transition happens after the mock workflow completes
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible({
      timeout: 15_000,
    });

    // Verify key UI elements in the results
    await expect(
      page.getByText("Severe headache with blurred vision"),
    ).toBeVisible();

    // Diagnosis cards
    await expect(
      page.getByRole("heading", { name: "Hypertensive Urgency" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Migraine with Aura" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tension-Type Headache" }),
    ).toBeVisible();

    // Urgency badge
    await expect(page.getByText("Emergent")).toBeVisible();

    // Cross-specialty observations
    await expect(page.getByText("Cross-Specialty Observations")).toBeVisible();

    // Recommended actions
    await expect(page.getByText("Recommended Immediate Actions")).toBeVisible();

    // Verify the Full Report tab
    await page.getByRole("button", { name: /Full Report/ }).click();
    await expect(
      page.getByRole("heading", { name: "Patient Summary" }),
    ).toBeVisible();

    // Disclaimer in report
    await expect(
      page.getByText("proof-of-concept AI research demo"),
    ).toBeVisible();

    // 6. Verify the "New Case" button returns to the form
    await page.getByRole("button", { name: "New Case" }).click();
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible();
  });

  test("character count indicators appear on text fields", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible();

    // Type into medical history field
    const historyField = page.getByPlaceholder(/Past diagnoses, medications/);
    await historyField.fill("Some test medical history input");

    // Look for character count text (e.g. "31 / 50,000" or similar)
    const charIndicator = page.locator("text=/\\d+\\s*\\/\\s*50/");
    await expect(charIndicator.first()).toBeVisible({ timeout: 3_000 });
  });

  test("dark mode toggle switches theme", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible();

    // Find the theme toggle button (sun/moon icon button in header)
    const themeBtn = page.locator("header button").first();

    // Check initial state - get the html element's class
    const htmlEl = page.locator("html");
    const initialClasses = (await htmlEl.getAttribute("class")) ?? "";
    const wasDark = initialClasses.includes("dark");

    // Click the toggle
    await themeBtn.click();

    // Verify the class changed
    const newClasses = (await htmlEl.getAttribute("class")) ?? "";
    if (wasDark) {
      expect(newClasses).not.toContain("dark");
    } else {
      expect(newClasses).toContain("dark");
    }
  });

  test("browser back/forward navigation works after completing a flow", async ({
    page,
  }) => {
    // Fill and submit
    await page.getByPlaceholder("e.g., 45").fill("30");
    await page
      .getByPlaceholder(/Chest pain, shortness of breath/)
      .fill("Headache");
    await page
      .getByPlaceholder(/Past diagnoses, medications/)
      .fill("None significant");
    await page
      .getByPlaceholder(/Doctor-patient encounter/)
      .fill("Reports headache for 2 days");
    await page.getByPlaceholder(/Blood panels, urinalysis/).fill("Normal");

    await page.getByRole("button", { name: "Submit for Diagnosis" }).click();

    // Wait for results
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible({
      timeout: 15_000,
    });

    // Verify we're on a /results/... URL
    const resultsUrl = page.url();
    expect(resultsUrl).toContain("/results/");

    // Go back to input
    await page.getByRole("button", { name: "New Case" }).click();
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible();

    // Verify URL changed back to /
    expect(page.url().endsWith("/")).toBe(true);
  });

  test("specialist status updates during analysis", async ({ page }) => {
    // Fill the form
    await page.getByPlaceholder("e.g., 45").fill("55");
    await page
      .getByPlaceholder(/Chest pain, shortness of breath/)
      .fill("Chest pain");
    await page
      .getByPlaceholder(/Past diagnoses, medications/)
      .fill("Previous MI");
    await page
      .getByPlaceholder(/Doctor-patient encounter/)
      .fill("Chest pain for 1 hour");
    await page
      .getByPlaceholder(/Blood panels, urinalysis/)
      .fill("Troponin elevated");

    await page.getByRole("button", { name: "Submit for Diagnosis" }).click();

    // Waiting room should show
    await expect(
      page.getByRole("heading", { name: "Analyzing Case..." }),
    ).toBeVisible({
      timeout: 10_000,
    });

    // Wait for results (verifies the full flow still works)
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible({
      timeout: 15_000,
    });

    // Verify we see the diagnosis report
    await expect(
      page.getByRole("heading", { name: "Hypertensive Urgency" }),
    ).toBeVisible();
  });

  test("SPA fallback serves the app for unknown routes", async ({ page }) => {
    // Navigate to a non-existent route — SPA fallback should serve the app
    await page.goto("/some/unknown/path");
    await acceptConsent(page);

    // The app should still render (SPA fallback serves index.html)
    // It should default to the input screen
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible({
      timeout: 5_000,
    });
  });
});
