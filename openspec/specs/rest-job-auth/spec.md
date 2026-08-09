## Requirements

### Requirement: Status endpoint requires valid token

The `GET /v1/status/:jobId` endpoint SHALL verify the HMAC token when `WS_TOKEN_SECRET` is set. The token SHALL be accepted via an `Authorization: Bearer <token>` header, and SHALL also be accepted as a `token` query parameter as a dev fallback. If the token is missing or invalid, the server SHALL respond with `403 Forbidden` and SHALL NOT return job data. Token verification SHALL occur before the job existence lookup to prevent enumeration. The response SHALL include `Cache-Control: no-store, private` so shared and intermediary caches do not retain PHI-bearing payloads.

#### Scenario: Valid token via Authorization header returns job status
- **WHEN** a client requests `GET /v1/status/:jobId` with `Authorization: Bearer <valid-hmac>` and `WS_TOKEN_SECRET` is set
- **THEN** the server returns the job status, progress events, and results with `Cache-Control: no-store, private`

#### Scenario: Missing token is rejected
- **WHEN** a client requests `GET /v1/status/:jobId` without an `Authorization` header or `token` parameter and `WS_TOKEN_SECRET` is set
- **THEN** the server responds with `403 Forbidden` and does not return job data

#### Scenario: Invalid token is rejected
- **WHEN** a client requests `GET /v1/status/:jobId` with an invalid `Authorization: Bearer invalid` and `WS_TOKEN_SECRET` is set
- **THEN** the server responds with `403 Forbidden` and does not return job data

#### Scenario: Token verified before existence check
- **WHEN** a client requests `GET /v1/status/:jobId` with an invalid token for a job that does not exist
- **THEN** the server responds with `403 Forbidden` (not 404), preventing job existence enumeration

#### Scenario: Expired token is rejected
- **WHEN** a client presents a token whose embedded expiry is in the past
- **THEN** the server responds with `403 Forbidden` and does not return job data

#### Scenario: Dev mode without WS_TOKEN_SECRET
- **WHEN** `WS_TOKEN_SECRET` is not set or empty
- **THEN** the endpoint operates without token verification, returning job data for valid job IDs

### Requirement: Cancel endpoint requires valid token

The `DELETE /v1/diagnose/:jobId` endpoint SHALL verify the HMAC token when `WS_TOKEN_SECRET` is set, accepting the token via `Authorization: Bearer <token>` or the `token` query parameter. If the token is missing or invalid, the server SHALL respond with `403 Forbidden` and SHALL NOT abort the workflow.

#### Scenario: Valid token via header cancels the job
- **WHEN** a client sends `DELETE /v1/diagnose/:jobId` with `Authorization: Bearer <valid-hmac>` and `WS_TOKEN_SECRET` is set
- **THEN** cancellation is requested, the job is marked as failed, and its concurrency slot remains owned until the workflow promise settles

#### Scenario: Missing or invalid token prevents cancellation
- **WHEN** a client sends `DELETE /v1/diagnose/:jobId` without a valid token and `WS_TOKEN_SECRET` is set
- **THEN** the server responds with `403 Forbidden` and the workflow is not affected