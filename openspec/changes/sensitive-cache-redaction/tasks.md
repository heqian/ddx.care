## 1. Log Redaction

- [ ] 1.1 Add a `redactUrl(url)` helper in `src/backend/tools/utils/fetch.ts` returning `{ host, path, paramHash }` with a keyed HMAC of normalized query params
- [ ] 1.2 Replace `logger.info("tool_cache_hit", { url })` with the redacted form
- [ ] 1.3 Update timeout and error messages in `fetchJSON` to use host/path instead of the raw URL

## 2. Tool-Result Summary Redaction

- [ ] 2.1 Add a `redact` parameter to `summarizeToolResult()` in `src/backend/workflows/tool-result-summary.ts`
- [ ] 2.2 Replace drug/condition/name-specific summary branches with count-based summaries when `redact` is true
- [ ] 2.3 Pass `AUDIT_LOG_REDACT_TOOL_ARGS` from `src/backend/workflows/on-step-finish.ts` into the summarizer

## 3. File Permissions

- [ ] 3.1 Set `process.umask(0o077)` at the top of `index.ts` before any store construction
- [ ] 3.2 Add a `ensureDataDirPermissions(path)` helper in `src/backend/config.ts` that creates the data directory with `0700` and tightens existing db files to `0600`
- [ ] 3.3 Call the helper from `JobStore`, `initToolCache()`, and Orphadata cache initialization for their respective paths

## 4. Cache Purge on Disable

- [ ] 4.1 In `initToolCache()`, when `TOOL_CACHE_ENABLED` is false, best-effort unlink `tool-cache.sqlite`, `tool-cache.sqlite-wal`, and `tool-cache.sqlite-shm`

## 5. Tests

- [ ] 5.1 Add `tests/fetch-utils.test.ts` cases asserting cache-hit logs and timeout errors do not contain query terms
- [ ] 5.2 Add `tests/tool-cache.test.ts` case asserting the existing database is purged when `TOOL_CACHE_TTL_MS=0`
- [ ] 5.3 Add `tests/logger.test.ts` / `tests/audit-logger.test.ts` cases asserting redacted summaries omit drug names when redaction is enabled
- [ ] 5.4 Add a test asserting new SQLite files are `0600` and the data directory is `0700`

## 6. Documentation and Verification

- [ ] 6.1 Update `AGENTS.md` PHI retention section to include the tool cache and upstream access-log disclosure
- [ ] 6.2 Update `.env.example` to note the purge-on-disable behavior
- [ ] 6.3 Run `bun run lint`, `bun run typecheck`, and `bun run test`