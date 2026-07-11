## Requirements

### Requirement: CORS origin whitelisting in production

When `TRUSTED_ORIGINS` environment variable is set (comma-separated list of origins, e.g. `https://ddx.care`), the system SHALL validate all REST API CORS responses against this list. The `Access-Control-Allow-Origin` header SHALL reflect the request's `Origin` header only if it appears in `TRUSTED_ORIGINS`. When `TRUSTED_ORIGINS` is not set, the system SHALL fall back to the current `ALLOWED_ORIGINS` behavior (default `*`).

#### Scenario: Trusted origin matches request
- **WHEN** `TRUSTED_ORIGINS=https://ddx.care` and a request arrives with `Origin: https://ddx.care`
- **THEN** the response includes `Access-Control-Allow-Origin: https://ddx.care`

#### Scenario: Trusted origin does not match request
- **WHEN** `TRUSTED_ORIGINS=https://ddx.care` and a request arrives with `Origin: https://evil.example`
- **THEN** the response does not include `Access-Control-Allow-Origin` for that origin (CORS preflight returns 403)

#### Scenario: TRUSTED_ORIGINS not set (development mode)
- **WHEN** `TRUSTED_ORIGINS` is not set or is empty
- **THEN** the system uses `ALLOWED_ORIGINS` (default `*`) as it does currently

### Requirement: Security response headers on all API responses

All responses from `/v1/*` routes SHALL include the headers `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. These headers SHALL be applied by the `corsHeaders()` function so they are present on both preflight and actual responses.

Additionally, all HTML page responses (the SPA routes `"/"` and `"/*"`) SHALL include the full set of security headers: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`. Because Bun's HTMLBundle route values coerce to `[object HTMLBundle]` when wrapped in `Response` objects and bypass the app's `corsHeaders()` function, these headers SHALL be applied to HTML responses by the Caddy reverse proxy's `header` directive in production, not via `Response` objects or `corsHeaders()`.

#### Scenario: API response includes security headers
- **WHEN** any `/v1/*` route returns a response
- **THEN** the response includes `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`

#### Scenario: CORS preflight includes security headers
- **WHEN** an `OPTIONS /v1/*` preflight request is received
- **THEN** the 204 response includes `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`

#### Scenario: HTML page includes CSP and security headers
- **WHEN** a client requests `GET /` (or any SPA fallback route) in production
- **THEN** the Caddy reverse proxy adds `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY` headers to the response

#### Scenario: HTML response has correct content type
- **WHEN** a client requests `GET /`
- **THEN** the response includes `Content-Type: text/html; charset=utf-8`

### Requirement: Content Security Policy tightened with complete directives

The `Content-Security-Policy` header SHALL include the following directives:
- `default-src 'self'`
- `script-src 'self'`
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
- `font-src 'self' https://fonts.gstatic.com`
- `img-src 'self' data:`
- `connect-src 'self'`
- `frame-ancestors 'none'`
- `base-uri 'none'`
- `form-action 'self'`
- `object-src 'none'`

The `connect-src` directive SHALL NOT include bare `ws:` or `wss:` scheme sources; same-origin WebSocket is covered by `'self'`. The `style-src` directive SHALL allowlist `https://fonts.googleapis.com` so the font CSS `<link>` loads correctly.

#### Scenario: CSP includes all required directives
- **WHEN** any response includes a `Content-Security-Policy` header
- **THEN** the header contains `base-uri 'none'`, `form-action 'self'`, `object-src 'none'`, and `connect-src 'self'`

#### Scenario: CSP allows Google Fonts CSS
- **WHEN** the browser loads the font stylesheet from `https://fonts.googleapis.com/css2?...`
- **THEN** the `style-src` directive includes `https://fonts.googleapis.com` and the stylesheet is not blocked

#### Scenario: CSP does not allow bare WebSocket schemes
- **WHEN** the CSP is evaluated
- **THEN** `connect-src` is `'self'` without bare `ws:` or `wss:` entries

### Requirement: HSTS header via Caddy

The Caddyfile SHALL include a `Strict-Transport-Security` header with value `max-age=63072000; includeSubDomains; preload` applied to all responses via the `header` directive.

#### Scenario: Caddy adds HSTS header
- **WHEN** Caddy proxies a request to the backend
- **THEN** the response includes `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`