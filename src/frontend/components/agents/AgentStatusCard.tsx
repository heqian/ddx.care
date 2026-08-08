import { AgentIcon } from "./AgentIcon";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { formatToolLabel } from "../../../backend/tools/tool-labels";
import type { ToolHistoryEntry } from "../../api/types";

export type SpecialistStatus = "idle" | "active" | "completed";

const MAX_VISIBLE_TOOLS = 10;

function ToolHistoryItem({
  entry,
  isLatest,
}: {
  entry: ToolHistoryEntry;
  isLatest: boolean;
}) {
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

  return (
    <div className="flex items-center gap-1.5 text-xs leading-tight">
      {icon}
      <span
        className={
          entry.status === "running"
            ? "text-primary/80"
            : entry.status === "success"
              ? "text-emerald-600 dark:text-emerald-400"
              : entry.status === "partial"
                ? "text-amber-600 dark:text-amber-400"
                : "text-red-600 dark:text-red-400"
        }
      >
        {label}
        {isLatest && entry.toolArgs ? `: ${entry.toolArgs}` : ""}
      </span>
      {entry.status !== "running" && entry.durationMs !== undefined && (
        <span className="text-slate-400 dark:text-slate-500">
          ({(entry.durationMs / 1000).toFixed(1)}s)
        </span>
      )}
      {entry.cached && (
        <span className="text-amber-500 dark:text-amber-400 text-[10px]">
          cached
        </span>
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
  const visibleHistory = toolHistory?.slice(-MAX_VISIBLE_TOOLS) ?? [];
  const hasMore = (toolHistory?.length ?? 0) > MAX_VISIBLE_TOOLS;
  const errorCount = visibleHistory.filter((e) => e.status === "error").length;
  const partialCount = visibleHistory.filter(
    (e) => e.status === "partial",
  ).length;
  const cachedCount = visibleHistory.filter((e) => e.cached).length;

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
        {status === "active" && visibleHistory.length > 0 ? (
          <div className="mt-1 space-y-0.5">
            {visibleHistory.map((entry, i) => (
              <ToolHistoryItem
                key={i}
                entry={entry}
                isLatest={i === visibleHistory.length - 1}
              />
            ))}
            {hasMore && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                +{toolHistory!.length - MAX_VISIBLE_TOOLS} more
              </p>
            )}
          </div>
        ) : status === "completed" && visibleHistory.length > 0 ? (
          <p className="text-xs truncate text-emerald-600 dark:text-emerald-400">
            {visibleHistory.length} tool{visibleHistory.length === 1 ? "" : "s"}{" "}
            used
            {errorCount > 0
              ? ` — ${errorCount} failed`
              : partialCount > 0
                ? ` — ${partialCount} partial`
                : " — all successful"}
            {cachedCount > 0 && (
              <span className="text-amber-500 dark:text-amber-400 ml-1">
                ({cachedCount} cached)
              </span>
            )}
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
