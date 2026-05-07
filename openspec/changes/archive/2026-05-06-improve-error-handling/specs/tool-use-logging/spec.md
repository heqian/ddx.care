## MODIFIED Requirements

### Requirement: Tool call fails — logged with success false

The structured logger SHALL emit a `tool_result` event with `success: false`, `durationMs`, `resultSummary` containing the error description, and an `errorType` field containing the error class name (e.g., `"APITimeoutError"`, `"SchemaValidationError"`, `"RateLimitError"`). When the error is not an `AppError` subclass, `errorType` SHALL be `"UnknownError"`.

#### Scenario: Tool call fails with classified error — logged with error type
- **WHEN** a tool invocation throws an `APITimeoutError`
- **THEN** the logger emits a `tool_result` event with `success: false`, `durationMs`, `resultSummary`, and `errorType: "APITimeoutError"`

#### Scenario: Tool call fails with unclassified error — logged as UnknownError
- **WHEN** a tool invocation throws a generic `Error`
- **THEN** the logger emits a `tool_result` event with `success: false`, `durationMs`, `resultSummary`, and `errorType: "UnknownError"`

### Requirement: ProgressEvent supports tool result fields

The `ProgressEvent` interface SHALL include optional fields `success`, `durationMs`, `resultSummary`, and `errorType` for `tool_result` events.

#### Scenario: tool_result event carries error type
- **WHEN** a `tool_result` progress event is emitted for a failed tool call
- **THEN** it includes `errorType?: string` in addition to existing `success`, `durationMs`, and `resultSummary` fields

#### Scenario: Successful tool_result omits error type
- **WHEN** a `tool_result` progress event is emitted for a successful tool call
- **THEN** the event includes `success: true` and does not include `errorType`
