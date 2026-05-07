## 1. Error Classification Foundation

- [x] 1.1 Create `src/backend/utils/errors.ts` with the typed error hierarchy: `AppError`, `RetriableError`, `LLMTimeoutError`, `APITimeoutError`, `RateLimitError`, `NonRetriableError`, `SchemaValidationError`, `PermanentAPIError`, `ToolError`
- [x] 1.2 Add `sanitizeForContext(message, maxLength?)` to `src/backend/utils/errors.ts` — strips URLs, file paths, truncates to 200 chars
- [x] 1.3 Add optional `shouldRetry?: (error: unknown) => boolean` predicate to `withRetry` in `diagnostic-workflow.ts`. Default behavior unchanged when not provided
- [x] 1.4 Write unit tests for error class hierarchy (`instanceof` checks), `sanitizeForContext`, and `withRetry` with predicate

## 2. Safe Report Fallback

- [x] 2.1 Add `createMinimalReport(errorContext: string): DiagnosisReport` to `diagnostic-workflow.ts` — constructs a valid Zod-passing report with 0% confidence diagnosis
- [x] 2.2 Replace `return retryResponse.object as DiagnosisReport` (line ~561) with `return createMinimalReport("...")`
- [x] 2.3 Replace `return fallbackResponse.object as DiagnosisReport` (line ~603) with `return createMinimalReport("...")`
- [x] 2.4 Add malformed output (truncated to 500 chars) to the correction prompt in `generateFinalReport` alongside Zod errors
- [x] 2.5 Write unit tests for `createMinimalReport` (validates against Zod schema) and verify correction prompt includes malformed output

## 3. Error Classification in Workflow

- [x] 3.1 Wrap LLM timeout errors from specialist `generate()` calls as `LLMTimeoutError` before `withRetry`
- [x] 3.2 Wrap Zod `safeParse` failures in the CMO loop as `SchemaValidationError` before incrementing `parseFailureCount`
- [x] 3.3 Pass `shouldRetry` classifier to `withRetry` in the CMO loop and specialist calls — classify `RetriableError` as retriable, `NonRetriableError` as non-retriable
- [x] 3.4 Apply `sanitizeForContext` to specialist error messages before they enter `contextHistory` (line ~919)
- [x] 3.5 Write unit tests for classified retry behavior (retriable retries, non-retriable propagates, abort always propagates)

## 4. Tool Error Transparency

- [x] 4.1 Define `ToolResult<T>` discriminated union type in `src/backend/tools/utils/types.ts`
- [x] 4.2 Update `fetchJSON` in `src/backend/tools/utils/fetch.ts` to throw typed errors: `APITimeoutError` on timeout, `RateLimitError` on 429, `PermanentAPIError` on other 4xx
- [x] 4.3 Migrate `pubmed-search.ts`: replace `.catch(() => ({}))` with try/catch returning `{ ok: false, error, retriable }` on failure, wrap success in `{ ok: true, data }`
- [x] 4.4 Migrate `drug-interaction.ts`: return `ToolResult` instead of empty arrays on failure
- [x] 4.5 Migrate `medlineplus.ts`: return `ToolResult` with error details on failure
- [x] 4.6 Migrate `clinical-trials.ts`: wrap tool execution in try/catch returning `ToolResult`
- [x] 4.7 Migrate `open-fda.ts`: return `ToolResult` with error details on failure
- [x] 4.8 Migrate `nlm-clinical-tables.ts`: return `ToolResult` with error details on failure
- [x] 4.9 Migrate `orphadata.ts`: return `ToolResult` with error details on failure
- [x] 4.10 Update tool descriptions to document `{ ok: false }` result shape so LLMs can interpret it
- [x] 4.11 Write/update tool tests to verify `ToolResult` return shape on success and failure

## 5. Logging Enhancement

- [x] 5.1 Add `errorType` field to `tool_result` progress events — extract from `AppError` subclass name or use `"UnknownError"` for generic errors
- [x] 5.2 Add `errorType` to `ProgressEvent` interface in frontend types
- [x] 5.3 Update existing tool-use-logging tests to verify `errorType` is present on failed events and absent on successful ones

## 6. Final Validation

- [x] 6.1 Run `bun run lint` and fix any issues
- [x] 6.2 Run `bun run test` and ensure all backend tests pass
- [x] 6.3 Run `bun run test:frontend` and ensure all frontend tests pass
- [x] 6.4 Run `bun run typecheck` and ensure no type errors
