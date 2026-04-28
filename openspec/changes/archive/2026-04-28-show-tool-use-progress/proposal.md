## Why

When a specialist agent is consulted during diagnosis, the waiting room shows "Calling specialist cardiologist..." followed by a 30+ second silence until "Received analysis from cardiologist." During this blind spot, the agent is actively calling tools (PubMed searches, drug interaction checks, FDA label lookups) but none of this activity is visible to users. This makes the waiting room feel dead and gives no insight into what the AI is actually doing.

## What Changes

- Progress events gain optional fields (`eventType`, `agentId`, `toolName`, `toolArgs`) to carry structured metadata alongside the message string
- The diagnostic workflow passes an `onStepFinish` callback to `agent.generate()` that emits a progress event for each tool call, tagged with the specialist's ID and a human-readable label + query
- `AgentStatusCard` displays the currently active tool under the agent's name (e.g., "Searching PubMed: chest pain guidelines")
- The progress log differentiates tool-call entries from general messages with indentation and a toned-down color, showing agent attribution and the tool's search query
- A new `tool-labels.ts` utility maps internal tool IDs to human-readable labels
- Backward compatible: existing progress events without new fields render identically to before

## Capabilities

### New Capabilities
- `tool-use-progress`: Real-time visibility into specialist agent tool calls during diagnosis — structured progress events carry tool name, search query, and agent attribution, and both the agent status cards and progress log display this information to the user.

### Modified Capabilities
<!-- None — this is a new capability, not modifying existing spec-level behavior -->

## Impact

- **Backend**: `src/backend/progress-store.ts` (ProgressEvent interface + emitEvent method), `src/backend/workflows/diagnostic-workflow.ts` (onStepFinish callback), new `src/backend/tools/tool-labels.ts` (tool name → label mapping)
- **Frontend**: `src/frontend/api/types.ts` (ProgressEvent type enrichment), `src/frontend/components/agents/AgentStatusCard.tsx` (activeTool prop), `src/frontend/components/agents/AgentGrid.tsx` (plumb tool state), `src/frontend/pages/WaitingRoom.tsx` (deriveAgentToolStates + progress log differentiation)
- **Tests**: `tests/workflow.test.ts` (tool-call progress events), `tests/frontend.test.tsx` (tool display on cards + log)
- No breaking API changes — new fields are optional and additive
