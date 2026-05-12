## ADDED Requirements

### Requirement: HTTP server enforces maximum request body size

The `Bun.serve()` server SHALL be configured with `maxRequestBodySize` set to `MAX_PAYLOAD_BYTES` (default 1MB). Requests exceeding this limit SHALL receive a `413 Payload Too Large` response before any application-level request handler runs.

#### Scenario: Request body within limit is processed normally
- **WHEN** a `POST /v1/diagnose` request has a body of 500KB (under the 1MB limit)
- **THEN** the request is processed normally by the route handler

#### Scenario: Oversized request body rejected at HTTP layer
- **WHEN** a `POST /v1/diagnose` request sends a 10MB body
- **THEN** Bun rejects the request with `413 Payload Too Large` before the route handler's `req.json()` is called

#### Scenario: Spoofed Content-Length does not bypass limit
- **WHEN** a request declares `Content-Length: 100` but sends a 10MB body
- **THEN** Bun enforces the actual byte count of the stream and rejects with `413 Payload Too Large`

#### Scenario: Limit is configurable via environment variable
- **WHEN** `MAX_PAYLOAD_BYTES` is set to `524288` (512KB)
- **THEN** `maxRequestBodySize` uses that value, and a 600KB request is rejected
