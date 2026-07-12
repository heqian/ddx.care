## Requirements

### Requirement: Tool arguments redacted in audit logs

When `AUDIT_LOG_REDACT_TOOL_ARGS` is set to `"1"` (the default), the audit logger SHALL NOT record raw tool argument values (drug names, condition names, search queries). Instead, it SHALL record a summary (e.g., argument count or presence indicator) alongside the tool name, success/failure status, and duration. When set to `"0"`, raw arguments SHALL be logged (for debugging).

#### Scenario: Tool args redacted by default
- **WHEN** `AUDIT_LOG_REDACT_TOOL_ARGS` is not set or is `"1"` and a tool is called with arguments `["aspirin", "warfarin"]`
- **THEN** the audit log entry records the tool name and a redacted summary (e.g., `"args_present": true, "arg_count": 2`) but does NOT record the actual argument values

#### Scenario: Tool args logged when redaction disabled
- **WHEN** `AUDIT_LOG_REDACT_TOOL_ARGS=0` and a tool is called
- **THEN** the audit log entry includes the raw `toolArgs` as before

### Requirement: Time-based audit log purge

The `AuditLogger` SHALL support a `purgeOlderThan(hours)` method that removes JSON Lines entries older than the specified retention period. A timer SHALL call this method periodically (at most once per hour). The retention period SHALL be configurable via `AUDIT_LOG_RETENTION_HOURS` (default 168 / 7 days).

#### Scenario: Old entries purged on schedule
- **WHEN** the purge timer fires and there are entries older than `AUDIT_LOG_RETENTION_HOURS`
- **THEN** those entries are removed from the audit log file

#### Scenario: Recent entries preserved
- **WHEN** the purge timer fires and there are entries within the retention window
- **THEN** those entries remain in the audit log file unchanged

#### Scenario: Custom retention via environment
- **WHEN** `AUDIT_LOG_RETENTION_HOURS=24` is set
- **THEN** entries older than 24 hours are purged on the next purge cycle