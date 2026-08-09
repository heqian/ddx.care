## Requirements

### Requirement: HMAC-signed token generated on diagnosis submission

When a diagnosis is submitted via `POST /v1/diagnose`, the response SHALL include a `token` field alongside `jobId`. The token SHALL be an HMAC-SHA256 signature over the job ID and an expiry timestamp using the `WS_TOKEN_SECRET` environment variable, encoded as a hexadecimal string. This token authenticates the caller on all job-scoped REST endpoints. The token SHALL include an embedded expiry (default matching `JOB_TTL_MS`) so that tokens do not outlive the data they protect. A separate short-lived WebSocket ticket SHALL also be issued (see the `websocket-ticket-exchange` capability).

#### Scenario: Successful diagnosis submission returns token and ticket
- **WHEN** a client submits a valid `POST /v1/diagnose` request and `WS_TOKEN_SECRET` is set
- **THEN** the response body includes `{ "jobId": "<uuid>", "status": "pending", "token": "<hmac-hex-with-expiry>", "wsTicket": "<signed-short-lived-ticket>" }`

#### Scenario: Token is verifiable server-side
- **WHEN** the server receives a `jobId` and `token`
- **THEN** recomputing the HMAC over the job ID and embedded expiry and comparing it to the `token` yields a match and the expiry is in the future

#### Scenario: Token authenticates REST endpoints via Authorization header
- **WHEN** a client uses the token from the submission response in an `Authorization: Bearer <token>` header on `GET /v1/status/:jobId` or `DELETE /v1/diagnose/:jobId`
- **THEN** the server accepts the request if the token is valid and unexpired

### Requirement: WebSocket upgrade requires valid ticket or token

The `/ws` endpoint SHALL require `jobId` and a valid credential when `WS_TOKEN_SECRET` is set. The endpoint SHALL prefer a short-lived `ticket` parameter and SHALL also accept the long-lived `token` parameter for a bounded migration period. The server SHALL validate the credential against `WS_TOKEN_SECRET`. If the credential is missing, invalid, or expired, the server SHALL respond with `403 Forbidden`.

#### Scenario: Valid ticket allows WebSocket upgrade
- **WHEN** a client connects to `/ws?jobId=<uuid>&ticket=<valid-ticket>` within its TTL
- **THEN** the WebSocket upgrade succeeds and the client receives progress events

#### Scenario: Valid long-lived token allows upgrade during migration
- **WHEN** a client connects to `/ws?jobId=<uuid>&token=<valid-hmac>` and `WS_TOKEN_SECRET` is set
- **THEN** the WebSocket upgrade succeeds during the migration period

#### Scenario: Invalid or expired credential is rejected
- **WHEN** a client connects to `/ws?jobId=<uuid>&ticket=invalid` or with an expired token
- **THEN** the server responds with `403 Forbidden`

#### Scenario: Missing credential is rejected
- **WHEN** a client connects to `/ws?jobId=<uuid>` without a `ticket` or `token` and `WS_TOKEN_SECRET` is set
- **THEN** the server responds with `403 Forbidden`

#### Scenario: Dev mode without WS_TOKEN_SECRET
- **WHEN** `WS_TOKEN_SECRET` is not set or is empty
- **THEN** the `/ws` endpoint operates as before, requiring only `jobId` (with Origin validation via `TRUSTED_ORIGINS`/`ALLOWED_ORIGINS`)