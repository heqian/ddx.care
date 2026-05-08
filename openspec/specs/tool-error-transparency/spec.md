## ADDED Requirements

### Requirement: Tools return ToolResult discriminated union

All medical API tools SHALL return a `ToolResult<T>` discriminated union where `T` is the tool's data type:
- `{ ok: true; data: T }` for successful results
- `{ ok: false; error: string; retriable: boolean }` for failed results

The `ok: false` result SHALL include a human-readable `error` string explaining why the tool failed and a `retriable` boolean indicating whether the failure might resolve on retry.

#### Scenario: Drug interaction search succeeds
- **WHEN** `drugInteractionTool` queries "aspirin + warfarin" and the API returns valid results
- **THEN** the tool returns `{ ok: true, data: { interactions: [...], totalResults: 3 } }`

#### Scenario: Drug interaction API times out
- **WHEN** `drugInteractionTool` queries "aspirin + clopidogrel" and the API call times out after 10 seconds
- **THEN** the tool returns `{ ok: false, error: "Drug interaction check timed out after 10000ms", retriable: true }`

#### Scenario: Drug interaction API returns 404
- **WHEN** `drugInteractionTool` queries a drug that doesn't exist and the API returns 404
- **THEN** the tool returns `{ ok: false, error: "Drug not found in RxNav database", retriable: false }`

### Requirement: Tool error messages inform agents about missing data

When a tool returns `{ ok: false }`, the tool's output text to the agent SHALL include the error reason so the agent can reason about incomplete information. The tool description SHALL document the `{ ok: false }` result shape so the LLM knows how to interpret it.

#### Scenario: Agent sees tool error in output
- **WHEN** a specialist agent calls `drugInteractionTool` and it returns `{ ok: false, error: "RxNav unavailable" }`
- **THEN** the agent receives the error message as part of the tool result and can note in its analysis that drug interaction data was unavailable

#### Scenario: Agent distinguishes no results from API failure
- **WHEN** a specialist calls a tool that returns `{ ok: true, data: { results: [], totalResults: 0 } }`
- **THEN** the agent knows the API responded successfully and there are genuinely no results, as opposed to the API being down
