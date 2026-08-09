## Purpose

Treats the medical-tool response cache as a PHI-derived surface by redacting patient-derived query terms from logs, enforcing owner-only file permissions on SQLite databases, and purging the cache when caching is disabled.

## ADDED Requirements

### Requirement: Cache logs do not include query parameters

Cache-hit and cache-miss logs SHALL record only the request host and path. Query parameters SHALL be replaced by a keyed, non-reversible hash of normalized parameters (or omitted entirely). Timeout and error messages SHALL NOT include the raw URL.

#### Scenario: Cache hit is logged without query terms
- **WHEN** a cache hit occurs for `https://api.fda.gov/drug/label.json?search=openfda.generic_name:warfarin`
- **THEN** the log entry records `host: api.fda.gov`, `path: /drug/label.json`, and a parameter hash, but does not record `warfarin` or the raw query string

#### Scenario: Timeout error does not include the URL
- **WHEN** a fetch times out for a URL containing a drug name query
- **THEN** the timeout error message references the host and path, not the raw URL

### Requirement: SQLite databases use owner-only permissions

The jobs database, tool-cache database, and Orphadata database (including WAL and SHM sidecars) SHALL be created with owner-only file permissions. The data directory SHALL be `0700`. The process SHALL set a `0077` umask before creating any storage, and existing files SHALL be migrated to `0600` on startup where writable.

#### Scenario: Fresh database is owner-only
- **WHEN** a new SQLite database is created by the server
- **THEN** the database file and any WAL/SHM sidecars are mode `0600` and the containing directory is `0700`

#### Scenario: Existing world-readable database is tightened
- **WHEN** the server starts and finds an existing database file at mode `0644`
- **THEN** the server changes the file mode to `0600` if the process has permission to do so

### Requirement: Disabling the cache purges existing data

When `TOOL_CACHE_TTL_MS=0`, the server SHALL purge any existing tool-cache SQLite database file on startup rather than merely skipping initialization. The purge SHALL remove the database file and its WAL/SHM sidecars.

#### Scenario: Cache disabled with existing database
- **WHEN** `TOOL_CACHE_TTL_MS=0` is set and a `tool-cache.sqlite` file exists from a prior run
- **THEN** the server deletes the database and sidecar files on startup before accepting requests

#### Scenario: Cache disabled with no existing database
- **WHEN** `TOOL_CACHE_TTL_MS=0` is set and no cache database exists
- **THEN** startup proceeds without error and no cache database is created

### Requirement: Tool-result summaries honor redaction

When `AUDIT_LOG_REDACT_TOOL_ARGS=1`, tool-result summaries emitted to progress events and audit logs SHALL NOT include drug names, condition names, or query terms. Summaries SHALL be restricted to counts (e.g., "2 interactions found"), status, and generic labels.

#### Scenario: Redacted summary omits drug names
- **WHEN** `AUDIT_LOG_REDACT_TOOL_ARGS=1` and a drug-interaction tool returns one interaction
- **THEN** the summary is "1 interaction found" and does not include the drug names

#### Scenario: Redaction disabled preserves detail for debugging
- **WHEN** `AUDIT_LOG_REDACT_TOOL_ARGS=0` and a drug-interaction tool returns one interaction
- **THEN** the summary may include drug names for debugging purposes