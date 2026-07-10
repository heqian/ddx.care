## Why

The CSP header, `X-Frame-Options: DENY`, and `X-Content-Type-Options: nosniff` are defined in `corsHeaders()` but only applied to JSON API responses via `withCors()`. The SPA HTML routes (`"/"` and `"/*"`) return `appHtml` directly **without any security headers**. This means the primary XSS defense (CSP) is absent exactly where it matters most — on the rendered HTML page. Additionally, the CSP `style-src 'self' 'unsafe-inline'` directive does not allowlist `https://fonts.googleapis.com`, so once CSP is applied to HTML, the Google Fonts `<link>` in `index.html` will be silently blocked.

## What Changes

- **Apply security headers to HTML responses** — Convert the SPA route handlers (`"/"` and `"/*"`) to return `Response` objects with CSP, `X-Frame-Options`, `X-Content-Type-Options`, and CORS headers applied, instead of returning the raw `appHtml` string.
- **Allowlist Google Fonts in CSP `style-src`** — Add `https://fonts.googleapis.com` to `style-src` so the font CSS `<link>` loads correctly when CSP is enforced.
- **Tighten CSP `connect-src`** — Replace the overly broad `ws: wss:` scheme sources with `'self'` only, since the app only connects to same-origin WebSocket endpoints.
- **Add missing CSP directives** — Add `base-uri 'none'`, `form-action 'self'`, and `object-src 'none'` for comprehensive coverage.
- **Add a test verifying headers on HTML** — No current test fetches `/` and asserts security header presence; this gap is why the issue went undetected.

## Capabilities

### New Capabilities

(None)

### Modified Capabilities

- `csp-tightening`: Security headers now applied to all responses including SPA HTML, CSP directives tightened (Google Fonts allowlist, restricted `connect-src`, added `base-uri`/`form-action`/`object-src`)

## Impact

- **Backend API routes** (`src/backend/api/routes.ts`): Convert `"/"` and `"/*"` handlers to apply `corsHeaders()`; update `CSP_VALUE` constant
- **Tests** (`tests/api.test.ts`): Add test asserting CSP and security headers on `GET /` HTML response
- **Documentation** (`AGENTS.md`): Update CSP description to reflect tightened directives
