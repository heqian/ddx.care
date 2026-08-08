import type {
  ProgressEvent,
  ProgressAgentId,
  ProgressEventType,
  ToolResultStatus,
} from "../progress-store";
import { logger } from "../utils/logger";
import { formatToolArgs } from "./diagnostic-workflow";
import { formatToolLabel } from "../tools/tool-labels";
import { summarizeToolResult } from "./tool-result-summary";
import { getErrorTypeName } from "../utils/errors";
import { consumeCacheHits } from "./cache-context";

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

function classifyToolResult(
  result: unknown,
  isTransportError: boolean,
): { status: ToolResultStatus; retriable?: boolean } {
  if (isTransportError) return { status: "failed" };
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return { status: "success" };
  }

  const envelope = result as Record<string, unknown>;
  if (envelope.ok === false) {
    return {
      status: "failed",
      ...(typeof envelope.retriable === "boolean" && {
        retriable: envelope.retriable,
      }),
    };
  }
  if (
    envelope.ok === true &&
    typeof envelope.data === "object" &&
    envelope.data !== null
  ) {
    const coverage = (envelope.data as Record<string, unknown>).coverage;
    if (coverage === "partial") return { status: "partial" };
    if (coverage === "unavailable") return { status: "failed" };
  }
  return { status: "success" };
}

export function createStepEventHandler(
  agentId: ProgressAgentId,
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
      const classification = classifyToolResult(
        tr.payload.result,
        tr.payload.isError === true,
      );
      const isError = classification.status === "failed";
      const resultSummary = summarizeToolResult(
        tr.payload.toolName,
        tr.payload.result,
      );

      const cached = consumeCacheHits();

      const eventExtra: Partial<ProgressEvent> & { errorType?: string } = {
        agentId,
        toolName: tr.payload.toolName,
        success: classification.status === "success",
        toolResultStatus: classification.status,
        ...(classification.retriable !== undefined && {
          retriable: classification.retriable,
        }),
        durationMs,
        resultSummary,
        ...(cached && { cached: true }),
      };

      if (isError) {
        const errorObj =
          tr.payload.result instanceof Error ? tr.payload.result : undefined;
        eventExtra.errorType = errorObj
          ? getErrorTypeName(errorObj)
          : "UnknownError";
      }

      emit(
        "tool_result",
        `${agentId}: ${formatToolLabel(tr.payload.toolName)} ${classification.status === "partial" ? "completed with partial coverage" : classification.status === "failed" ? "failed" : "completed"}`,
        eventExtra,
      );
      logger.toolResult(
        agentId,
        jobId,
        tr.payload.toolName,
        classification.status,
        durationMs,
        resultSummary,
        classification.retriable,
      );
    }

    stepStart = Date.now();
  };
}
