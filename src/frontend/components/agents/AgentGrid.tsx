import { AgentStatusCard, type SpecialistStatus } from "./AgentStatusCard";
import type { AgentInfo } from "../../api/types";

interface AgentGridProps {
  agents: AgentInfo[];
  specialistStatuses?: Map<string, SpecialistStatus>;
}

export function AgentGrid({ agents, specialistStatuses }: AgentGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {agents.map((agent) => (
        <AgentStatusCard
          key={agent.id}
          agentId={agent.id}
          name={agent.name}
          description={agent.description}
          status={specialistStatuses?.get(agent.id) ?? "idle"}
        />
      ))}
    </div>
  );
}
