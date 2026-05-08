## ADDED Requirements

### Requirement: Tool call progress events are emitted during specialist consultation

When a specialist agent invokes a tool during `agent.generate()`, the system SHALL emit a progress event with `eventType: "tool_call"` containing the specialist's `agentId`, the `toolName`, and a human-readable `toolArgs` string describing the query.

#### Scenario: Specialist calls drug interaction check
- **WHEN** a cardiologist agent calls the `drug-interaction` tool with `drugName: "aspirin"` and `drugName2: "warfarin"`
- **THEN** a progress event is emitted with `eventType: "tool_call"`, `agentId: "cardiologist"`, `toolName: "drug-interaction"`, `toolArgs: "aspirin + warfarin"`, and `message` containing a human-readable summary like "Cardiologist: Checking interactions → aspirin + warfarin"

#### Scenario: Specialist calls FDA label lookup
- **WHEN** a neurologist agent calls the `drug-labeling` tool with `drugName: "metoprolol"`
- **THEN** a progress event is emitted with `eventType: "tool_call"`, `agentId: "neurologist"`, `toolName: "drug-labeling"`, `toolArgs: "metoprolol"`

#### Scenario: Step has multiple tool calls
- **WHEN** an agent step results in 3 tool calls (drug-interaction, drug-labeling, adverse-events)
- **THEN** 3 separate progress events are emitted, one per tool call, each with the same `agentId` but different `toolName` and `toolArgs`

#### Scenario: Step has no tool calls (text-only response)
- **WHEN** an agent step produces only text with no tool calls
- **THEN** no tool-call progress events are emitted for that step (only the text is used by the agent internally)

### Requirement: ProgressEvent supports optional structured fields

The `ProgressEvent` interface SHALL include optional fields `eventType`, `agentId`, `toolName`, and `toolArgs`. Existing events without these fields SHALL remain valid and render identically to before on the frontend.

#### Scenario: Legacy progress event renders unchanged
- **WHEN** a progress event has only `time` and `message` fields (no `eventType` or `agentId`)
- **THEN** the frontend renders it as a standard progress log entry with no special differentiation

#### Scenario: Enriched progress event carries tool metadata
- **WHEN** a progress event has `eventType: "tool_call"`, `agentId: "cardiologist"`, `toolName: "drug-interaction"`, and `toolArgs: "aspirin + warfarin"`
- **THEN** the frontend can access all four fields to attribute and display the tool call

### Requirement: Agent status card displays the active tool

When a specialist agent is in the `"active"` state and has a current tool call in progress, the `AgentStatusCard` component SHALL display the tool's human-readable label and query below the agent's name.

#### Scenario: Card shows active tool during consultation
- **WHEN** the cardiologist is `"active"` and the most recent tool-call event is `toolName: "drug-interaction"`, `toolArgs: "aspirin + warfarin"`
- **THEN** the card displays "Checking interactions: aspirin + warfarin" below the agent name, styled as a subdued informational line

#### Scenario: Card falls back to "Consulting..." when no tool call yet
- **WHEN** the cardiologist is `"active"` but no tool-call progress events have been received yet
- **THEN** the card displays "Consulting..." as before (existing behavior preserved)

#### Scenario: Card clears active tool when consultation completes
- **WHEN** the cardiologist transitions from `"active"` to `"completed"`
- **THEN** the card no longer shows any tool label and instead shows "Analysis complete" with the green checkmark

### Requirement: Progress log differentiates tool-call entries

Tool-call entries in the progress log SHALL be visually distinct from general progress messages. They SHALL be indented and rendered with a toned-down color to indicate they are sub-actions of a specialist consultation.

#### Scenario: Tool-call entry is indented and muted
- **WHEN** a progress event has `eventType: "tool_call"`
- **THEN** the log entry is rendered with left indentation and a more muted color than standard log entries

#### Scenario: Standard entries are not indented
- **WHEN** a progress event does not have `eventType` or has `eventType` equal to a non-tool value
- **THEN** the log entry is rendered at full width with the standard cyan color

### Requirement: Tool names map to human-readable labels

Each tool ID used in progress events SHALL map to a short, user-facing label via a static lookup table. Labels SHALL use present-tense action phrases suitable for UI display. The lookup table SHALL include labels for all 17 tools.

#### Scenario: Known tool maps to label
- **WHEN** `toolName` is `"drug-interaction"`
- **THEN** the human-readable label is `"Checking interactions"`

#### Scenario: New Orphadata tool maps to label
- **WHEN** `toolName` is `"rare-disease-search"`
- **THEN** the human-readable label is `"Searching rare diseases"`

#### Scenario: New HPO tool maps to label
- **WHEN** `toolName` is `"hpo-term-search"`
- **THEN** the human-readable label is `"Searching phenotype terms"`

#### Scenario: New LOINC tool maps to label
- **WHEN** `toolName` is `"loinc-test-lookup"`
- **THEN** the human-readable label is `"Looking up lab test"`

#### Scenario: New drug shortages tool maps to label
- **WHEN** `toolName` is `"drug-shortages"`
- **THEN** the human-readable label is `"Checking drug shortages"`

#### Scenario: New food adverse events tool maps to label
- **WHEN** `toolName` is `"food-adverse-events"`
- **THEN** the human-readable label is `"Searching food adverse events"`

#### Scenario: New device adverse events tool maps to label
- **WHEN** `toolName` is `"device-adverse-events"`
- **THEN** the human-readable label is `"Searching device adverse events"`

#### Scenario: Unknown tool uses fallback
- **WHEN** `toolName` is an unrecognized ID not in the label map
- **THEN** the label falls back to `"Running {toolName}"` with the raw tool ID

### Requirement: All tools are available to all specialist agents and the CMO

Every tool registered in the system SHALL be available to all 36 specialist agents and the Chief Medical Officer agent without per-specialist restrictions. The `getToolsForSpecialist(id)` function SHALL return the same set of tools regardless of the specialist ID passed.

#### Scenario: Geneticist accesses drug interaction tool
- **WHEN** the geneticist agent is initialized
- **THEN** it has access to `drug-interaction` tool alongside `rare-disease-search` and all other tools

#### Scenario: All specialists get new tools
- **WHEN** any specialist agent is initialized
- **THEN** it has access to all 17 tools including drug interactions, FDA data, clinical trials, MedlinePlus, Orphadata, NLM clinical tables, and more

#### Scenario: CMO has all tools
- **WHEN** the CMO agent is initialized
- **THEN** it has access to all 17 tools for orchestrating specialist consultations

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