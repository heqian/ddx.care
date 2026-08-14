import { test, expect } from "@playwright/test";
import {
  acceptConsent,
  fillValidForm,
  submitCase,
  waitForResults,
  waitForWaitingRoom,
  jobIdFromUrl,
  authenticatedStatusRequest,
  jobCredential,
} from "./e2e/helpers";

test.describe("Error states & edge paths", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await acceptConsent(page);
  });

  test("deep-link reload to a completed job renders the report", async ({
    page,
  }) => {
    await fillValidForm(page);
    await submitCase(page);
    await waitForResults(page);

    const jobId = jobIdFromUrl(page.url());
    expect(jobId).toBeTruthy();

    // Full reload of the results URL simulates a user pasting the deep link.
    // App remounts with no in-memory jobResult, so it must fetch via the API.
    await page.goto(`/results/${jobId}`);
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Hypertensive Urgency" }),
    ).toBeVisible();
  });

  test("deep-link without same-session credentials shows missing context", async ({
    page,
  }) => {
    // A well-formed v4 UUID that the server has never created.
    const bogusId = "00000000-0000-4000-8000-000000000000";
    await page.goto(`/results/${bogusId}`);
    await acceptConsent(page);

    await expect(
      page.getByText(
        "This case is not available in the current browser session.",
      ),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "New Case" })).toBeVisible();
  });

  test("specialist panel warning banner when /v1/agents fails", async ({
    page,
  }) => {
    // Force the agent list request to fail — the waiting room must show a
    // dismissible warning banner while the diagnosis continues.
    await page.route("**/v1/agents", (route) =>
      route.fulfill({ status: 500, body: "boom" }),
    );

    await fillValidForm(page);
    await submitCase(page);
    await waitForWaitingRoom(page);

    const banner = page.getByText("Could not load specialist panel");
    await expect(banner).toBeVisible({ timeout: 5_000 });

    // Dismiss the banner.
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(banner).toBeHidden();

    // Diagnosis should still complete despite the agent-list failure.
    await waitForResults(page);
  });

  test("submission error alert renders when POST /v1/diagnose fails", async ({
    page,
  }) => {
    // Intercept only the POST (the glob is exact on /v1/diagnose, but guard
    // the method so a future DELETE could never be affected).
    await page.route("**/v1/diagnose", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Server is at capacity. Try again later.",
        }),
      });
    });

    await fillValidForm(page);
    await submitCase(page);

    // The red error alert shows the server's error message.
    await expect(
      page.getByText("Server is at capacity. Try again later."),
    ).toBeVisible({ timeout: 5_000 });

    // The submit button recovers to an enabled state.
    await expect(
      page.getByRole("button", { name: "Submit for Diagnosis" }),
    ).toBeEnabled();
  });

  test("cancel button aborts the running job and returns to input", async ({
    page,
  }) => {
    await fillValidForm(page);
    await submitCase(page);
    await waitForWaitingRoom(page);

    const jobId = jobIdFromUrl(page.url());
    expect(jobId).toBeTruthy();
    // Capture the token before cancel — the credential is removed from
    // sessionStorage after cancel, so we need it beforehand to query status.
    const { token } = await jobCredential(page, jobId!);
    const statusUrl = `${page.url().split("/waiting/")[0]}/v1/status/${jobId}`;

    await page.getByRole("button", { name: "Cancel" }).click();

    // UI returns to the input screen.
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible({
      timeout: 5_000,
    });
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const raw = sessionStorage.getItem("ddx_job_credentials");
          return raw ? Boolean(JSON.parse(raw).jobs?.[id]) : false;
        }, jobId!),
      )
      .toBe(false);

    // The job is marked failed with the cancellation message. Poll because
    // the DELETE from the browser may still be in flight when we check.
    // Use the dedicated capability header.
    await expect
      .poll(
        async () => {
          const res = await page.request.get(statusUrl, {
            headers: { "X-Job-Token": token },
          });
          return (await res.json()).status;
        },
        { timeout: 5_000 },
      )
      .toBe("failed");

    const finalRes = await page.request.get(statusUrl, {
      headers: { "X-Job-Token": token },
    });
    const finalData = await finalRes.json();
    expect(finalData.error).toContain("Cancelled");
  });

  test("workflow failure shows the Diagnosis Failed UI and Retry resubmits a new job", async ({
    page,
  }) => {
    // The sentinel makes the mock workflow throw mid-step. The backend
    // surfaces Mastra's internally-failed result as a "failed" job, so the
    // waiting room must show the Diagnosis Failed UI with a Retry button.
    await fillValidForm(page, {
      medicalHistory: "E2E_MOCK_FAIL Hypertension history.",
    });
    await submitCase(page);
    await waitForWaitingRoom(page);

    await expect(
      page.getByRole("heading", { name: "Diagnosis Failed" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Retry Diagnosis" }),
    ).toBeVisible();

    const failedJobId = jobIdFromUrl(page.url());
    const failedCredential = await jobCredential(page, failedJobId!);

    // Retry must submit a brand-new job (new jobId in the waiting URL).
    await page.getByRole("button", { name: "Retry Diagnosis" }).click();
    await expect
      .poll(() => jobIdFromUrl(page.url()), { timeout: 10_000 })
      .not.toBe(failedJobId);
    const retriedJobId = jobIdFromUrl(page.url());
    const retriedCredential = await jobCredential(page, retriedJobId!);
    expect(retriedCredential.token).not.toBe(failedCredential.token);
    expect(page.url()).not.toContain(retriedCredential.token);
  });

  test("retry is disabled and an obsolete response cannot navigate", async ({
    page,
  }) => {
    await fillValidForm(page, {
      medicalHistory: "E2E_MOCK_FAIL Hypertension history.",
    });
    await submitCase(page);
    await expect(
      page.getByRole("heading", { name: "Diagnosis Failed" }),
    ).toBeVisible({ timeout: 10_000 });

    await page.route("**/v1/diagnose", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 500));
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          jobId: "00000000-0000-4000-8000-000000000123",
          status: "pending",
          token: "obsolete-retry-token",
        }),
      });
    });

    const retry = page.getByRole("button", { name: "Retry Diagnosis" });
    await retry.click();
    await expect(
      page.getByRole("button", { name: "Retrying..." }),
    ).toBeDisabled();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible();
    await page.waitForTimeout(700);
    expect(new URL(page.url()).pathname).toBe("/");
    expect(page.url()).not.toContain("obsolete-retry-token");
  });

  test("report generation failure shows safety guidance without report content", async ({
    page,
  }) => {
    await fillValidForm(page, {
      medicalHistory: "E2E_MOCK_REPORT_FAILURE Hypertension history.",
    });
    await submitCase(page);

    await expect(
      page.getByRole("heading", { name: "Diagnostic Report Unavailable" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(
        "The report service is temporarily unavailable. No diagnostic report was produced.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Seek professional evaluation" }),
    ).toBeVisible();
    await expect(
      page.getByText(/contact local emergency services now/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Try Again" })).toBeVisible();

    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("tabpanel")).toHaveCount(0);
    await expect(page.getByText("Top Differential Diagnoses")).toHaveCount(0);
    await expect(page.getByText("Emergent", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/confidence/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Print|Share/ })).toHaveCount(
      0,
    );

    const jobId = jobIdFromUrl(page.url());
    const statusResponse = await authenticatedStatusRequest(page, jobId!);
    const statusBody = await statusResponse.json();
    expect(statusBody.status).toBe("completed");
    expect(statusBody.result.status).toBe("generation_failed");
  });

  test("deep-link to a cancelled job shows the failed-result screen", async ({
    page,
  }) => {
    await fillValidForm(page);
    await submitCase(page);
    await waitForWaitingRoom(page);

    const jobId = jobIdFromUrl(page.url());
    expect(jobId).toBeTruthy();
    // Capture the token before cancel — the credential is removed from
    // sessionStorage after cancel, so we need it beforehand to poll status.
    const { token } = await jobCredential(page, jobId!);
    const statusUrl = `${page.url().split("/waiting/")[0]}/v1/status/${jobId}`;

    // Cancel via the UI — returns to the input screen and marks the job
    // failed ("Cancelled by user"), unlike a report-generation failure, which
    // settles as completed with a generation_failed report outcome.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "New Case" })).toBeVisible({
      timeout: 5_000,
    });

    // Wait for the cancel to land on the server before deep-linking.
    // Use the dedicated capability header.
    await expect
      .poll(
        async () => {
          const res = await page.request.get(statusUrl, {
            headers: { "X-Job-Token": token },
          });
          return (await res.json()).status;
        },
        { timeout: 5_000 },
      )
      .toBe("failed");

    // Cancellation removes the capability, so the old route cannot recover it.
    await page.goto(`/results/${jobId}`);
    await expect(
      page.getByText(
        "This case is not available in the current browser session.",
      ),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: "New Case" })).toBeVisible();
  });
});
