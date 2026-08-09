## Purpose

Issues short-lived, single-use tickets for WebSocket upgrades so the long-lived job capability is never exposed in WebSocket URLs, reducing the window and value of credential leakage via logs and history.

## Requirements

### Requirement: WebSocket ticket issuance on submission

When a diagnosis is submitted, the server SHALL issue a WebSocket ticket bound to the job ID with a short, configurable TTL (default 120 seconds). The ticket SHALL be single-use and SHALL be verifiable without persistent state by signing the job ID and expiry with `WS_TOKEN_SECRET`.

#### Scenario: Submission returns a WebSocket ticket
- **WHEN** a client submits a valid `POST /v1/diagnose` request and `WS_TOKEN_SECRET` is set
- **THEN** the response includes a `wsTicket` field carrying a signed, time-limited ticket in addition to the durable `token`

#### Scenario: Ticket expires
- **WHEN** a WebSocket upgrade presents a ticket whose expiry is in the past
- **THEN** the server rejects the upgrade with `403 Forbidden` and the ticket is not reusable

#### Scenario: Ticket is single-use
- **WHEN** the same ticket is presented for two WebSocket upgrades
- **THEN** at most one upgrade succeeds and the second is rejected

### Requirement: WebSocket upgrade prefers ticket over long-lived HMAC

The `/ws` endpoint SHALL accept the short-lived ticket via a `ticket` query parameter (or an equivalent header) and SHALL validate it against `WS_TOKEN_SECRET`. The long-lived HMAC SHALL be accepted only as a dev fallback when `WS_TOKEN_SECRET` is unset, or for a bounded migration period.

#### Scenario: Valid ticket allows upgrade
- **WHEN** a client connects to `/ws?jobId=<uuid>&ticket=<valid-signed-ticket>` within its TTL
- **THEN** the WebSocket upgrade succeeds and the client receives progress events

#### Scenario: Expired or invalid ticket is rejected
- **WHEN** a client connects with an invalid or expired `ticket` and `WS_TOKEN_SECRET` is set
- **THEN** the server responds with `403 Forbidden` and the upgrade does not proceed

#### Scenario: Dev mode without WS_TOKEN_SECRET
- **WHEN** `WS_TOKEN_SECRET` is not set or empty
- **THEN** the `/ws` endpoint operates without ticket or token verification, requiring only `jobId` with Origin validation