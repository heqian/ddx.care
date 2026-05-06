## ADDED Requirements

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

#### Scenario: API response includes security headers
- **WHEN** any `/v1/*` route returns a response
- **THEN** the response includes `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`

#### Scenario: CORS preflight includes security headers
- **WHEN** an `OPTIONS /v1/*` preflight request is received
- **THEN** the 204 response includes `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`

### Requirement: HSTS header via Caddy

The Caddyfile SHALL include a `Strict-Transport-Security` header with value `max-age=63072000; includeSubDomains; preload` applied to all responses via the `header` directive.

#### Scenario: Caddy adds HSTS header
- **WHEN** Caddy proxies a request to the backend
- **THEN** the response includes `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`