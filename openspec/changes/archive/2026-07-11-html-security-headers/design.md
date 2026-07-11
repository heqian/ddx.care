## Context

ddx.care defines a strict Content Security Policy in `src/backend/api/routes.ts` (lines 23-30) via the `CSP_VALUE` constant, along with `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. These are injected through the `corsHeaders()` → `withCors()` chain, which is called in every API route handler (`/v1/diagnose`, `/v1/status`, `/v1/health`, `/v1/agents`, etc.).

The problem: the SPA routes `"/"` and `"/*"` return the `appHtml` import directly as a raw value — Bun's route system serves it as-is without any headers. So the browser loads the HTML with **no CSP**, no frame-options, and no content-type-options. The security headers only appear on JSON API responses, where CSP has no effect (CSP governs document rendering, not API responses).

A secondary issue: `index.html` loads font CSS from `https://fonts.googleapis.com/css2?...`, but the CSP `style-src 'self' 'unsafe-inline'` does not allowlist that origin. Currently this is invisible because CSP isn't applied to HTML. Once fixed, the fonts would break.

## Goals / Non-Goals

**Goals:**
- Apply CSP and all security headers to every HTTP response, especially HTML pages
- Fix the Google Fonts CSP mismatch so fonts render correctly in production
- Tighten overly-permissive CSP directives (`connect-src`, add missing directives)
- Add test coverage so this regression can't recur

**Non-Goals:**
- Self-hosting Google Fonts (valid option but out of scope; allowlisting is simpler)
- Removing `'unsafe-inline'` from `style-src` (Tailwind v4 injects inline styles; would require nonces)
- Changing the HSTS configuration (handled by Caddy, already correct)

## Decisions

### D1: Wrap HTML responses in a Response with headers

**Decision:** Instead of returning `appHtml` directly for `"/"` and `"/*"`, return a `Response` object: `new Response(appHtml, { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() } })`.

**Rationale:** Bun's route system accepts both raw values and `Response` objects. Wrapping in a `Response` allows header injection. The `corsHeaders()` function already centralizes CSP, security headers, and CORS logic — reusing it ensures consistency.

**Alternatives considered:**
- Bun middleware/global fetch handler → Over-engineering; the route-map pattern already supports per-route handlers.
- Apply headers in Caddy → Fragile; the app should be self-securing, not dependent on proxy configuration.

### D2: Allowlist Google Fonts CSS origin

**Decision:** Change `style-src` from `'self' 'unsafe-inline'` to `'self' 'unsafe-inline' https://fonts.googleapis.com`. Keep `font-src 'self' https://fonts.gstatic.com` (already correct for the actual font files).

**Rationale:** The `@font-face` CSS rules are served from `fonts.googleapis.com`; the font binary files from `fonts.gstatic.com`. Both must be allowedlisted. This is the minimal change to keep fonts working under enforced CSP.

**Alternatives considered:**
- Self-host fonts → Eliminates the third-party dependency and privacy concern, but adds build complexity. Documented as a future improvement.
- Remove Google Fonts entirely, use system fonts → Changes the design aesthetic (DM Serif Display is a deliberate design choice per AGENTS.md).

### D3: Restrict `connect-src` to `'self'`

**Decision:** Change `connect-src 'self' ws: wss:` to `connect-src 'self'`. WebSocket connections to the same origin are covered by `'self'`.

**Rationale:** The broad `ws:` / `wss:` scheme sources allow WebSocket connections to **any** host. If an XSS existed, data could be exfiltrated via WebSocket. The app only connects to `ws[s]://<same-origin>/ws`. Note: `'self'` in `connect-src` covers both HTTP and WS to the same origin per the CSP spec.

### D4: Add `base-uri`, `form-action`, `object-src`

**Decision:** Add `base-uri 'none'`, `form-action 'self'`, and `object-src 'none'` to the CSP.

**Rationale:** These are standard hardening directives: `base-uri 'none'` prevents `<base>` tag injection, `form-action 'self'` prevents form data exfiltration to external sites, `object-src 'none'` explicitly blocks plugins/embeds (partially covered by `default-src 'self'` but explicit is better).

## Risks / Trade-offs

- **[`'unsafe-inline'` in `style-src`]** → Tailwind v4 and React inject inline styles at runtime. Removing `'unsafe-inline'` would require per-request nonces or hashes, adding complexity. **Mitigation:** Accept `'unsafe-inline'` for styles (low XSS risk via CSS injection); mitigate with strict `script-src 'self'` (no `'unsafe-inline'` for scripts).
- **[Third-party font dependency]** → Google can track visitors via font requests. **Mitigation:** Document as a known trade-off; self-hosting is a future enhancement.
- **[Response wrapping overhead]** → Creating a `Response` object for HTML adds negligible overhead vs. returning a raw string. **Mitigation:** None needed; Bun handles this efficiently.

## Migration Plan

1. No env var changes needed.
2. Deploy: security headers immediately take effect on HTML responses.
3. Verify fonts still render in production (the `style-src` allowlist ensures this).
4. Rollback: Revert route handlers to return `appHtml` directly (headers disappear from HTML, reverting to current behavior).
