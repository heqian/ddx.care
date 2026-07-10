## MODIFIED Requirements

### Requirement: Security response headers on all API responses

All responses from `/v1/*` routes SHALL include the headers `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. These headers SHALL be applied by the `corsHeaders()` function so they are present on both preflight and actual responses.

Additionally, all HTML page responses (the SPA routes `"/"` and `"/*"`) SHALL include the full set of security headers: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`. HTML responses SHALL be returned as `Response` objects with headers applied via `corsHeaders()`, not as raw values.

#### Scenario: API response includes security headers
- **WHEN** any `/v1/*` route returns a response
- **THEN** the response includes `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`

#### Scenario: CORS preflight includes security headers
- **WHEN** an `OPTIONS /v1/*` preflight request is received
- **THEN** the 204 response includes `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`

#### Scenario: HTML page includes CSP and security headers
- **WHEN** a client requests `GET /` (or any SPA fallback route)
- **THEN** the response includes `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY` headers

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
