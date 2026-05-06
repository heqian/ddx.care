import type { ProgressEvent, ProgressEventType } from "../progress-store";
import { logger } from "../utils/logger";
import { formatToolArgs } from "./diagnostic-workflow";
import { formatToolLabel } from "../tools/tool-labels";
import { summarizeToolResult } from "./tool-result-summary";

type EmitFn = (
  eventType: ProgressEventType,
  message: string,
  extra?: Partial<ProgressEvent>,
) => void;

interface StepToolCall {
  payload: {
    toolName: string;
    args?: Record<string, unknown>;
  };
}

interface StepToolResult {
  payload: {
    toolName: string;
    result: unknown;
    isError?: boolean;
  };
}

export function createStepEventHandler(
  agentId: string,
  jobId: string,
  emit: EmitFn,
) {
  let stepStart = Date.now();

  // biome-ignore lint/suspicious/noExplicitAny: Mastra onStepFinish callback type is complex
  return (step: any) => {
    const toolCalls: StepToolCall[] = step.toolCalls ?? [];
    const toolResults: StepToolResult[] = step.toolResults ?? [];
    const durationMs = Date.now() - stepStart;

    for (const tc of toolCalls) {
      const args = formatToolArgs(
        tc.payload.toolName,
        (tc.payload.args as Record<string, unknown>) ?? {},
      );
      emit(
        "tool_call",
        `${agentId}: ${formatToolLabel(tc.payload.toolName)}${args ? ` → ${args}` : ""}`,
        {
          agentId,
          toolName: tc.payload.toolName,
          toolArgs: args || null,
        },
      );
      logger.toolCall(agentId, jobId, tc.payload.toolName, args || null);
    }

    for (const tr of toolResults) {
      const isError = tr.payload.isError === true;
      const resultSummary = summarizeToolResult(
        tr.payload.toolName,
        tr.payload.result,
      );

      emit(
        "tool_result",
        `${agentId}: ${formatToolLabel(tr.payload.toolName)}${isError ? " failed" : " completed"}`,
        {
          agentId,
          toolName: tr.payload.toolName,
          success: !isError,
          durationMs,
          resultSummary,
        },
      );
      logger.toolResult(
        agentId,
        jobId,
        tr.payload.toolName,
        !isError,
        durationMs,
        resultSummary,
      );
    }

    stepStart = Date.now();
  };
}
