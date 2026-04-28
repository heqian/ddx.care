## 1. Backend: Enriched Progress Events

- [x] 1.1 Add optional `eventType`, `agentId`, `toolName`, `toolArgs` fields to `ProgressEvent` interface in `src/backend/progress-store.ts`
- [x] 1.2 Add `ProgressEventType` union type exported from `src/backend/progress-store.ts`
- [x] 1.3 Add `emitEvent(jobId, event)` method on `JobStore` that stores the full `ProgressEvent` object and dispatches it — or extend `emitMessage` to accept both `string` and `ProgressEvent`
- [x] 1.4 Add `tool-labels.ts` utility file with `TOOL_LABELS` map and `formatToolLabel()` function

## 2. Backend: onStepFinish in Diagnostic Workflow

- [x] 2.1 Add `formatToolArgs(toolName, args)` helper in `diagnostic-workflow.ts` that extracts meaningful query text from tool arguments
- [x] 2.2 Update `emitProgress` closure in `runDiagnosis.execute()` to accept both `string` and `ProgressEvent`
- [x] 2.3 Add `onStepFinish` callback to the `specAgent.generate()` call that iterates `step.toolCalls` and emits a progress event per tool call, and reports tool errors from `step.toolResults`
- [x] 2.4 Tag existing progress events with `eventType` (`"round_start"`, `"cmo_decision"`, `"specialist_start"`, `"specialist_complete"`, `"cmo_final"`) to enable future frontend differentiation
- [x] 2.5 Update mock mode (`mockDiagnosis`) to emit the same event types for test consistency

## 3. Frontend: Type Definitions

- [x] 3.1 Add `ProgressEvent` interface with optional `eventType`, `agentId`, `toolName`, `toolArgs` fields to `src/frontend/api/types.ts`
- [x] 3.2 Update `WsMessage` discriminated union so the `"progress"` variant uses the enriched `ProgressEvent` type
- [x] 3.3 Update `StatusResponse.progress` to use the enriched `ProgressEvent` type

## 4. Frontend: Agent Card Tool Display

- [x] 4.1 Add optional `activeTool?: { toolName: string; args: string }` prop to `AgentStatusCardProps`
- [x] 4.2 Import `TOOL_LABELS` (or a frontend copy of tool label mapping) for human-readable tool names
- [x] 4.3 Render active tool info below agent name when `status === "active"` and `activeTool` is set, with `text-xs text-primary/80` styling
- [x] 4.4 Update `AgentGridProps` to accept an `activeTools?: Map<string, { toolName: string; args: string }>` prop and pass to each `AgentStatusCard`

## 5. Frontend: Progress Log and State Management

- [x] 5.1 Create `deriveAgentToolStates(progress, agents)` function in `WaitingRoom.tsx` that builds a `Map<string, AgentToolState>` with `status`, `activeTool`, and `toolLog` per agent
- [x] 5.2 Derive `activeTools` map from agent tool states for passing to `AgentGrid`
- [x] 5.3 Update progress log rendering: tool-call entries (`eventType === "tool_call"`) get `ml-4` indentation and `text-cyan-400/70` color
- [x] 5.4 Update progress log rendering: tool-result error entries (`eventType === "tool_result"`) get appropriate styling
- [x] 5.5 Keep existing behavior for events without `eventType` — render as standard cyan entries at full width

## 6. Tests

- [x] 6.1 Add tests in `tests/workflow.test.ts` for `onStepFinish`-driven tool-call progress event emission (verify event shape: `eventType`, `agentId`, `toolName`, `toolArgs`)
- [x] 6.2 Add tests in `tests/workflow.test.ts` for `formatToolArgs` helper with various tool argument shapes
- [x] 6.3 Add tests in `tests/frontend.test.tsx` for `AgentStatusCard` rendering active tool label and fallback to "Consulting..."
- [x] 6.4 Add tests in `tests/frontend.test.tsx` for `deriveAgentToolStates` with mixed progress events (tool calls, specialist starts/completions)
- [x] 6.5 Add tests in `tests/frontend.test.tsx` for progress log rendering differentiation between tool-call and standard entries

## 7. Lint and Integration Check

- [x] 7.1 Run `bun run lint` and fix any issues
- [x] 7.2 Run `bun run typecheck` and fix any type errors
- [x] 7.3 Run `bun run test` and `bun run test:frontend` to verify all tests pass
- [x] 7.4 Run `MOCK_LLM=1 bun run test:e2e` to verify the full mock flow renders tool-call entries (pre-existing env issue: missing libglib system library)
