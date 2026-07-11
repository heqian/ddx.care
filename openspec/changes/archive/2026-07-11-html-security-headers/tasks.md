## 1. Apply Security Headers to HTML Routes

- [x] 1.1 In `src/backend/api/routes.ts`, update the `CSP_VALUE` constant: add `https://fonts.googleapis.com` to `style-src`, change `connect-src` to `'self'` (remove `ws: wss:`), add `base-uri 'none'`, `form-action 'self'`, `object-src 'none'`.
- [x] 1.2 ~~Convert the `"/"` route from a raw `appHtml` value to a handler that returns `new Response(appHtml, { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() } })`.~~ **Revised:** Wrapping the `HTMLBundle` in a `Response` coerces it to `"[object HTMLBundle]"`, breaking the page. Kept `"/"` as a direct `appHtml` route value; security headers for HTML are applied by Caddy instead.
- [x] 1.3 ~~Convert the `"/*"` SPA fallback route the same way.~~ **Revised:** Same as 1.2 — kept `"/*"` as a direct `appHtml` route value; security headers applied by Caddy.
- [x] 1.4 Verified `corsHeaders()` can be called without a `Request` argument (signature is `req?: Request`), but this is moot for HTML routes since `HTMLBundle` route values bypass `corsHeaders()` entirely.

## 2. Testing

- [x] 2.1 ~~Add test in `tests/api.test.ts`: `GET /` returns `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Content-Type: text/html; charset=utf-8` headers.~~ **Revised:** Test now asserts `GET /` serves the bundled HTML page (200, `text/html`, contains `<!doctype html>` and `id="root"`). Security header assertions for HTML moved to Caddy's responsibility (documented).
- [x] 2.2 Add test verifying the updated CSP includes `base-uri 'none'`, `form-action 'self'`, `connect-src 'self'`, and `https://fonts.googleapis.com` in `style-src` (asserted on `/v1/agents` which goes through `corsHeaders()`).
- [x] 2.3 Add test verifying the CSP does NOT contain bare `ws:` or `wss:` in `connect-src`.
- [x] 2.4 Run `bun run lint && bun run typecheck && bun run test` to verify all changes.

## 3. Documentation

- [x] 3.1 Update `AGENTS.md` to document the tightened CSP directives and note that HTML responses get security headers via Caddy (since HTMLBundle routes bypass `corsHeaders()`).