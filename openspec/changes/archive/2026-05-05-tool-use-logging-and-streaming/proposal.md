## Why

When specialists consult on a case, they invoke medical tools (PubMed, RxNav, FDA, etc.) to gather evidence. Currently, tool invocations are only partially visible: `tool_call` progress events show *that* a tool was called, but there is no logging of tool invocations in the structured logger, no tracking of tool results or durations, and no `tool_result` events for successful calls. On the frontend, only the most recent tool per specialist is shown — users cannot see the full sequence of tool calls a specialist made or whether they succeeded. The CMO agent's own tool calls are completely invisible.

This means:
- Operators have **no audit trail** of which tools were called, with what arguments, and whether they succeeded.
- Users see a **blurry progress view** — a single "Searching PubMed" label per specialist, overwritten as tools complete, with no indication of success/failure.
- Debugging tool failures requires **digging through console logs** rather than querying structured log output.

## What Changes

- **Add `tool_call` and `tool_result` logging** — Every tool invocation (by specialists and CMO) is logged via `logger.toolCall()` and `logger.toolResult()` with the agent ID, tool name, args, duration, and success/error status.
- **Emit `tool_result` progress events for all tool calls** — Currently only failed tool calls emit a `tool_result` event. Replace this with a complete `tool_result` event for every tool call, carrying `agentId`, `toolName`, a `success` boolean, and a truncated result summary.
- **Track tool call durations** — Record start time when a tool call is detected in `onStepFinish`, emit the duration in both the log entry and the progress event when the corresponding result arrives.
- **Track CMO tool calls** — Add `onStepFinish` callback to the CMO agent's `generate()` calls, emitting the same `tool_call` and `tool_result` events with `agentId: "chiefMedicalOfficer"`.
- **Stream tool history in the frontend** — Replace the single-tool `deriveActiveTools()` with a per-specialist tool history that shows all tool calls and their completion status in the `AgentStatusCard` and progress log.
- **Display tool completion status** — Show a checkmark for successful, an X for failed, and a spinner for in-progress tool calls in both the agent card and the progress log.

## Capabilities

### New Capabilities
- `tool-use-logging`: Structured logging of all tool invocations and results via the existing `logger` with duration tracking.

### Modified Capabilities
- `tool-use-progress`: Extend `ProgressEvent` with `success`, `durationMs`, and `resultSummary` fields; emit `tool_result` events for all tool calls (not just failures); track CMO tool calls; display full tool history per specialist with completion status.

## Impact

- **Backend logger** (`src/backend/utils/logger.ts`): New `toolCall()` and `toolResult()` methods
- **Backend workflow** (`src/backend/workflows/diagnostic-workflow.ts`): Add `onStepFinish` to CMO calls, enhance specialist `onStepFinish` to emit complete `tool_result` events with duration, add tool call/result logging
- **Backend progress store** (`src/backend/progress-store.ts`): Extend `ProgressEvent` with `success`, `durationMs`, `resultSummary` optional fields
- **Backend tools** (`src/backend/tools/`): No changes (tools themselves don't need modification)
- **Frontend types** (`src/frontend/api/types.ts`): Add new fields to `ProgressEvent`, add `ToolStatus` type
- **Frontend status card** (`src/frontend/components/agents/AgentStatusCard.tsx`): Show tool history with completion indicators instead of single active tool
- **Frontend waiting room** (`src/frontend/pages/WaitingRoom.tsx`): Replace `deriveActiveTools()` with `deriveToolHistory()` that tracks all tool calls per specialist
- **Frontend progress log**: Show tool result status (success/fail) with visual indicators