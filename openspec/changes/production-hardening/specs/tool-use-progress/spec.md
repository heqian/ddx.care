## MODIFIED Requirements

### Requirement: ProgressEvent supports optional structured fields

The `ProgressEvent` interface SHALL include optional fields `eventType`, `agentId`, `toolName`, and `toolArgs`. Existing events without these fields SHALL remain valid and render identically to before on the frontend.

#### Scenario: Legacy progress event renders unchanged
- **WHEN** a progress event has only `time` and `message` fields (no `eventType` or `agentId`)
- **THEN** the frontend renders it as a standard progress log entry with no special differentiation

#### Scenario: Enriched progress event carries tool metadata
- **WHEN** a progress event has `eventType: "tool_call"`, `agentId: "cardiologist"`, `toolName: "pubmed-search"`, and `toolArgs: "chest pain"`
- **THEN** the frontend can access all four fields to attribute and display the tool call

### Requirement: WebSocket reconnection with status check

The `useJobStream` hook SHALL attempt up to 5 WebSocket reconnections with exponential backoff (1s, 2s, 4s, 8s, 16s). Before each reconnection attempt, the hook SHALL poll `/v1/status/:jobId` to check if the job has already reached a terminal state. If the job is `completed` or `failed`, the hook SHALL set the result directly and skip reconnection.

#### Scenario: Reconnection after brief network drop
- **WHEN** the WebSocket closes abnormally (code !== 1000) on the 2nd attempt
- **THEN** the hook waits 2 seconds, polls the job status, and if the job is still pending, reconnects

#### Scenario: Job completed during network interruption
- **WHEN** the WebSocket closes and the job has already completed
- **THEN** the hook polls `/v1/status/:jobId`, receives the completed result, sets it in state, and does not attempt reconnection

#### Scenario: All reconnection attempts exhausted
- **WHEN** 5 reconnection attempts all fail
- **THEN** the hook falls back to HTTP polling every 3 seconds as before

### Requirement: Failed deep-link result handled in UI

When navigating directly to `/results/:jobId` for a job that has `status: "failed"`, the frontend SHALL display the error message from the job's `error` field instead of showing a perpetual loading spinner.

#### Scenario: Deep link to failed job
- **WHEN** a user navigates to `/results/<jobId>` and the job status is `"failed"`
- **THEN** the UI shows the error message (e.g., "Cancelled by user" or the failure reason) with a "New Case" button

#### Scenario: Deep link to pending job
- **WHEN** a user navigates to `/results/<jobId>` and the job is still `"pending"`
- **THEN** the UI shows a loading spinner and subscribes to WebSocket updates as before