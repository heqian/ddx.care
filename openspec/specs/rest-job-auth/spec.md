### Requirement: Status endpoint requires valid token

The `GET /v1/status/:jobId` endpoint SHALL verify the HMAC token when `WS_TOKEN_SECRET` is set. The token SHALL be accepted as a `token` query parameter. If the token is missing or invalid, the server SHALL respond with `403 Forbidden` and SHALL NOT return job data. Token verification SHALL occur before the job existence lookup to prevent enumeration.

#### Scenario: Valid token returns job status
- **WHEN** a client requests `GET /v1/status/:jobId?token=<valid-hmac>` and `WS_TOKEN_SECRET` is set
- **THEN** the server returns the job status, progress events, and results as before

#### Scenario: Missing token is rejected
- **WHEN** a client requests `GET /v1/status/:jobId` without a `token` parameter and `WS_TOKEN_SECRET` is set
- **THEN** the server responds with `403 Forbidden` and does not return job data

#### Scenario: Invalid token is rejected
- **WHEN** a client requests `GET /v1/status/:jobId?token=invalid` and `WS_TOKEN_SECRET` is set
- **THEN** the server responds with `403 Forbidden` and does not return job data

#### Scenario: Token verified before existence check
- **WHEN** a client requests `GET /v1/status/:jobId?token=invalid` for a job that does not exist
- **THEN** the server responds with `403 Forbidden` (not 404), preventing job existence enumeration

#### Scenario: Dev mode without WS_TOKEN_SECRET
- **WHEN** `WS_TOKEN_SECRET` is not set or is empty
- **THEN** the endpoint operates without token verification, returning job data for valid job IDs

### Requirement: Cancel endpoint requires valid token

The `DELETE /v1/diagnose/:jobId` endpoint SHALL verify the HMAC token when `WS_TOKEN_SECRET` is set, using the same `token` query parameter pattern. If the token is missing or invalid, the server SHALL respond with `403 Forbidden` and SHALL NOT abort the workflow.

#### Scenario: Valid token cancels the job
- **WHEN** a client sends `DELETE /v1/diagnose/:jobId?token=<valid-hmac>` and `WS_TOKEN_SECRET` is set
- **THEN** cancellation is requested, the job is marked as failed, and its concurrency slot remains owned until the workflow promise settles

#### Scenario: Missing or invalid token prevents cancellation
- **WHEN** a client sends `DELETE /v1/diagnose/:jobId` without a valid `token` and `WS_TOKEN_SECRET` is set
- **THEN** the server responds with `403 Forbidden` and the workflow is not affected

### Requirement: Frontend passes token on REST calls

The frontend API client SHALL include the `token` parameter when calling `GET /v1/status/:jobId` (polling fallback) and `DELETE /v1/diagnose/:jobId`. The token SHALL be obtained from the diagnosis submission response and threaded through the component state.

#### Scenario: Polling fallback includes token
- **WHEN** the WebSocket connection fails and `useJobStream` falls back to HTTP polling
- **THEN** the `getJobStatus()` call includes the `token` as a query parameter

#### Scenario: Cancel request includes token
- **WHEN** the user clicks Cancel in the WaitingRoom
- **THEN** the `cancelDiagnosis()` call includes the `token` as a query parameter
