## MODIFIED Requirements

### Requirement: Tool arguments redacted in audit logs

When `AUDIT_LOG_REDACT_TOOL_ARGS` is set to `"1"` (the default), the audit logger SHALL NOT record raw tool argument values (drug names, condition names, search queries). Instead, it SHALL record a summary (e.g., argument count or presence indicator) alongside the tool name, success/failure status, and duration. Tool-result summaries SHALL also honor this setting and SHALL NOT include drug names, condition names, or query terms. When set to `"0"`, raw arguments and detailed summaries SHALL be logged (for debugging). The tool-response cache SHALL be documented as a PHI-derived surface: cached URLs contain patient-derived query terms and responses are retained for `TOOL_CACHE_TTL_MS`.

#### Scenario: Tool args redacted by default
- **WHEN** `AUDIT_LOG_REDACT_TOOL_ARGS` is not set or is `"1"` and a tool is called with arguments `["aspirin", "warfarin"]`
- **THEN** the audit log entry records the tool name and a redacted summary (e.g., `"args_present": true, "arg_count": 2`) but does NOT record the actual argument values

#### Scenario: Tool result summary redacted by default
- **WHEN** `AUDIT_LOG_REDACT_TOOL_ARGS` is not set or is `"1"` and a drug-interaction tool returns one interaction
- **THEN** the progress and audit summary is "1 interaction found" and does not include drug names

#### Scenario: Tool args logged when redaction disabled
- **WHEN** `AUDIT_LOG_REDACT_TOOL_ARGS=0` and a tool is called
- **THEN** the audit log entry includes the raw `toolArgs` and detailed summary as before