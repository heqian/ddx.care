## ADDED Requirements

### Requirement: Tool call progress events are emitted during specialist consultation

When a specialist agent invokes a tool during `agent.generate()`, the system SHALL emit a progress event with `eventType: "tool_call"` containing the specialist's `agentId`, the `toolName`, and a human-readable `toolArgs` string describing the query.

#### Scenario: Specialist calls PubMed search
- **WHEN** a cardiologist agent calls the `pubmed-search` tool with query "acute chest pain guidelines"
- **THEN** a progress event is emitted with `eventType: "tool_call"`, `agentId: "cardiologist"`, `toolName: "pubmed-search"`, `toolArgs: "acute chest pain guidelines"`, and `message` containing a human-readable summary like "Cardiologist: Searching PubMed → acute chest pain guidelines"

#### Scenario: Specialist calls drug interaction check
- **WHEN** a neurologist agent calls the `drug-interaction` tool with `drugName: "sumatriptan"` and `drugName2: "sertraline"`
- **THEN** a progress event is emitted with `eventType: "tool_call"`, `agentId: "neurologist"`, `toolName: "drug-interaction"`, `toolArgs: "sumatriptan + sertraline"`

#### Scenario: Step has multiple tool calls
- **WHEN** an agent step results in 3 tool calls (PubMed, RxNav, FDA label)
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
- **WHEN** a progress event has `eventType: "tool_call"`, `agentId: "cardiologist"`, `toolName: "pubmed-search"`, and `toolArgs: "chest pain"`
- **THEN** the frontend can access all four fields to attribute and display the tool call

### Requirement: Agent status card displays the active tool

When a specialist agent is in the `"active"` state and has a current tool call in progress, the `AgentStatusCard` component SHALL display the tool's human-readable label and query below the agent's name.

#### Scenario: Card shows active tool during consultation
- **WHEN** the cardiologist is `"active"` and the most recent tool-call event is `toolName: "pubmed-search"`, `toolArgs: "chest pain guidelines"`
- **THEN** the card displays "Searching PubMed: chest pain guidelines" below the agent name, styled as a subdued informational line

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

Each tool ID used in progress events SHALL map to a short, user-facing label via a static lookup table. Labels SHALL use present-tense action phrases suitable for UI display.

#### Scenario: Known tool maps to label
- **WHEN** `toolName` is `"pubmed-search"`
- **THEN** the human-readable label is `"Searching PubMed"`

#### Scenario: Unknown tool uses fallback
- **WHEN** `toolName` is an unrecognized ID not in the label map
- **THEN** the label falls back to `"Running {toolName}"` with the raw tool ID
