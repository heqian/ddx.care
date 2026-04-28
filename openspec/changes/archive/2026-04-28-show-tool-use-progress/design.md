## Context

The ddx.care waiting room (`WaitingRoom.tsx`) shows a progress log and an agent status grid during diagnosis. The diagnostic workflow (`diagnostic-workflow.ts`) emits progress events via `emitProgress()` — a closure that calls `progressStore.emitMessage(runId, message)`. Currently, `ProgressEvent` is a flat `{ time: string; message: string }` object, and the workflow only emits events at agent lifecycle boundaries ("Calling specialist X...", "Received analysis from X...").

Mastra's `agent.generate()` supports an `onStepFinish` callback in its options. This callback fires after each LLM step and provides `toolCalls[]` and `toolResults[]` arrays — each entry containing `toolCallId`, `toolName`, `args`, and (for results) `result`/`isError`. This gives us visibility into tool execution without modifying Mastra core.

Tools are assigned per specialist via `getToolsForSpecialist()` in `src/backend/tools/index.ts`. There are 15 tools across 5 integration families (PubMed/NCBI, RxNav, OpenFDA, ClinicalTrials.gov, MedlinePlus). Tool IDs use kebab-case (`pubmed-search`, `drug-interaction`, etc.).

## Goals / Non-Goals

**Goals:**
- Show which tool a specialist agent is actively using, with the search query or drug name, on both the agent status card and progress log
- Use Mastra's `onStepFinish` callback — no Mastra core modifications
- Keep backward compatibility: existing progress events without new fields render identically
- Add structured optional fields to `ProgressEvent` rather than a parallel event stream

**Non-Goals:**
- Showing tool *results* (output data) — only tool *calls* and their queries are displayed
- Per-tool execution timing or latency metrics (already logged via `logger.specialistCall`)
- Streaming tool call input as it's typed (streaming-level granularity)
- Modifying how tools themselves work
- Percent-complete or ETA estimation

## Decisions

### 1. Enrich ProgressEvent rather than create a parallel event stream

**Alternatives considered:**
- **Parallel tool event stream** (separate `toolUses` array on status): Would require a second pub/sub channel, separate WebSocket messages, and dual deduplication logic. Unnecessary complexity for additive data.
- **Tool wrapping** (wrap each tool's `execute` function): Would work but tools don't have natural access to `runId`/`emitProgress`. Would require threading closures through tool creation, creating tight coupling.

**Decision**: Add optional fields to `ProgressEvent` (`eventType`, `agentId`, `toolName`, `toolArgs`). Events flow through the existing pipeline. The frontend differentiates by checking `eventType`.

### 2. Use `onStepFinish` rather than `onIterationComplete` or output processors

**Alternatives considered:**
- **`onIterationComplete`**: Fires after all steps in an iteration complete (higher level). Would delay tool-call visibility until the iteration ends.
- **Tool-level `onOutput` hooks**: Set per-tool at definition time. Tools wouldn't know which agent is calling them without parameter threading.
- **Output processors (`processOutputStep`)**: Similar to `onStepFinish` but requires processor registration at agent creation time, adding boilerplate to `factory.ts`.

**Decision**: `onStepFinish` in the `generate()` options. It fires immediately after each LLM step (before tool execution for the next step), giving near-real-time visibility. It's passed inline at the call site in `diagnostic-workflow.ts`, keeping changes localized.

### 3. Human-readable tool labels via a static map rather than per-tool description

**Alternatives considered:**
- **Use each tool's `description` field**:  Tools have descriptions for the LLM, not for UI display. They're too verbose ("Search PubMed/NCBI for biomedical literature...").
- **Generate labels dynamically from tool name**:  `pubmed-search` → `Searching PubMed` works for most but not all. `drug-spelling-suggestion` → `Checking drug spelling` needs custom mapping.

**Decision**: A static `TOOL_LABELS` map in a new `tool-labels.ts` file. Simple, predictable, testable. One source of truth for UI display names.

### 4. Tool args extraction: show the meaningful query, not full args

Each tool has different input schemas. `pubmed-search` has `query`, `drug-interaction` has `drugName` + `drugName2`, `drug-labeling` has `drugName`, etc. We extract the most relevant field(s) and truncate to 80 characters. This avoids showing raw JSON blobs in the UI.

### 5. Frontend: derive tool state from progress events (not a separate data structure)

The `deriveSpecialistStatuses()` function in `WaitingRoom.tsx` already parses progress events. We extend it to also build an `AgentToolState` record per specialist, extracting `activeTool` and `toolLog` from `tool_call` events. This keeps all derived state in one place with a single source of truth (the `progress[]` array).

### 6. No new WebSocket message types

Tool-call events use the existing `"progress"` message type on the wire. The enriched `ProgressEvent` fields are serialized as part of the `event` object. The frontend discriminates by checking `eventType` on the received object.

## Risks / Trade-offs

- **[Risk] `onStepFinish` fires per LLM step, not per tool call.** A single step may contain 0, 1, or multiple tool calls. Multiple consecutive tool calls map to multiple progress events — the frontend treats the last-emitted tool as "active" for display purposes. **Mitigation**: Acceptable UX — the card shows the most recent tool, and the log shows all of them chronologically.

- **[Risk] Tool args may contain sensitive patient data if the agent includes it in the query.** The search query is already visible to PubMed/FDA APIs. Displaying it in the UI doesn't change the security profile. **Mitigation**: Args are truncated to 80 chars, which limits exposure. If this becomes a concern, we can switch to tool-name-only display.

- **[Risk] `onStepFinish` adds overhead to agent execution.** The callback runs synchronously during generation. Including it may slightly increase per-step latency. **Mitigation**: The callback only does string formatting and an SQLite insert — negligible overhead compared to LLM inference and API calls.

- **[Risk] Multiple agents active concurrently interleave tool events in the progress log.** If cardiologist and neurologist run simultaneously, their tool calls will appear interleaved. **Mitigation**: The `agentId` field on each event lets the frontend attribute entries correctly. The progress log shows them chronologically; the agent cards each show only their own active tool.

## Open Questions

- **Tool icons**: What icons to use for each tool category in the UI? Options: Heroicons (`MagnifyingGlassIcon` for search, `BeakerIcon` for drug, `ClipboardDocumentIcon` for FDA, `BookOpenIcon` for MedlinePlus). Defer to implementation — use text labels initially, add icons as a follow-up if needed.
