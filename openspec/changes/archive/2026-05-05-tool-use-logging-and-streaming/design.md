## Context

ddx.care uses a multi-round CMO-supervisor workflow where specialist agents call medical tools (22 total: PubMed, RxNav, OpenFDA, ClinicalTrials.gov, MedlinePlus, Orphadata, NLM Clinical Tables) via the Mastra agent framework. The `onStepFinish` callback on `agent.generate()` fires per LLM step and exposes `step.toolCalls` and `step.toolResults` arrays.

Current progress events (`ProgressEvent`) support `eventType`, `agentId`, `toolName`, and `toolArgs`. The `tool_call` event fires for every tool invocation but `tool_result` fires only for errors. No duration tracking exists. The CMO agent has no `onStepFinish` callback at all. The existing logger has `specialistCall()` but no per-tool logging methods.

Frontend `AgentStatusCard` shows a single "active tool" label per specialist (overwritten on each new `tool_call`). The progress log indents tool events with a muted color but shows no success/failure status.

## Goals / Non-Goals

**Goals:**
- Log every tool invocation (specialist + CMO) with agent ID, tool name, args, duration, and success/error to the structured logger
- Emit complete `tool_result` progress events for all tool calls (not just errors) with success, duration, and a truncated result summary
- Track CMO tool calls with the same `onStepFinish` pattern
- Show per-specialist tool call history with completion indicators in the frontend
- Display tool result success/failure visually in the progress log

**Non-Goals:**
- Streaming tool *result data* to the frontend (too large, not useful to end users)
- Adding new tools or changing tool assignments
- Changing the Mastra agent model or specialist composition
- Persisting tool call history beyond the existing job TTL (60 min)
- Tracking token usage per tool call

## Decisions

### D1: Tool call/result correlation via sequential pairing

**Decision:** Correlate `tool_call` and `tool_result` events by sequential ordering within a specialist's `onStepFinish` callback. Each `stepResult.toolCalls` entry at index `i` pairs with `stepResult.toolResults` at index `i` (via `toolCallId`, but we use index for simplicity since they appear in the same step).

The `onStepFinish` callback already receives both `toolCalls` and `toolResults` in the same step object. We emit a `tool_call` event for each call, then immediately emit a `tool_result` event for each result in the same step. This means the `tool_result` follows its `tool_call` with near-zero gap.

**Rationale:** The AI SDK's `StepResult` bundles tool calls and results for each step. We don't need a separate correlation mechanism — within a single step, calls and results are naturally paired by index.

**Alternatives considered:**
- `toolCallId`-based correlation across steps → Fragile; results may arrive in a different step than the call
- Tracking start time across `onStepFinish` invocations → Complex; a single `onStepFinish` fires after both call and result are ready

### D2: Tool call duration from step metadata

**Decision:** Use the AI SDK's `response.timestamp` and `response.modelId` from the `StepResult` to approximate timing. For more precise per-tool duration, record a `Date.now()` at the start of each step (in `onStepFinish` entry) and compute `Date.now() - stepStart` for the `tool_result` event. Since all tool calls in a step execute concurrently, each tool in the step gets the same duration (the step wall-clock time).

**Rationale:** The AI SDK doesn't expose per-tool-call start/end times. All tools in a step are invoked simultaneously by the model and execute concurrently. The step duration is the best available approximation.

**Alternatives considered:**
- Wrapping each tool's `execute()` with timing → Would require modifying tool definitions or adding a Mastra middleware layer (not currently available)
- Tracking timestamps across multiple `onStepFinish` callbacks → Tool calls and results may appear in different steps

### D3: Extend ProgressEvent with `success`, `durationMs`, `resultSummary`

**Decision:** Add three optional fields to `ProgressEvent`:
- `success?: boolean` — Whether the tool call succeeded (`true` for success, `false` for error). Omitted for non-tool events.
- `durationMs?: number` — Wall-clock duration of the tool call in milliseconds. Omitted for events without timing data.
- `resultSummary?: string | null` — Truncated (max 200 chars) human-readable summary of the tool result. `null` if the result is empty or too large to summarize. Omitted for non-tool events.

**Rationale:** These fields give the frontend enough data to render completion status badges and let the logger produce rich audit entries without exposing raw tool responses.

