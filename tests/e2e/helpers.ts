import { expect, type Page } from "@playwright/test";

/**
 * Accept the consent gate if it is visible, then wait for it to close.
 * Safe to call at the start of every test — no-ops when consent was already
 * granted (sessionStorage persists across same-tab navigations).
 */
export async function acceptConsent(page: Page): Promise<void> {
  const consentHeading = page.getByRole("heading", {
    name: "Legal Disclaimer",
  });
  if (await consentHeading.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "I Accept" }).click();
    // Wait for the gate to disappear. This works regardless of which screen
    // renders next (input, results, or error) — the previous "New Case"
    // heading wait did not.
    await expect(consentHeading).toBeHidden({ timeout: 5_000 });
  }
}

export interface FormOverrides {
  age?: string;
  sex?: string;
  chiefComplaint?: string;
  medicalHistory?: string;
  transcript?: string;
  labs?: string;
}

/**
 * Fill the input form with valid values that satisfy the submit guard.
 * Any field can be overridden via `overrides` (e.g. to inject an E2E sentinel
 * into the medical history). The mock workflow ignores input content, so the
 * defaults are safe to use for any test that only needs to reach the waiting
 * room or results.
 */
export async function fillValidForm(
  page: Page,
  overrides: FormOverrides = {},
): Promise<void> {
  await page.getByPlaceholder("e.g., 45").fill(overrides.age ?? "45");
  await page.getByRole("combobox").selectOption(overrides.sex ?? "Male");
  await page
    .getByPlaceholder(/Chest pain, shortness of breath/)
    .fill(
      overrides.chiefComplaint ?? "Severe headache with blurred vision",
    );
  await page
    .getByPlaceholder(/Past diagnoses, medications/)
    .fill(
      overrides.medicalHistory ??
        "Hypertension diagnosed 5 years ago. On lisinopril 10mg daily.",
    );
  await page
    .getByPlaceholder(/Doctor-patient encounter/)
    .fill(
      overrides.transcript ??
        "The individual reports a severe headache for 3 days. Clinician asked about vision changes. Confirmed blurred vision present.",
    );
  await page
    .getByPlaceholder(/Blood panels, urinalysis/)
    .fill(overrides.labs ?? "BP: 180/110. HR: 90.");
}

/** Click the submit button. */
export async function submitCase(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Submit for Diagnosis" }).click();
}

/** Wait for the results heading, indicating the diagnosis completed. */
export async function waitForResults(
  page: Page,
  timeout = 15_000,
): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Differential Diagnosis" }),
  ).toBeVisible({ timeout });
}

/** Fill the form, submit, and wait for results. */
export async function submitAndWaitForResults(
  page: Page,
  overrides: FormOverrides = {},
): Promise<void> {
  await fillValidForm(page, overrides);
  await submitCase(page);
  await waitForResults(page);
}

/** Wait for the waiting-room heading, indicating the job started. */
export async function waitForWaitingRoom(
  page: Page,
  timeout = 10_000,
): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Analyzing Case..." }),
  ).toBeVisible({ timeout });
}

/** Extract the jobId from a /waiting/ or /results/ URL. */
export function jobIdFromUrl(url: string): string | undefined {
  return url.split(/\/(?:waiting|results)\//)[1]?.split(/[?/]/)[0];
}

/** Base URL of the running E2E server. */
export const baseUrl = `http://localhost:${process.env.PORT || 3999}`;