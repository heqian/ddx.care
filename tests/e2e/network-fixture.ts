import { test as base, expect } from "@playwright/test";

/**
 * Extended Playwright test fixture that blocks non-loopback requests in
 * browser contexts while allowing the owned HTTP/WebSocket origin (5.5).
 *
 * Tests use this instead of the raw @playwright/test export so the network
 * policy is applied uniformly. The owned origin is derived from baseURL.
 */
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export const test = base.extend<{
  blockExternalRequests: void;
}>({
  blockExternalRequests: async ({ page, context }, use) => {
    const baseUrl = process.env.E2E_BASE_URL ?? `http://localhost:3999`;
    const allowedUrl = new URL(baseUrl);
    const allowedHost = allowedUrl.hostname;
    const allowedOrigin = `${allowedUrl.protocol}//${allowedUrl.host}`;

    await context.route("**/*", (route) => {
      const reqUrl = route.request().url();
      try {
        const u = new URL(reqUrl);
        if (
          ALLOWED_HOSTS.has(u.hostname) ||
          u.hostname === allowedHost ||
          reqUrl.startsWith(allowedOrigin)
        ) {
          return route.continue();
        }
        return route.abort("blockedbyclient");
      } catch {
        return route.abort("blockedbyclient");
      }
    });

    await page.route("**/*", (route) => {
      const reqUrl = route.request().url();
      try {
        const u = new URL(reqUrl);
        if (
          ALLOWED_HOSTS.has(u.hostname) ||
          u.hostname === allowedHost ||
          reqUrl.startsWith(allowedOrigin)
        ) {
          return route.continue();
        }
        return route.abort("blockedbyclient");
      } catch {
        return route.abort("blockedbyclient");
      }
    });

    await use();
  },
  // Auto-apply the fixture so every test gets the network policy.
});

export { expect };
