## MODIFIED Requirements

### Requirement: HMAC-signed token generated on diagnosis submission

When a diagnosis is submitted via `POST /v1/diagnose`, the response SHALL include a `token` field alongside `jobId`. The token SHALL be an HMAC-SHA256 signature of the `jobId` using the `WS_TOKEN_SECRET` environment variable as the key, encoded as a hexadecimal string. This token authenticates the caller on all job-scoped endpoints: the WebSocket upgrade (`/ws`), the status poll (`GET /v1/status/:jobId`), and the cancellation request (`DELETE /v1/diagnose/:jobId`).

#### Scenario: Successful diagnosis submission returns token
- **WHEN** a client submits a valid `POST /v1/diagnose` request
- **THEN** the response body includes `{ "jobId": "<uuid>", "status": "pending", "token": "<hmac-hex>" }`

#### Scenario: Token is verifiable server-side
- **WHEN** the server receives a `jobId` and `token`
- **THEN** computing HMAC-SHA256 of the `jobId` with `WS_TOKEN_SECRET` and comparing it to the `token` yields a match

#### Scenario: Token authenticates all job-scoped REST endpoints
- **WHEN** a client uses the token from the submission response on `GET /v1/status/:jobId?token=...` or `DELETE /v1/diagnose/:jobId?token=...`
- **THEN** the server accepts the request if the token is valid

### Requirement: Frontend includes token in all job-scoped connections

The frontend SHALL include the `token` in all job-scoped requests: the WebSocket connection URL, the HTTP polling fallback (`getJobStatus()`), and the cancellation request (`cancelDiagnosis()`). The token SHALL be obtained from the diagnosis submission response. For deep-linked result views, the token SHALL be parsed from the hash route (`#/results/:jobId/:token`).

#### Scenario: Frontend connects WebSocket with token
- **WHEN** a diagnosis is submitted and returns `{ jobId, token }`
- **THEN** the WebSocket connection URL includes both `jobId` and `token` parameters

#### Scenario: Frontend reconnects WebSocket with token
- **WHEN** the WebSocket connection drops and reconnection is attempted
- **THEN** the reconnection URL includes the same `token` parameter

#### Scenario: Frontend polls with token
- **WHEN** the WebSocket connection fails and `useJobStream` falls back to HTTP polling
- **THEN** `getJobStatus()` is called with the `token` parameter

#### Scenario: Deep-linked results load with token
- **WHEN** a user navigates to `#/results/:jobId/:token`
- **THEN** the frontend parses the token and includes it when fetching the job status
