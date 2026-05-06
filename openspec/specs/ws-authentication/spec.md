## ADDED Requirements

### Requirement: HMAC-signed token generated on diagnosis submission

When a diagnosis is submitted via `POST /v1/diagnose`, the response SHALL include a `token` field alongside `jobId`. The token SHALL be an HMAC-SHA256 signature of the `jobId` using the `WS_TOKEN_SECRET` environment variable as the key, encoded as a hexadecimal string.

#### Scenario: Successful diagnosis submission returns token
- **WHEN** a client submits a valid `POST /v1/diagnose` request
- **THEN** the response body includes `{ "jobId": "<uuid>", "status": "pending", "token": "<hmac-hex>" }`

#### Scenario: Token is verifiable server-side
- **WHEN** the server receives a `jobId` and `token`
- **THEN** computing HMAC-SHA256 of the `jobId` with `WS_TOKEN_SECRET` and comparing it to the `token` yields a match

### Requirement: WebSocket upgrade requires valid token

The `/ws` endpoint SHALL require both `jobId` and `token` query parameters when `WS_TOKEN_SECRET` is set. The server SHALL validate that the token is a valid HMAC-SHA256 of the `jobId` using `WS_TOKEN_SECRET`. If the token is missing or invalid, the server SHALL respond with `403 Forbidden`.

#### Scenario: Valid token allows WebSocket upgrade
- **WHEN** a client connects to `/ws?jobId=<uuid>&token=<valid-hmac>`
- **THEN** the WebSocket upgrade succeeds and the client receives progress events

#### Scenario: Invalid token is rejected
- **WHEN** a client connects to `/ws?jobId=<uuid>&token=invalid`
- **THEN** the server responds with `403 Forbidden` and the WebSocket connection is not established

#### Scenario: Missing token is rejected
- **WHEN** a client connects to `/ws?jobId=<uuid>` without a `token` parameter and `WS_TOKEN_SECRET` is set
- **THEN** the server responds with `403 Forbidden`

#### Scenario: Dev mode without WS_TOKEN_SECRET
- **WHEN** `WS_TOKEN_SECRET` is not set or is empty
- **THEN** the `/ws` endpoint operates as before, requiring only `jobId` (with Origin validation via `TRUSTED_ORIGINS`/`ALLOWED_ORIGINS`)

### Requirement: Frontend includes token in WebSocket connection

The `useJobStream` hook SHALL include the `token` in the WebSocket URL when connecting. The token SHALL be obtained from the diagnosis submission response and stored in the component state alongside the `jobId`.

#### Scenario: Frontend connects with token
- **WHEN** a diagnosis is submitted and returns `{ jobId, token }`
- **THEN** the WebSocket connection URL includes both `jobId` and `token` parameters

#### Scenario: Frontend reconnects with token
- **WHEN** the WebSocket connection drops and reconnection is attempted
- **THEN** the reconnection URL includes the same `token` parameter