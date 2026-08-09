import { expect, test } from "@playwright/test";
import {
  acceptConsent,
  fillValidForm,
  jobCredential,
  jobIdFromUrl,
  submitAndWaitForResults,
  submitCase,
} from "./e2e/helpers";

test.describe("Frontend job context isolation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await acceptConsent(page);
  });

  test("restores a waiting credential after refresh without exposing it", async ({
    page,
  }) => {
    const jobId = "00000000-0000-4000-8000-000000000321";
    const token = "waiting-refresh-secret";
    const wsTicket = "waiting-refresh-ticket";
    await page.route("**/v1/diagnose", (route) =>
      route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ jobId, status: "pending", token, wsTicket }),
      }),
    );

    const sockets: string[] = [];
    page.on("websocket", (socket) => sockets.push(socket.url()));
    await fillValidForm(page);
    await submitCase(page);
    await expect(page).toHaveURL(new RegExp(`/waiting/${jobId}$`));
    expect(page.url()).not.toContain(token);
    expect(page.url()).not.toContain(wsTicket);
    expect(await page.title()).not.toContain(token);

    await page.reload();
    await acceptConsent(page);
    await expect(
      page.getByRole("heading", { name: "Analyzing Case..." }),
    ).toBeVisible();
    await expect.poll(() => sockets.length).toBeGreaterThanOrEqual(2);
    // The job WebSocket must carry the short-lived wsTicket (not the
    // long-lived token) in the URL. The HMR socket at /_bun/hmr is also
    // captured; filter for the /ws job socket.
    const jobSocket = sockets.find((s) => s.includes("/ws?jobId="));
    expect(jobSocket).toBeTruthy();
    expect(jobSocket).toContain(`ticket=${encodeURIComponent(wsTicket)}`);
    expect(jobSocket).not.toContain(`token=`);
    expect(page.url()).not.toContain(token);
    expect(page.url()).not.toContain(wsTicket);
    expect(await page.title()).not.toContain(token);
  });

  test("shows authorization expiry without sending a stale token", async ({
    page,
  }) => {
    const jobId = "00000000-0000-4000-8000-000000000654";
    const token = "expired-secret";
    await page.route("**/v1/diagnose", (route) =>
      route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ jobId, status: "pending", token }),
      }),
    );
    await fillValidForm(page);
    await submitCase(page);
    // Wait for navigation so storeJobCredential() has run before we touch
    // sessionStorage. Without this, the evaluate below races the 202 handler
    // on slow CI runners and reads an empty store (store.jobs undefined).
    await expect(page).toHaveURL(new RegExp(`/waiting/${jobId}$`));

    await page.evaluate((id) => {
      const key = "ddx_job_credentials";
      const store = JSON.parse(sessionStorage.getItem(key) ?? "{}");
      store.jobs[id].expiresAt = Date.now() - 1;
      sessionStorage.setItem(key, JSON.stringify(store));
    }, jobId);
    await page.reload();
    await acceptConsent(page);

    await expect(
      page.getByText("Authorization for this case has expired."),
    ).toBeVisible();
    expect(page.url()).not.toContain(token);
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const raw = sessionStorage.getItem("ddx_job_credentials");
          return raw ? Boolean(JSON.parse(raw).jobs?.[id]) : false;
        }, jobId),
      )
      .toBe(false);
  });

  test("keeps completed jobs separate across back and forward navigation", async ({
    page,
  }) => {
    await submitAndWaitForResults(page, { chiefComplaint: "First case" });
    const firstJobId = jobIdFromUrl(page.url());
    const firstCredential = await jobCredential(page, firstJobId!);

    await page.goto("/");
    await fillValidForm(page, { chiefComplaint: "Second case" });
    await submitCase(page);
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible({ timeout: 15_000 });
    const secondJobId = jobIdFromUrl(page.url());
    expect(secondJobId).not.toBe(firstJobId);
    const secondCredential = await jobCredential(page, secondJobId!);
    expect(secondCredential.token).not.toBe(firstCredential.token);

    await page.goto(`/results/${firstJobId}`);
    await expect(page).toHaveURL(new RegExp(`/results/${firstJobId}$`));
    await expect(
      page.getByRole("heading", { name: "Differential Diagnosis" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/results/${secondJobId}$`));
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/results/${firstJobId}$`));
  });

  test("new-case reset purges all job credentials and draft data", async ({
    page,
  }) => {
    await submitAndWaitForResults(page);
    await page.evaluate(() => sessionStorage.setItem("ddx_draft", "sensitive"));

    await page.getByRole("button", { name: "New Case" }).click();

    await expect(page).toHaveURL(/\/$/);
    expect(
      await page.evaluate(() => ({
        credentials: sessionStorage.getItem("ddx_job_credentials"),
        draft: sessionStorage.getItem("ddx_draft"),
      })),
    ).toEqual({ credentials: null, draft: null });
  });
});
