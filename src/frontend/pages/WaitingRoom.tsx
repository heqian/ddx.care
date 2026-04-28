import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Spinner } from "../components/ui/Spinner";
import { AgentGrid } from "../components/agents/AgentGrid";
import type { SpecialistStatus } from "../components/agents/AgentStatusCard";
import { useJobStream } from "../hooks/useJobStream";
import { getAgents } from "../api/client";
import type { AgentInfo, StatusResponse, ProgressEvent } from "../api/types";

interface WaitingRoomProps {
  jobId: string;
  onComplete: (result: StatusResponse) => void;
  onCancel: () => void;
  onRetry: () => void;
}

const CALLING_RE = /^Calling specialist (\w+)\.\.\.$/;
const RECEIVED_RE =
  /^(?:Received analysis from|Failed to receive analysis from) (\w+)$/;

export function deriveSpecialistStatuses(
  progress: ProgressEvent[] | undefined,
): Map<string, SpecialistStatus> {
  const map = new Map<string, SpecialistStatus>();
  if (!progress) return map;

  for (const p of progress) {
    if (p.eventType === "specialist_start" && p.agentId) {
      map.set(p.agentId, "active");
      continue;
    }
    if (p.eventType === "specialist_complete" && p.agentId) {
      map.set(p.agentId, "completed");
      continue;
    }
    if (p.eventType === "tool_call" || p.eventType === "tool_result") {
      continue;
    }
    // Fallback regex parsing for backward compatibility with old events
    let m = p.message.match(CALLING_RE);
    if (m) {
      map.set(m[1], "active");
      continue;
    }
    m = p.message.match(RECEIVED_RE);
    if (m) {
      map.set(m[1], "completed");
    }
  }
  return map;
}

export function deriveActiveTools(
  progress: ProgressEvent[] | undefined,
): Map<string, { toolName: string; args: string }> {
  const map = new Map<string, { toolName: string; args: string }>();
  if (!progress) return map;

  for (const p of progress) {
    if (p.eventType === "specialist_complete" && p.agentId) {
      map.delete(p.agentId);
      continue;
    }
    if (p.eventType === "tool_call" && p.agentId && p.toolName) {
      map.set(p.agentId, {
        toolName: p.toolName,
        args: p.toolArgs || "",
      });
    }
  }
  return map;
}

export function WaitingRoom({
  jobId,
  onComplete,
  onCancel,
  onRetry,
}: WaitingRoomProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentsError, setAgentsError] = useState(false);
  const { status, error } = useJobStream(jobId);
  const isTerminal =
    status?.status === "failed" || status?.status === "completed";
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAgents()
      .then((res) => setAgents(res.agents))
      .catch(() => setAgentsError(true));
  }, []);

  useEffect(() => {
    if (status?.status === "completed") {
      onComplete(status);
    }
  }, [status, onComplete]);

  // Auto-scroll progress log to bottom when new events arrive
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [status?.progress]);

  const specialistStatuses = useMemo(
    () => deriveSpecialistStatuses(status?.progress),
    [status?.progress],
  );

  const activeTools = useMemo(
    () => deriveActiveTools(status?.progress),
    [status?.progress],
  );

  const showRetry = status?.status === "failed";

  const hasProgress = status?.progress && status.progress.length > 0;

  return (
    <div className="space-y-8">
      <div className="text-center">
        {!isTerminal && <Spinner size="lg" className="mx-auto mb-4" />}
        <h1 className="text-2xl font-display">
          {showRetry ? "Diagnosis Failed" : "Analyzing Case..."}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          {showRetry
            ? "An error occurred during analysis. You can retry or go back."
            : "Our specialist panel is reviewing the patient data. This typically takes a few minutes, but complicated cases may take longer."}
        </p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 text-center">
        ⚠️ RESEARCH DEMO ONLY — NOT FOR CLINICAL USE — NOT HIPAA COMPLIANT.
        AI-generated results may be wrong or fabricated. Do not use for any
        medical decision. You bear all risk — the operators are not liable for
        any damages, losses, or consequences arising from use of this tool.
      </div>

      <div
        ref={progressRef}
        role="log"
        aria-live="polite"
        aria-label="Progress log"
        className="mb-8 bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-y-auto h-48 sm:h-64 flex flex-col shadow-inner"
      >
        <div className="space-y-2 mt-auto">
          {!hasProgress && !isTerminal && (
            <div className="text-slate-500 italic">
              Starting analysis... consultations will appear here as they begin.
            </div>
          )}
          {status?.progress?.map((p, i) => {
            const isTool =
              p.eventType === "tool_call" || p.eventType === "tool_result";
            const indent = isTool ? "ml-4" : "";
            const color = isTool ? "text-cyan-400/70" : "text-cyan-300";
            return (
              <div
                key={i}
                className={`${color} opacity-90 break-words ${indent}`}
              >
                <span className="text-slate-500 text-xs mr-2">
                  [{new Date(p.time).toLocaleTimeString()}]
                </span>
                {p.message}
              </div>
            );
          })}
        </div>
      </div>

      {agentsError && (
        <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Could not load specialist panel. The diagnosis is still running.
          </p>
          <button
            onClick={() => setAgentsError(false)}
            className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 ml-4 shrink-0"
            aria-label="Dismiss"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {agents.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Specialist Panel
          </h2>
          <AgentGrid
            agents={agents}
            specialistStatuses={specialistStatuses}
            activeTools={activeTools}
          />
        </div>
      )}

      {error && !showRetry && (
        <div className="text-center">
          <p className="text-sm text-danger">
            Something went wrong: {error.message}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            The diagnosis may still be processing. Try refreshing.
          </p>
        </div>
      )}

      {showRetry && (
        <div className="text-center">
          <p className="text-sm text-danger mb-4">
            {status.error || "An unexpected error occurred during diagnosis."}
          </p>
        </div>
      )}

      <div className="flex justify-center gap-3">
        {!isTerminal && (
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <XMarkIcon className="h-4 w-4" />
            Cancel
          </button>
        )}
        {showRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Retry Diagnosis
          </button>
        )}
        {isTerminal && (
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <XMarkIcon className="h-4 w-4" />
            Back to Input
          </button>
        )}
      </div>
    </div>
  );
}
