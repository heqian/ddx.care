import { AgentIcon } from "./AgentIcon";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { formatToolLabel } from "../../../backend/tools/tool-labels";
import type { ToolHistoryEntry } from "../../api/types";

export type SpecialistStatus = "idle" | "active" | "completed";

function ToolHistoryItem({ entry }: { entry: ToolHistoryEntry }) {
  const label = formatToolLabel(entry.toolName);

  let icon: React.ReactNode;
  if (entry.status === "running") {
    icon = (
      <span className="inline-block w-3.5 h-3.5 animate-spin rounded-full border-2 border-current border-t-transparent text-blue-400 align-middle" />
    );
  } else if (entry.status === "success") {
    icon = (
      <CheckCircleIcon className="inline w-3.5 h-3.5 text-emerald-500 align-middle" />
    );
  } else if (entry.status === "partial") {
    icon = (
      <ExclamationTriangleIcon className="inline w-3.5 h-3.5 text-amber-500 align-middle" />
    );
  } else {
    icon = (
      <XCircleIcon className="inline w-3.5 h-3.5 text-red-500 align-middle" />
    );
  }

  const statusText =
    entry.status === "running"
      ? "Running"
      : entry.status === "success"
        ? "Complete"
        : entry.status === "partial"
          ? "Partial"
          : "Failed";

  return (
    <div className="rounded-md border border-slate-200/80 bg-slate-50/70 px-2 py-1.5 text-xs dark:border-slate-700/70 dark:bg-slate-800/50">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">
          {label}
        </span>
        <span
          className={
            entry.status === "running"
              ? "shrink-0 text-blue-500"
              : entry.status === "success"
                ? "shrink-0 text-emerald-600 dark:text-emerald-400"
                : entry.status === "partial"
                  ? "shrink-0 text-amber-600 dark:text-amber-400"
                  : "shrink-0 text-red-600 dark:text-red-400"
          }
        >
          {statusText}
          {entry.status !== "running" && entry.durationMs !== undefined
            ? ` | ${entry.durationMs < 100 ? "<0.1" : (entry.durationMs / 1000).toFixed(1)}s`
            : ""}
        </span>
      </div>
      {entry.toolArgs && (
        <p
          className="mt-1 truncate text-slate-500 dark:text-slate-400"
          title={entry.toolArgs}
        >
          Query: {entry.toolArgs}
        </p>
      )}
      {entry.status !== "running" && entry.resultSummary && (
        <p
          className="mt-0.5 line-clamp-2 leading-relaxed text-slate-500 dark:text-slate-400"
          title={entry.resultSummary}
        >
          {entry.resultSummary}
        </p>
      )}
    </div>
  );
}

interface AgentStatusCardProps {
  name: string;
  agentId: string;
  description: string;
  status?: SpecialistStatus;
  toolHistory?: ToolHistoryEntry[];
}

const statusStyles: Record<
  SpecialistStatus,
  { bg: string; icon: string; dot: string; text: string }
> = {
  idle: {
    bg: "bg-slate-100 dark:bg-slate-800",
    icon: "text-slate-400",
    dot: "",
    text: "text-slate-400 dark:text-slate-500",
  },
  active: {
    bg: "bg-blue-50 dark:bg-blue-900/30",
    icon: "text-primary",
    dot: "bg-primary animate-pulse",
    text: "text-slate-500 dark:text-slate-400",
  },
  completed: {
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    icon: "text-emerald-600 dark:text-emerald-400",
    dot: "",
    text: "text-emerald-600 dark:text-emerald-400",
  },
};

export function AgentStatusCard({
  name,
  agentId,
  description,
  status = "idle",
  toolHistory,
}: AgentStatusCardProps) {
  const styles = statusStyles[status];
  const fullHistory = toolHistory ?? [];
  const errorCount = fullHistory.filter((e) => e.status === "error").length;
  const partialCount = fullHistory.filter((e) => e.status === "partial").length;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors duration-300 ${
        status === "idle"
          ? "border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50"
          : status === "active"
            ? "border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900"
            : "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-slate-900"
      }`}
    >
      <div className="relative">
        <div className={`p-2 rounded-lg ${styles.bg}`}>
          {status === "completed" ? (
            <CheckCircleIcon className={`h-5 w-5 ${styles.icon}`} />
          ) : (
            <AgentIcon agentId={agentId} className={`h-5 w-5 ${styles.icon}`} />
          )}
        </div>
        {styles.dot && (
          <span
            className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${styles.dot}`}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{name}</p>
        {status === "active" && fullHistory.length > 0 ? (
          <div className="mt-1.5 space-y-1.5">
            {fullHistory.map((entry, i) => (
              <ToolHistoryItem key={entry.toolCallId ?? i} entry={entry} />
            ))}
          </div>
        ) : status === "completed" && fullHistory.length > 0 ? (
          <p className="text-xs truncate text-emerald-600 dark:text-emerald-400">
            {fullHistory.length} tool{fullHistory.length === 1 ? "" : "s"} used
            {errorCount > 0
              ? ` - ${errorCount} failed`
              : partialCount > 0
                ? ` - ${partialCount} partial`
                : " - all successful"}
          </p>
        ) : (
          <p className={`text-xs truncate ${styles.text}`}>
            {status === "idle"
              ? "Waiting..."
              : status === "active"
                ? "Consulting..."
                : "Analysis complete"}
          </p>
        )}
      </div>
    </div>
  );
}
