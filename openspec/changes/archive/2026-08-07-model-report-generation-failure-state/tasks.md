## 1. Shared Outcome Contract

- [x] 1.1 Define shared Zod schemas for available and generation-failed report outcomes
- [x] 1.2 Derive backend and frontend TypeScript types from the shared schema
- [x] 1.3 Define stable public error codes and retryability mapping for generation failures

## 2. Workflow Refactor

- [x] 2.1 Refactor final report generation to return the discriminated outcome union
- [x] 2.2 Replace the routine minimal diagnosis with a generation-failed outcome
- [x] 2.3 Remove greedy JSON extraction and invalid Zod-shape serialization fallbacks
- [x] 2.4 Preserve cancellation and timeout as workflow failures outside the report outcome union
- [x] 2.5 Update workflow formatting so validated reports return the available variant

## 3. API and Frontend

- [x] 3.1 Update persisted result, status response, and WebSocket completion schemas
- [x] 3.2 Update the API client to validate report outcomes at runtime
- [x] 3.3 Add a dedicated unavailable-report view with retry and professional-evaluation guidance
- [x] 3.4 Disable diagnosis cards, urgency badges, print, and export for generation-failed outcomes

## 4. Verification and Migration

- [x] 4.1 Replace tests that require 0% confidence and Routine urgency on generation failure
- [x] 4.2 Add structured-output exception, correction failure, empty response, and provider outage tests
- [x] 4.3 Add API, WebSocket, frontend, and E2E contract tests for both outcome variants
- [x] 4.4 Update API and operator documentation for the breaking response shape
- [x] 4.5 Run `bun run lint`, `bun run typecheck`, backend tests, frontend tests, and relevant E2E tests
