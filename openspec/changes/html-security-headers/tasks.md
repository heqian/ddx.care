## 1. Apply Security Headers to HTML Routes

- [ ] 1.1 In `src/backend/api/routes.ts`, update the `CSP_VALUE` constant: add `https://fonts.googleapis.com` to `style-src`, change `connect-src` to `'self'` (remove `ws: wss:`), add `base-uri 'none'`, `form-action 'self'`, `object-src 'none'`.
- [ ] 1.2 Convert the `"/"` route from a raw `appHtml` value to a handler that returns `new Response(appHtml, { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() } })`.
- [ ] 1.3 Convert the `"/*"` SPA fallback route the same way.
- [ ] 1.4 Verify that `corsHeaders()` can be called without a `Request` argument (for the HTML routes that have no request context) or adjust the signature to accept an optional origin.

## 2. Testing

- [ ] 2.1 Add test in `tests/api.test.ts`: `GET /` returns `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Content-Type: text/html; charset=utf-8` headers.
- [ ] 2.2 Add test verifying the updated CSP includes `base-uri 'none'`, `form-action 'self'`, `connect-src 'self'`, and `https://fonts.googleapis.com` in `style-src`.
- [ ] 2.3 Add test verifying the CSP does NOT contain bare `ws:` or `wss:` in `connect-src`.
- [ ] 2.4 Run `bun run lint && bun run typecheck && bun run test` to verify all changes.

## 3. Documentation

- [ ] 3.1 Update `AGENTS.md` to document the tightened CSP directives and note that HTML responses now carry security headers.
