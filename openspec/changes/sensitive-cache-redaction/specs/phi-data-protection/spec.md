## MODIFIED Requirements

### Requirement: Tool arguments redacted in audit logs

When `AUDIT_LOG_REDACT_TOOL_ARGS` is set to `"1"` (the default), the audit logger SHALL NOT record raw tool argument values (drug names, condition names, search queries). Instead, it SHALL record a summary (e.g., argument count or presence indicator) alongside the tool name, success/failure status, and duration. The same redacted record SHALL be sent to application stdout: free-form tool/cache/fetch messages, raw tool arguments, raw or summarized results, provider/transport error text, and nested causes SHALL NOT expose patient-derived terms or raw request URLs in either sink. Safe status, count, duration, retry classification, agent/tool identifiers, and job correlation fields MAY remain.

Production SHALL force the effective setting to `"1"`; an explicit `AUDIT_LOG_REDACT_TOOL_ARGS=0` or any unsupported value SHALL fail configuration before the server accepts traffic. Outside production, raw arguments SHALL be logged for debugging only when `AUDIT_LOG_REDACT_TOOL_ARGS=0` is explicitly selected as a break-glass mode. Cache/fetch observability SHALL never log raw URLs or request terms in either mode.

Capability-authorized progress events and status responses SHALL remain application data rather than audit-log data. They MAY contain clinically useful tool arguments and result summaries for the authorized job and SHALL remain protected and deleted under the existing job authorization and `JOB_TTL_MS` lifecycle; stdout/audit redaction SHALL NOT mutate those persisted or streamed progress events.

#### Scenario: Tool args redacted by default
- **WHEN** `AUDIT_LOG_REDACT_TOOL_ARGS` is not set or is `"1"` and a tool is called with arguments `["aspirin", "warfarin"]`
- **THEN** the audit log entry and stdout record the tool name and a redacted summary (e.g., `"args_present": true, "arg_count": 2`) but do NOT record the actual argument values

#### Scenario: Tool result and nested error data redacted by default
- **WHEN** `AUDIT_LOG_REDACT_TOOL_ARGS` is not set or is `"1"` and a tool result, free-form message, error, or nested cause contains a drug, condition, search term, or request URL
- **THEN** application stdout and every active or rotated audit-log record contain only approved generic metadata and do not contain the sensitive value or raw URL

#### Scenario: Authorized progress remains job data
- **WHEN** an authorized client receives or later polls a tool progress event while log redaction is enabled
- **THEN** the progress event retains the clinically useful job data, is not copied verbatim to stdout or the audit log, and remains governed by job authorization and `JOB_TTL_MS`

#### Scenario: Tool args logged when redaction disabled
- **WHEN** `AUDIT_LOG_REDACT_TOOL_ARGS=0` is explicitly set outside production and a tool is called
- **THEN** the audit log entry includes raw `toolArgs` as before, stdout uses the same detailed record, and the process identifies that non-production execution is using sensitive break-glass logging

#### Scenario: Production rejects raw logging
- **WHEN** `NODE_ENV=production` and `AUDIT_LOG_REDACT_TOOL_ARGS=0` or another unsupported value is configured
- **THEN** startup fails before accepting traffic without logging tool data or the rejected configuration value

### Requirement: Time-based audit log purge

The `AuditLogger` SHALL support a `purgeOlderThan(hours)` method that removes JSON Lines entries older than the specified retention period. A timer SHALL call this method periodically (at most once per hour). The retention period SHALL be configurable via `AUDIT_LOG_RETENTION_HOURS` (default 168 / 7 days).

Before startup becomes ready, and again on the periodic schedule, purge SHALL cover the active audit file and every matching rotated audit file. A file that requires retained entries to be rewritten SHALL use an atomic replacement created and installed with owner-only permissions; failure SHALL leave the original file intact. Startup purge, permission, or replacement failure SHALL prevent readiness and traffic admission. A periodic failure SHALL mark readiness unready until a later successful purge, emit only a generic non-sensitive failure code, and SHALL NOT expose a path, line, or retained log content.

#### Scenario: Old entries purged on schedule
- **WHEN** the purge timer fires and there are entries older than `AUDIT_LOG_RETENTION_HOURS`
- **THEN** those entries are removed from the audit log file

#### Scenario: Recent entries preserved
- **WHEN** the purge timer fires and there are entries within the retention window
- **THEN** those entries remain in the audit log file unchanged

#### Scenario: Custom retention via environment
- **WHEN** `AUDIT_LOG_RETENTION_HOURS=24` is set
- **THEN** entries older than 24 hours are purged on the next purge cycle

#### Scenario: Startup covers active and rotated files
- **WHEN** the redacted release starts with expired entries in the active audit file or any matching rotation
- **THEN** all such files are purged before readiness and no traffic is admitted until the purge succeeds

#### Scenario: Purge replacement is atomic and owner-only
- **WHEN** an active or rotated file contains both retained and expired entries
- **THEN** purge installs an owner-only atomic replacement containing the retained entries and never exposes a partially rewritten file

#### Scenario: Startup purge fails closed
- **WHEN** startup cannot read, securely replace, chmod, or remove an active or rotated audit file as required by retention
- **THEN** startup remains unready, preserves the original file, and reports only a generic non-sensitive failure

#### Scenario: Periodic purge failure removes readiness
- **WHEN** a periodic purge cannot complete safely after traffic has previously been admitted
- **THEN** the original files remain intact, readiness becomes unready until a successful retry, and no sensitive diagnostic value is logged

## ADDED Requirements

### Requirement: Sensitive cache and observability retention is documented

The PHI data-protection documentation SHALL identify the tool-response cache, authorized progress history, active and rotated audit logs, application/container stdout and stderr, aggregated logs, backups, snapshots, and upstream medical-API requests as distinct sensitive-data surfaces. It SHALL distinguish logical expiration from physical erasure: cache entries and terminal jobs become unavailable at their configured TTLs, while SQLite free pages/WAL files, filesystem snapshots, backups, and external log copies can outlive application deletion. It SHALL state that pseudonymous cache keys do not make plaintext response values non-sensitive, owner-only permissions do not replace disk encryption, and deployment operators own encrypted storage, backup exclusion/retention, disk-capacity limits, and external-log deletion.

#### Scenario: Operator reviews retention boundaries
- **WHEN** an operator reviews PHI retention guidance before enabling the tool cache
- **THEN** the guidance separately describes cache logical TTL, SQLite physical-remanence mitigations, authorized progress retention under `JOB_TTL_MS`, upstream disclosure, and the operator responsibilities for encrypted disks, backups, snapshots, and capacity monitoring

#### Scenario: Historical logs are handled during rollout
- **WHEN** a deployment upgrades from a version that could log raw tool URLs, arguments, results, or errors
- **THEN** operators stop and drain old writers, start the redacted release behind a closed traffic gate, purge and verify active/rotated application logs plus container-runtime, host-journal, log-shipper, aggregated-log, backup, and snapshot copies, and only then admit traffic
