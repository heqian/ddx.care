import { AgentIcon } from "./AgentIcon";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

export type SpecialistStatus = "idle" | "active" | "completed";

interface AgentStatusCardProps {
  name: string;
  agentId: string;
  description: string;
  status?: SpecialistStatus;
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
}: AgentStatusCardProps) {
  const styles = statusStyles[status];

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
        <p className={`text-xs truncate ${styles.text}`}>
          {status === "idle"
            ? "Waiting..."
            : status === "active"
              ? "Consulting..."
              : "Analysis complete"}
        </p>
      </div>
    </div>
  );
}
