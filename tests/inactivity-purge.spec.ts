import { test, expect } from "@playwright/test";
import {
  acceptConsent,
  fillValidForm,
  submitCase,
  waitForResults,
} from "./e2e/helpers";

test.describe("Inactivity session purge", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await acceptConsent(page);
  });

  test("unattended results screen triggers the purge and clears sensitive state", async ({
    page,
  }) => {
    // Install the clock so we can fast-forward through the extended timeout
    // without waiting 15 real minutes. Install before navigating so the app's
    // timers use the mocked clock from the start.
    await page.clock.install();
    // Set a fixed time so the timeout fires deterministically.
    await page.clock.setFixedTime(new Date("2026-01-01T00:00:00Z"));

    // Submit a case and wait for results.
    await fillValidForm(page, {
      medicalHistory: "Purge E2E sentinel history content.",
    });
    await submitCase(page);
    await waitForResults(page);

    // Seed a draft into sessionStorage to verify the purge removes it.
    // (The form draft was cleared on submit, so re-seed it here to simulate
    // a user who returned to the input page and started typing again but
    // then navigated back to results.)
    await page.evaluate(() => {
      sessionStorage.setItem(
        "ddx_draft",
        JSON.stringify({ age: "99", medicalHistory: "purge-sentinel-draft" }),
      );
    });

    // Verify we're on the results screen with content visible.
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible();

    // Fast-forward past the 15-minute extended timeout on the results screen.
    // The warning fires at 13 min (15 - 2), the purge fires at 15 min.
    await page.clock.fastForward("15:30");

    // The locked view should render.
    await expect(
      page.getByRole("heading", { name: "Session Locked" }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByText(/session was locked due to inactivity/),
    ).toBeVisible();

    // The case content must NOT be visible.
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Purge E2E sentinel history content."),
    ).toHaveCount(0);

    // The draft must be removed from sessionStorage.
    expect(
      await page.evaluate(() => sessionStorage.getItem("ddx_draft")),
    ).toBeNull();

    // The job credentials must be removed from sessionStorage.
    expect(
      await page.evaluate(() => sessionStorage.getItem("ddx_job_credentials")),
    ).toBeNull();

    // The URL must be the neutral input route (no job ID).
    expect(page.url()).toMatch(/\/$/);
    expect(page.url()).not.toMatch(/\/(waiting|results)\//);

    // Browser back navigation must not recover case content. The purge used
    // replaceState, so the results URL should no longer be in history.
    await page.goBack();
    // After going back, we should not see the results screen — either we stay
    // on the input/locked view or land on a neutral page.
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Purge E2E sentinel history content."),
    ).toHaveCount(0);

    // Tapping "Continue" dismisses the lock and shows a blank input.
    // (The locked view may or may not still be visible depending on back-nav;
    // if it is, dismiss it.)
    const continueBtn = page.getByRole("button", { name: "Continue" });
    if (await continueBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await continueBtn.click();
    }
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible({
      timeout: 5_000,
    });
    // The form fields should be blank (draft was purged).
    await expect(page.getByPlaceholder("e.g., 45")).toHaveValue("");
    await expect(
      page.getByPlaceholder(/Past diagnoses, medications/),
    ).toHaveValue("");
  });

  test("unattended waiting screen triggers the purge", async ({ page }) => {
    await page.clock.install();
    await page.clock.setFixedTime(new Date("2026-01-01T00:00:00Z"));

    // Block the WebSocket so the job stays in the waiting state (no completion).
    await page.route("**/ws**", (route) =>
      route.fulfill({ status: 200, body: "" }),
    );

    await fillValidForm(page, { medicalHistory: "Waiting purge sentinel." });
    await submitCase(page);

    // Wait for the waiting room to render.
    await expect(
      page.getByRole("heading", { name: "Analyzing Case..." }),
    ).toBeVisible({ timeout: 10_000 });

    // Fast-forward past the 15-minute extended timeout.
    await page.clock.fastForward("15:30");

    // The locked view should render.
    await expect(
      page.getByRole("heading", { name: "Session Locked" }),
    ).toBeVisible({ timeout: 5_000 });

    // Waiting-room content must NOT be visible.
    await expect(
      page.getByRole("heading", { name: "Analyzing Case..." }),
    ).toHaveCount(0);
    await expect(page.getByText("Waiting purge sentinel.")).toHaveCount(0);

    // Credentials cleared.
    expect(
      await page.evaluate(() => sessionStorage.getItem("ddx_job_credentials")),
    ).toBeNull();

    // URL is the neutral input route.
    expect(page.url()).toMatch(/\/$/);
  });

  test("input screen purge removes the draft and locks the session", async ({
    page,
  }) => {
    await page.clock.install();
    await page.clock.setFixedTime(new Date("2026-01-01T00:00:00Z"));

    // Trigger a user activity event so the useAutoLogout timer (set on page
    // load with the real clock) resets onto the mocked clock.
    await page.locator("body").click();

    // Type into the form to seed the autosave draft (wait for the 500ms debounce).
    await page.getByPlaceholder("e.g., 45").fill("55");
    await page
      .getByPlaceholder(/Past diagnoses, medications/)
      .fill("Input purge sentinel");
    // Click to reset the timer onto the mocked clock (fill may not dispatch
    // keydown, so the auto-logout timer may still be on the real clock).
    await page.locator("body").click();
    // Fast-forward the autosave debounce (500ms) on the mocked clock so the
    // draft persists to sessionStorage.
    await page.clock.fastForward("00:01");
    expect(
      await page.evaluate(() => sessionStorage.getItem("ddx_draft")),
    ).toContain("Input purge sentinel");

    // Fast-forward past the 10-minute input timeout.
    await page.clock.fastForward("10:30");

    // The locked view should render.
    await expect(
      page.getByRole("heading", { name: "Session Locked" }),
    ).toBeVisible({ timeout: 5_000 });

    // The draft must be removed from sessionStorage.
    expect(
      await page.evaluate(() => sessionStorage.getItem("ddx_draft")),
    ).toBeNull();

    // The form content must NOT be visible (locked view replaces it).
    await expect(page.getByPlaceholder("e.g., 45")).toHaveCount(0);
    await expect(page.getByText("Input purge sentinel")).toHaveCount(0);

    // Tapping Continue shows a blank input form.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByPlaceholder("e.g., 45")).toHaveValue("");
  });

  test("autosave disclosure is visible on the input form", async ({ page }) => {
    await expect(
      page.getByText(/Drafts are auto-saved for this tab/),
    ).toBeVisible();
    await expect(
      page.getByText(/cleared on inactivity or tab close/),
    ).toBeVisible();
  });

  test("user activity on the results screen resets the extended timer", async ({
    page,
  }) => {
    await page.clock.install();
    await page.clock.setFixedTime(new Date("2026-01-01T00:00:00Z"));

    await fillValidForm(page, { medicalHistory: "Activity reset sentinel." });
    await submitCase(page);
    await waitForResults(page);

    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible();

    // Fast-forward 10 minutes (past the input timeout but under the 15-min
    // extended timeout). The purge should NOT have fired yet.
    await page.clock.fastForward("10:00");
    await expect(
      page.getByRole("heading", { name: "Session Locked" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible();

    // Simulate user activity (a click) to reset the timer.
    await page.locator("body").click();

    // Fast-forward another 10 minutes. Without the activity reset, the
    // remaining 5 minutes of the original 15-min window would have fired.
    // With the reset, we should still be under the new 15-min window.
    await page.clock.fastForward("10:00");
    await expect(
      page.getByRole("heading", { name: "Session Locked" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible();
  });
});
