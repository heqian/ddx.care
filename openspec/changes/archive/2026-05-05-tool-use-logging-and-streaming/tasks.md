## 1. Backend: Logger Tool Methods

- [x] 1.1 Add `toolCall(agentId, jobId, toolName, toolArgs)` method to `src/backend/utils/logger.ts` that emits a `tool_call` event with all fields
- [x] 1.2 Add `toolResult(agentId, jobId, toolName, success, durationMs, resultSummary)` method to `src/backend/utils/logger.ts` that emits a `tool_result` event with all fields

## 2. Backend: ProgressEvent Schema Extension

- [x] 2.1 Add `success?: boolean`, `durationMs?: number`, and `resultSummary?: string | null` optional fields to the `ProgressEvent` interface in `src/backend/progress-store.ts`
- [x] 2.2 Update the frontend `ProgressEvent` type in `src/frontend/api/types.ts` to mirror the backend fields

## 3. Backend: Workflow Tool Call/Result Tracking

- [x] 3.1 Create `src/backend/workflows/tool-result-summary.ts` with a `summarizeToolResult(toolName: string, result: unknown): string | null` function that extracts a human-readable summary (max 200 chars) from tool results — handles arrays by showing count, objects by showing first key values, strings by truncating, and errors by extracting the message
- [x] 3.2 Create `src/backend/workflows/on-step-finish.ts` with a `createStepEventHandler(agentId: string, jobId: string, emit: EmitFn)` factory function that returns an `onStepFinish` callback. The callback should: (a) record `Date.now()` as `stepStart`, (b) iterate `step.toolCalls` emitting `tool_call` progress events and `logger.toolCall()` calls, (c) iterate `step.toolResults` emitting `tool_result` progress events with `success`, `durationMs`, and `resultSummary` and `logger.toolResult()` calls. This replaces the inline `onStepFinish` logic in the workflow.
- [x] 3.3 Refactor `src/backend/workflows/diagnostic-workflow.ts` to use `createStepEventHandler` for specialist agent `generate()` calls, replacing the existing inline `onStepFinish` callback
- [x] 3.4 Add `onStepFinish` callback (using `createStepEventHandler` with `agentId: "chiefMedicalOfficer"`) to the CMO agent's `generate()` calls in the workflow — both the decision-making loop and the final forced report generation
- [x] 3.5 Add `resultSummary` extraction to the existing `tool_result` error path, including `success: false` and `durationMs: 0`

## 4. Backend: Tool Result Summary Extraction

- [x] 4.1 For each tool type, define extraction logic in `summarizeToolResult()`: PubMed results → `"N results for '<query>'"`, drug interaction → `"N interactions found"` or `"No interactions found"`, FDA labels → `"Label found for <drug>"`, adverse events → `"N adverse events"`, clinical trials → `"N trials found"`, MedlinePlus → `"N topics"`, Orphadata → `"N rare diseases"`, generic fallback → truncate JSON to 200 chars
- [x] 4.2 Ensure `resultSummary` is `null` when the result is empty or `undefined`

## 5. Frontend: Tool History Derivation

- [x] 5.1 Define `ToolHistoryEntry` type in `src/frontend/api/types.ts`: `{ toolName: string; toolArgs: string | null; status: "running" | "success" | "error"; durationMs?: number; resultSummary?: string | null }`
- [x] 5.2 Replace `deriveActiveTools()` in `src/frontend/pages/WaitingRoom.tsx` with `deriveToolHistory()` that returns `Map<string, ToolHistoryEntry[]>` — appends on `tool_call`, updates the last running entry on `tool_result` (matching by sequential order within the specialist's tool events)
- [x] 5.3 Update `WaitingRoom` state and `AgentGrid`/`AgentStatusCard` props to pass `toolHistory: Map<string, ToolHistoryEntry[]>` instead of `activeTools`

## 6. Frontend: AgentStatusCard Tool History Display

- [x] 6.1 Update `AgentStatusCard` props to accept `toolHistory?: ToolHistoryEntry[]` instead of `activeTool`
- [x] 6.2 Render the tool history as a compact list below the agent name when status is `"active"`. Each entry shows: status icon (⟳ spinner for running, ✓ green checkmark for success, ✗ red X for error), tool label (from `formatToolLabel`), and for the most recent running entry, the `toolArgs` text
- [x] 6.3 When status is `"completed"`, show a brief summary line like "3 tools used — all successful" or "3 tools used — 1 failed"
- [x] 6.4 Cap displayed tool history at 10 entries per specialist, with a "+N more" indicator if exceeded

## 7. Frontend: Progress Log Tool Result Indicators

- [x] 7.1 Update the progress log rendering in `WaitingRoom.tsx` to show `tool_result` events with a status indicator: green ✓ for `success: true`, red ✗ for `success: false`, and duration text like `(1.2s)`
- [x] 7.2 Ensure `tool_call` events continue to show the spinning indicator (⟳) and are updated to show completion status when the paired `tool_result` arrives — or simply render both event types distinctly (tool_call = "Calling...", tool_result = "Completed ✓" or "Failed ✗")

## 8. Mock Data Updates

- [x] 8.1 Update `mockDiagnosis()` in `src/backend/workflows/diagnostic-workflow.ts` to emit `tool_result` events with `success`, `durationMs`, and `resultSummary` alongside existing `tool_call` events
- [x] 8.2 Verify E2E tests in `tests/e2e/full-flow.spec.ts` still pass with the new event structure

## 9. Testing

- [x] 9.1 Add unit tests for `logger.toolCall()` and `logger.toolResult()` methods in `tests/logger.test.ts`
- [x] 9.2 Add unit tests for `summarizeToolResult()` in `tests/workflow.test.ts` covering common tool result shapes, error results, and truncation
- [x] 9.3 Add unit tests for `createStepEventHandler()` in `tests/workflow.test.ts` verifying that `tool_call` and `tool_result` events are emitted correctly for both single and multi-tool steps
- [x] 9.4 Add unit tests for `deriveToolHistory()` in `tests/frontend.test.tsx` covering: empty history, running tools, completed tools, mixed success/error, multiple specialists
- [x] 9.5 Run `bun run lint && bun run typecheck` to verify all changes