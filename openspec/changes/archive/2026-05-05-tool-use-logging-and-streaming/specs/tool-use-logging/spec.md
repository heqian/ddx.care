## ADDED Requirements

### Requirement: All tool invocations are logged

The structured logger SHALL emit `tool_call` and `tool_result` events for every tool invocation by both specialist agents and the CMO agent, including the agent ID, job ID, tool name, arguments, success status, duration, and result summary.

#### Scenario: Specialist calls PubMed search — logged
- **WHEN** the cardiologist agent calls the `pubmed-search` tool with query "acute chest pain guidelines"
- **THEN** the logger emits a `tool_call` event with `agentId: "cardiologist"`, `jobId`, `toolName: "pubmed-search"`, `toolArgs: "acute chest pain guidelines"`
- **AND** after the tool completes, the logger emits a `tool_result` event with `agentId: "cardiologist"`, `jobId`, `toolName: "pubmed-search"`, `success: true`, `durationMs`, `resultSummary`

#### Scenario: CMO tool call — logged
- **WHEN** the chiefMedicalOfficer agent calls any tool during a decision round
- **THEN** the logger emits `tool_call` and `tool_result` events with `agentId: "chiefMedicalOfficer"`

#### Scenario: Tool call fails — logged with success false
- **WHEN** a tool invocation returns an error
- **THEN** the logger emits a `tool_result` event with `success: false`, `durationMs`, and `resultSummary` containing the error description

### Requirement: tool_result progress events are emitted for all tool calls

Every tool invocation SHALL produce both a `tool_call` and a `tool_result` progress event. The `tool_result` event SHALL include `success`, `durationMs`, and `resultSummary` fields.

#### Scenario: Successful tool call produces paired events
- **WHEN** a specialist calls `drug-interaction` with arguments `"sumatriptan + sertraline"`
- **THEN** a `tool_call` progress event is emitted with `agentId`, `toolName`, `toolArgs`
- **AND** after the tool completes, a `tool_result` progress event is emitted with the same `agentId`, `toolName`, `success: true`, `durationMs`, and `resultSummary`

#### Scenario: Failed tool call produces error result event
- **WHEN** a tool call returns `isError: true`
- **THEN** a `tool_result` progress event is emitted with `success: false` and a `resultSummary` describing the error

#### Scenario: Tool result summary is truncated
- **WHEN** a tool returns a large result
- **THEN** `resultSummary` is truncated to 200 characters with `…` appended if truncated

### Requirement: ProgressEvent supports tool result fields

The `ProgressEvent` interface SHALL include optional fields `success`, `durationMs`, and `resultSummary` for `tool_result` events.

#### Scenario: tool_result event carries success, duration, and summary
- **WHEN** a `tool_result` progress event is emitted
- **THEN** it includes `success: boolean`, `durationMs?: number`, and `resultSummary?: string | null`

#### Scenario: Non-tool events omit new fields
- **WHEN** a `round_start` or `specialist_start` event is emitted
- **THEN** the event does not include `success`, `durationMs`, or `resultSummary` fields

### Requirement: CMO tool calls are tracked in progress events

The CMO agent's `generate()` calls SHALL include an `onStepFinish` callback that emits `tool_call` and `tool_result` progress events with `agentId: "chiefMedicalOfficer"`.

#### Scenario: CMO calls a tool during decision round
- **WHEN** the CMO agent calls `medlineplus-search` during a decision round
- **THEN** progress events are emitted with `agentId: "chiefMedicalOfficer"`, `eventType: "tool_call"` and `eventType: "tool_result"`

#### Scenario: CMO generates text without tool calls
- **WHEN** the CMO responds with text only (no tool calls in the step)
- **THEN** no tool events are emitted for that step (existing behavior preserved)

### Requirement: Frontend displays per-specialist tool history with status indicators

The `AgentStatusCard` SHALL display a list of all tool calls made by the specialist, each with a status indicator: spinner for running, checkmark for success, X for error. The most recent tool is shown with its query text; older tools show only the tool label.

#### Scenario: Specialist active with multiple tool calls
- **WHEN** the cardiologist has called 3 tools: `pubmed-search` (success), `drug-interaction` (success), `adverse-events` (running)
- **THEN** the card shows all 3 tools with appropriate status icons (✓, ✓, ⟳) and the running tool shows its query text

#### Scenario: Tool call completes while viewing
- **WHEN** a `tool_result` event arrives with `success: true` for a running tool
- **THEN** the tool status changes from spinner to checkmark

#### Scenario: Specialist completes consultation
- **WHEN** the specialist transitions from `"active"` to `"completed"`
- **THEN** all tool entries show their final status (checkmark or X) and the card displays "Analysis complete"

### Requirement: Progress log shows tool result status

Tool entries in the progress log SHALL include a visual indicator of success or failure after the `tool_result` event arrives.

#### Scenario: Successful tool result in progress log
- **WHEN** a `tool_result` event with `success: true` arrives
- **THEN** the log entry is rendered with a green checkmark icon and the duration in milliseconds

#### Scenario: Failed tool result in progress log
- **WHEN** a `tool_result` event with `success: false` arrives
- **THEN** the log entry is rendered with a red X icon