**Alternatives considered:**
- Full `result` field → Too large, could contain hundreds of KB of PubMed XML
- `toolCallId` field → Useful for correlation but not needed with D1's approach

### D4: Logger `toolCall()` and `toolResult()` methods

**Decision:** Add two new logger methods:
```ts
toolCall(agentId: string, jobId: string, toolName: string, toolArgs: string | null): void
toolResult(agentId: string, jobId: string, toolName: string, success: boolean, durationMs: number, resultSummary: string | null): void
```

These emit `tool_call` and `tool_result` events respectively to both the console (or JSON) logger and the audit log.

**Rationale:** Consistent with the existing `specialistCall()` pattern. Having separate methods allows filtering log queries by `event: "tool_call"` or `event: "tool_result"`.

**Alternatives considered:**
- Single `toolInvocation()` method with a `phase` field → Less consistent with existing logger patterns
- Reusing `specialistCall()` → Already has a different signature focused on the overall specialist call

### D5: Full tool history per specialist in frontend

**Decision:** Replace `deriveActiveTools()` (which only tracks the latest tool per specialist) with `deriveToolHistory()` that returns `Map<string, ToolHistoryEntry[]>` — an array of all tool calls per specialist, each with `toolName`, `toolArgs`, `status: "running" | "success" | "error"`, and optional `durationMs`.

When a `tool_call` event arrives for a specialist, a new entry with `status: "running"` is appended. When the corresponding `tool_result` arrives (matched by sequential position within the specialist's tool events), the entry is updated to `status: "success"` or `status: "error"` with the duration.

**Rationale:** Users benefit from seeing the full sequence of tools each specialist used, not just the latest. This matches how people think about the diagnostic process.

**Alternatives considered:**
- Keep single-tool display, add success/failure indicator → Loses the history context; users can't see what a specialist already checked
- Show full history only in the progress log → The agent card is the primary visual focus during diagnosis

### D6: CMO tool call tracking

**Decision:** Add the same `onStepFinish` callback to the CMO agent's `generate()` calls in the workflow. CMO tool calls use `agentId: "chiefMedicalOfficer"`. The `AgentGrid` and `AgentStatusCard` will not render CMO tool calls (the CMO is not in the specialist grid), but the progress log will show them, and the logger will record them.

**Rationale:** The CMO may call tools (especially in later rounds). Those invocations should be visible in the audit trail and progress stream even if they don't appear in the specialist grid.

**Alternatives considered:**
- Show CMO as a card in the grid → Would change the visual design; CMO is the orchestrator, not a consultant
- Ignore CMO tool calls → Leaves a gap in the audit trail

## Risks / Trade-offs

- **[Tool duration approximation]** → Step wall-clock time is shared across concurrent tools in the same step, so individual tool durations are imprecise. **Mitigation:** This is acceptable for observability purposes; exact per-tool timing would require tool wrapper middleware.
- **[ProgressEvent schema expansion]** → Adding 3 optional fields increases the JSON payload size of progress events. **Mitigation:** Fields are optional and typically small (`success` is a boolean, `durationMs` is a number, `resultSummary` is truncated to 200 chars).
- **[Frontend memory]** → Storing full tool history per specialist could grow large if a specialist makes many tool calls. **Mitigation:** Typical specialist consultations make 2-5 tool calls. Cap display at the most recent 10 per specialist.
- **[Sequential correlation fragility]** → Matching `tool_call` to `tool_result` by order within a specialist assumes they always appear in pairs. **Mitigation:** The AI SDK guarantees tool calls and results are paired within a step; `onStepFinish` receives both together.

## Migration Plan

1. Extend `ProgressEvent` interface — new fields are optional, no breaking changes
2. Add logger methods — purely additive
3. Enhance `onStepFinish` callbacks — emits new events alongside existing ones
4. Update frontend types — new fields are optional, backward-compatible
5. Replace `deriveActiveTools` with `deriveToolHistory` — the `AgentStatusCard` gains tool history display
6. No database migration needed — `ProgressEvent` is stored as flexible JSON

## Open Questions

- Should `resultSummary` be generated by the tool's `execute()` function (returning a summary alongside the full result) or extracted from the tool result object in the workflow? Leaning toward extracting from the result in `onStepFinish` to avoid modifying all 22 tools.
- Should the frontend cap tool history at a fixed number (e.g., 10 most recent) or show everything? Leaning toward showing all with scroll for very long histories.