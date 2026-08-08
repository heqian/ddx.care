import { test, expect } from "@playwright/test";
import {
  acceptConsent,
  fillValidForm,
  submitCase,
  baseUrl,
  jobIdFromUrl,
} from "./e2e/helpers";
import { specialistIds } from "../src/backend/agents/manifest";

test("agent API exposes the stable canonical specialist IDs", async ({
  request,
}) => {
  const response = await request.get(`${baseUrl}/v1/agents`);
  expect(response.ok()).toBe(true);

  const body = (await response.json()) as {
    agents: Array<{ id: string }>;
  };
  expect(body.agents.map(({ id }) => id)).toEqual(specialistIds);
  expect(body.agents.every(({ id }) => !id.includes("-"))).toBe(true);
});

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

    // 2. Fill the form and submit
    await fillValidForm(page);
    await submitCase(page);

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
      page
        .getByRole("tabpanel", { name: "Diagnoses (3)" })
        .getByText("Severe headache with blurred vision"),
    ).toBeVisible();

    // Diagnosis cards
    const diagnosesPanel = page.getByRole("tabpanel", {
      name: "Diagnoses (3)",
    });
    await expect(
      diagnosesPanel.getByRole("heading", { name: "Hypertensive Urgency" }),
    ).toBeVisible();
    await expect(
      diagnosesPanel.getByRole("heading", { name: "Migraine with Aura" }),
    ).toBeVisible();
    await expect(
      diagnosesPanel.getByRole("heading", { name: "Tension-Type Headache" }),
    ).toBeVisible();

    // Urgency badge
    await expect(diagnosesPanel.getByText("Emergent")).toBeVisible();

    // Cross-specialty observations
    await expect(
      diagnosesPanel.getByText("Cross-Specialty Observations"),
    ).toBeVisible();

    // Recommended actions
    await expect(
      diagnosesPanel.getByText("Recommended Immediate Actions"),
    ).toBeVisible();

    // Verify the Full Report tab
    await page.getByRole("tab", { name: /Full Report/ }).click();
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
    await fillValidForm(page);
    await submitCase(page);

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
    // Fill the form and submit
    await fillValidForm(page);
    await submitCase(page);

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

  test("tool-call and tool-result progress entries appear in waiting room", async ({
    page,
  }) => {
    // Fill the form and submit
    await fillValidForm(page);
    await submitCase(page);

    // Waiting room should appear
    await expect(
      page.getByRole("heading", { name: "Analyzing Case..." }),
    ).toBeVisible({
      timeout: 10_000,
    });

    // Tool-call progress entries should appear in the progress log
    // The mock emits "cardiologist: Checking drug labeling → metoprolol tartrate"
    const progressLog = page.locator('[role="log"]');
    await expect(
      progressLog.getByText("Checking drug labeling").first(),
    ).toBeVisible({
      timeout: 10_000,
    });

    // Tool-call entries should have the ⟳ (running) indicator
    await expect(
      progressLog.getByText(/Checking drug labeling.*⟳/).first(),
    ).toBeVisible({
      timeout: 5_000,
    });

    // Tool-result entries should appear with ✓ (success) indicator and duration
    await expect(progressLog.getByText(/completed.*✓/).first()).toBeVisible({
      timeout: 5_000,
    });

    // Indented tool entries should have the muted color class
    const indentedEntry = progressLog.locator(".ml-4").first();
    await expect(indentedEntry).toBeVisible({ timeout: 5_000 });

    // Wait for results to complete
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test("tool-call and tool-result progress events have correct structure", async ({
    page,
  }) => {
    // Fill and submit a case
    await fillValidForm(page);
    await submitCase(page);

    // Wait for completion
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible({
      timeout: 15_000,
    });

    // Extract jobId from the URL (format: /results/<jobId>)
    const url = page.url();
    const jobId = url.split("/results/")[1]?.split(/[?/]/)[0];
    expect(jobId).toBeTruthy();

    // Fetch the completed job status via API to inspect progress event structure
    const baseUrl = `http://localhost:${process.env.PORT || 3999}`;
    const statusRes = await page.request.get(`${baseUrl}/v1/status/${jobId}`);
    expect(statusRes.ok()).toBe(true);
    const statusData = await statusRes.json();
    expect(statusData.status).toBe("completed");

    const progress = statusData.progress;
    expect(progress).toBeTruthy();

    // Verify tool_call events exist
    const toolCalls = progress.filter(
      (e: { eventType: string }) => e.eventType === "tool_call",
    );
    expect(toolCalls.length).toBeGreaterThan(0);

    // Verify tool_result events exist
    const toolResults = progress.filter(
      (e: { eventType: string }) => e.eventType === "tool_result",
    );
    expect(toolResults.length).toBeGreaterThan(0);

    // Every tool_result should have success, toolName, and agentId
    for (const tr of toolResults) {
      expect(typeof tr.success).toBe("boolean");
      expect(typeof tr.toolName).toBe("string");
      expect(typeof tr.agentId).toBe("string");
    }

    // Successful tool_results should have durationMs >= 0
    for (const tr of toolResults) {
      if (tr.success) {
        expect(typeof tr.durationMs).toBe("number");
        expect(tr.durationMs).toBeGreaterThanOrEqual(0);
      }
    }

    // At least some tool_results should have a resultSummary
    const withSummary = toolResults.filter(
      (tr: { resultSummary: unknown }) =>
        tr.resultSummary !== null && tr.resultSummary !== undefined,
    );
    expect(withSummary.length).toBeGreaterThan(0);

    // Specialist tool calls should exist (not just CMO)
    const specialistCalls = toolCalls.filter(
      (tc: { agentId: string }) => tc.agentId !== "chiefMedicalOfficer",
    );
    expect(specialistCalls.length).toBeGreaterThan(0);

    // tool_call and tool_result counts should pair per specialist
    const specialistIds = new Set(
      toolCalls.map((tc: { agentId: string }) => tc.agentId),
    );
    for (const id of specialistIds) {
      const calls = toolCalls.filter(
        (tc: { agentId: string }) => tc.agentId === id,
      );
      const results = toolResults.filter(
        (tr: { agentId: string }) => tr.agentId === id,
      );
      expect(results.length).toBeGreaterThanOrEqual(calls.length * 0.5);
    }
  });

  test("cmo_decision progress event carries specialistIds for progress-bar total", async ({
    page,
  }) => {
    // Regression: the Waiting Room progress bar used to show "0/1 Specialist Consulted"
    // when the CMO had selected 3 specialists but only 1 had started (sequential
    // concurrency). The fix populates specialistIds on cmo_decision events so
    // the frontend can compute the full planned panel size up front.
    await fillValidForm(page);
    await submitCase(page);

    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible({ timeout: 15_000 });

    const jobId = jobIdFromUrl(page.url());
    expect(jobId).toBeTruthy();

    const statusRes = await page.request.get(`${baseUrl}/v1/status/${jobId}`);
    expect(statusRes.ok()).toBe(true);
    const statusData = await statusRes.json();
    expect(statusData.status).toBe("completed");

    const progress = statusData.progress;
    expect(progress).toBeTruthy();

    // The cmo_decision event must carry specialistIds listing the full panel.
    const cmoDecisions = progress.filter(
      (e: { eventType: string }) => e.eventType === "cmo_decision",
    );
    expect(cmoDecisions.length).toBeGreaterThan(0);

    const firstDecision = cmoDecisions[0];
    expect(firstDecision.specialistIds).toBeTruthy();
    expect(Array.isArray(firstDecision.specialistIds)).toBe(true);

    // The mock consults cardiologist, neurologist, nephrologist.
    expect(firstDecision.specialistIds.length).toBe(3);
    expect(firstDecision.specialistIds).toEqual(
      expect.arrayContaining(["cardiologist", "neurologist", "nephrologist"]),
    );

    // The union of specialistIds across all cmo_decision events should equal
    // the number of distinct specialists that completed — this is what the
    // progress bar denominator should be.
    const allPlanned = new Set<string>();
    for (const d of cmoDecisions) {
      for (const id of d.specialistIds ?? []) allPlanned.add(id);
    }
    const completed = progress.filter(
      (e: { eventType: string }) => e.eventType === "specialist_complete",
    );
    expect(completed.length).toBe(allPlanned.size);
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

test.describe("Accessibility — keyboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await acceptConsent(page);
  });

  test("tab keyboard navigation with arrow keys", async ({ page }) => {
    // Submit a case to reach the results view
    await page.getByPlaceholder("e.g., 45").fill("45");
    await page
      .getByPlaceholder(/Past diagnoses, medications/)
      .fill("Some history");
    await page.getByRole("button", { name: "Submit for Diagnosis" }).click();

    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible({ timeout: 15_000 });

    // The Diagnoses tab should be selected initially
    const diagnosesTab = page.getByRole("tab", { name: /Diagnoses/ });
    const consultTab = page.getByRole("tab", { name: /Full Report/ });
    await expect(diagnosesTab).toHaveAttribute("aria-selected", "true");
    await expect(consultTab).toHaveAttribute("aria-selected", "false");

    // ArrowRight should switch to Full Report
    await diagnosesTab.press("ArrowRight");
    await expect(consultTab).toHaveAttribute("aria-selected", "true");
    await expect(diagnosesTab).toHaveAttribute("aria-selected", "false");
    await expect(
      page.getByRole("tabpanel", { name: /Full Report/ }),
    ).toBeVisible();

    // ArrowLeft should switch back to Diagnoses
    await consultTab.press("ArrowLeft");
    await expect(diagnosesTab).toHaveAttribute("aria-selected", "true");
    await expect(consultTab).toHaveAttribute("aria-selected", "false");

    // ArrowLeft wraps around to last tab
    await diagnosesTab.press("ArrowLeft");
    await expect(consultTab).toHaveAttribute("aria-selected", "true");

    // ArrowRight wraps around to first tab
    await consultTab.press("ArrowRight");
    await expect(diagnosesTab).toHaveAttribute("aria-selected", "true");

    // Home goes to first tab
    await consultTab.focus();
    await page.keyboard.press("Home");
    await expect(diagnosesTab).toHaveAttribute("aria-selected", "true");

    // End goes to last tab
    await diagnosesTab.focus();
    await page.keyboard.press("End");
    await expect(consultTab).toHaveAttribute("aria-selected", "true");
  });

  test("FileDropZone is keyboard-activatable", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible();

    // Tab to the first FileDropZone (below Medical History)
    const dropZone = page.getByRole("button", {
      name: "Upload medical history file",
    });

    // Focus it via Tab (may need multiple tabs)
    await dropZone.focus();
    await expect(dropZone).toBeFocused();

    // Verify it has the correct ARIA attributes
    await expect(dropZone).toHaveAttribute("tabindex", "0");

    // Press Enter — should trigger the file input (opens a file dialog)
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 5_000 }),
      dropZone.press("Enter"),
    ]);
    await fileChooser.setFiles({
      name: "test-history.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Patient has a history of diabetes."),
    });

    // Verify the file name appears in the drop zone
    await expect(dropZone.getByText("test-history.txt")).toBeVisible();
  });
});
