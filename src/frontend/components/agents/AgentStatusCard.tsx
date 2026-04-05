import { AgentIcon } from "./AgentIcon";

interface AgentStatusCardProps {
  name: string;
  agentId: string;
  description: string;
  active?: boolean;
}

export function AgentStatusCard({
  name,
  agentId,
  description,
  active = true,
}: AgentStatusCardProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="relative">
        <div
          className={`p-2 rounded-lg ${active ? "bg-blue-50 dark:bg-blue-900/30" : "bg-slate-100 dark:bg-slate-800"}`}
        >
          <AgentIcon
            agentId={agentId}
            className={`h-5 w-5 ${active ? "text-primary dark:text-blue-400" : "text-slate-400"}`}
          />
        </div>
        {active && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary dark:bg-blue-400 animate-pulse" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {active ? description : "Waiting..."}
        </p>
      </div>
    </div>
  );
}
