import type { ToolHooks } from "@mastra/core/tools";
import type {
  ProgressEvent,
  ProgressAgentId,
  ProgressEventType,
  ToolResultStatus,
} from "../progress-store";
import { formatToolLabel } from "../tools/tool-labels";
import { getErrorTypeName } from "../utils/errors";
import { logger } from "../utils/logger";
import { formatToolArgs } from "./diagnostic-workflow";
import {
  normalizeToolResult,
  summarizeToolResult,
} from "./tool-result-summary";

type EmitFn = (
  eventType: ProgressEventType,
  message: string,
  extra?: Partial<ProgressEvent>,
) => void;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getToolCallId(context: unknown, toolName: string): string {
  const toolCallId = asRecord(context)?.toolCallId;
  return typeof toolCallId === "string" ? toolCallId : `${toolName}-unknown`;
}

function classifyToolResult(
  rawResult: unknown,
  isTransportError: boolean,
): { status: ToolResultStatus; retriable?: boolean } {
  if (isTransportError) return { status: "failed" };

  const result = normalizeToolResult(rawResult);
  const envelope = asRecord(result);
  if (!envelope) return { status: "success" };

  if (envelope.isError === true || envelope.ok === false) {
    return {
      status: "failed",
      ...(typeof envelope.retriable === "boolean" && {
        retriable: envelope.retriable,
      }),
    };
  }
  if (envelope.ok === true) {
    const data = asRecord(envelope.data);
    if (data?.coverage === "partial") return { status: "partial" };
    if (data?.coverage === "unavailable") return { status: "failed" };
  }
  return { status: "success" };
}

/** Emit live, per-invocation tool progress using Mastra's execution hooks. */
export function createToolEventHooks(
  agentId: ProgressAgentId,
  jobId: string,
  emit: EmitFn,
): ToolHooks {
  const startedAt = new Map<string, number>();
  const argsByCallId = new Map<string, string | null>();

  return {
    beforeToolCall: ({ toolName, input, context }) => {
      const toolCallId = getToolCallId(context, toolName);
      const args = formatToolArgs(toolName, asRecord(input) ?? {});
      const toolArgs = args || null;

      startedAt.set(toolCallId, performance.now());
      argsByCallId.set(toolCallId, toolArgs);
      emit(
        "tool_call",
        `${agentId}: ${formatToolLabel(toolName)}${args ? ` → ${args}` : ""}`,
        { agentId, toolCallId, toolName, toolArgs },
      );
      logger.toolCall(agentId, jobId, toolName, toolArgs, toolCallId);
    },
    afterToolCall: ({ toolName, output, error, context }) => {
      const toolCallId = getToolCallId(context, toolName);
      const start = startedAt.get(toolCallId);
      const durationMs =
        start === undefined ? 0 : Math.round(performance.now() - start);
      const result = error ?? output;
      const classification = classifyToolResult(result, error !== undefined);
      const resultSummary = summarizeToolResult(toolName, result);
      const isError = classification.status === "failed";
      const toolArgs = argsByCallId.get(toolCallId) ?? null;

      const eventExtra: Partial<ProgressEvent> & { errorType?: string } = {
        agentId,
        toolCallId,
        toolName,
        toolArgs,
        success: classification.status === "success",
        toolResultStatus: classification.status,
        ...(classification.retriable !== undefined && {
          retriable: classification.retriable,
        }),
        durationMs,
        resultSummary,
      };

      if (isError) {
        eventExtra.errorType =
          error instanceof Error ? getErrorTypeName(error) : "UnknownError";
      }

      emit(
        "tool_result",
        `${agentId}: ${formatToolLabel(toolName)}${toolArgs ? ` → ${toolArgs}` : ""} ${classification.status === "partial" ? "completed with partial coverage" : classification.status === "failed" ? "failed" : "completed"}`,
        eventExtra,
      );
      logger.toolResult(
        agentId,
        jobId,
        toolName,
        classification.status,
        durationMs,
        resultSummary,
        classification.retriable,
        toolCallId,
      );

      startedAt.delete(toolCallId);
      argsByCallId.delete(toolCallId);
    },
  };
}
