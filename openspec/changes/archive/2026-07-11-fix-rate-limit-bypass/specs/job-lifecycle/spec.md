## MODIFIED Requirements

### Requirement: Rate limit recording moved after validation

The `rateLimiter.record(ip)` call SHALL be executed immediately after `rateLimiter.check(ip)` returns `{allowed: true}` and BEFORE request body parsing or Zod validation. This ensures that ALL requests that pass the rate-limit check — whether valid or malformed — consume a rate-limit slot, preventing bypass via rapid invalid payloads.

The concurrent-workflow slot (`startWorkflow()` / `finishWorkflow()`) is managed separately: `startWorkflow()` SHALL only be called after successful validation, and `finishWorkflow()` SHALL be called on all early-exit paths (413, 400, validation failure) to release the slot.

#### Scenario: Malformed JSON request consumes rate limit but not workflow slot
- **WHEN** a client sends `POST /v1/diagnose` with invalid JSON body
- **THEN** the response is `400 Bad Request`, the client's rate-limit counter IS incremented, and the concurrent-workflow slot is freed

#### Scenario: Valid request consumes both rate limit and workflow slot
- **WHEN** a client sends `POST /v1/diagnose` with a valid JSON body that passes Zod validation
- **THEN** the request is processed, the rate-limit counter IS incremented, and a workflow slot is consumed

#### Scenario: Oversized payload consumes rate limit but not workflow slot
- **WHEN** a client sends `POST /v1/diagnose` with a `Content-Length` exceeding `MAX_PAYLOAD_BYTES`
- **THEN** the response is `413 Payload Too Large`, the rate-limit counter IS incremented, and the concurrent-workflow slot is freed

#### Scenario: Rapid invalid payloads trigger rate limit
- **WHEN** a client sends `RATE_LIMIT_MAX_REQUESTS` consecutive invalid `POST /v1/diagnose` requests within the rate-limit window
- **THEN** the next request (valid or invalid) receives `429 Too Many Requests`

#### Scenario: Schema validation failure consumes rate limit
- **WHEN** a client sends `POST /v1/diagnose` with valid JSON that fails Zod validation (e.g., field exceeds max length)
- **THEN** the response is `400 Bad Request` and the rate-limit counter IS incremented
