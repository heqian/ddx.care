## ADDED Requirements

### Requirement: Typed error hierarchy for LLM and tool failures

The system SHALL define error classes in `src/backend/utils/errors.ts` with the following hierarchy:
- `AppError` (base, extends `Error`) with an optional `cause` property
- `RetriableError` (extends `AppError`) — for errors where retrying may succeed
- `LLMTimeoutError` (extends `RetriableError`) — LLM call exceeded timeout
- `APITimeoutError` (extends `RetriableError`) — external API call exceeded timeout
- `RateLimitError` (extends `RetriableError`) — external API returned 429
- `NonRetriableError` (extends `AppError`) — for errors where retrying will not help
- `SchemaValidationError` (extends `NonRetriableError`) — structured output failed Zod validation
- `PermanentAPIError` (extends `NonRetriableError`) — external API returned 4xx (not 429)
- `ToolError` (extends `AppError`) — wraps a tool name and the underlying error

#### Scenario: LLM timeout creates RetriableError subclass
- **WHEN** an LLM `generate()` call throws due to a timeout
- **THEN** the error SHALL be an instance of `LLMTimeoutError` and `RetriableError`

#### Scenario: Schema validation failure creates NonRetriableError subclass
- **WHEN** a Zod `safeParse()` call returns `{ success: false }`
- **THEN** the error SHALL be an instance of `SchemaValidationError` and `NonRetriableError`

#### Scenario: API 429 creates RateLimitError
- **WHEN** an external API returns HTTP 429
- **THEN** the error SHALL be an instance of `RateLimitError` and `RetriableError`

### Requirement: withRetry respects error classification

The `withRetry` function SHALL accept an optional `shouldRetry?: (error: unknown) => boolean` predicate. When provided, the predicate is called before deciding to retry. When the predicate returns `false`, the error is immediately re-thrown without retrying. When not provided, existing behavior (retry all errors except abort) SHALL be preserved.

#### Scenario: Retriable error retries
- **WHEN** `withRetry` is called with a `shouldRetry` predicate and the function throws a `RetriableError`
- **THEN** `withRetry` retries up to `maxRetries` times with exponential backoff

#### Scenario: NonRetriable error does not retry
- **WHEN** `withRetry` is called with a `shouldRetry` predicate and the function throws a `NonRetriableError`
- **THEN** `withRetry` immediately re-throws the error without retrying

#### Scenario: No predicate preserves existing behavior
- **WHEN** `withRetry` is called without a `shouldRetry` predicate
- **THEN** it retries all errors (except `AbortError`) as it does today

#### Scenario: AbortError always propagates immediately
- **WHEN** an `AbortError` is thrown regardless of `shouldRetry` predicate
- **THEN** `withRetry` immediately re-throws without retrying

### Requirement: Error messages sanitized before agent context injection

The system SHALL provide a `sanitizeForContext(message: string, maxLength?: number)` function that strips URLs, file paths, and caps message length (default 200 chars) before error messages are injected into agent context history.

#### Scenario: URL in error message is removed
- **WHEN** an error message contains `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?api_key=SECRET`
- **THEN** `sanitizeForContext` returns the message with the URL replaced by `[url removed]`

#### Scenario: Long error message is truncated
- **WHEN** an error message is 500 characters long and `maxLength` is 200
- **THEN** `sanitizeForContext` returns the first 197 characters followed by `...`

#### Scenario: Clean error message passes through
- **WHEN** an error message is `"PubMed API timeout"` and is under 200 characters
- **THEN** `sanitizeForContext` returns the message unchanged
