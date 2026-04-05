import { useEffect, useState } from "react";
import { Spinner } from "../components/ui/Spinner";
import { AgentGrid } from "../components/agents/AgentGrid";
import { usePolling } from "../hooks/usePolling";
import { getAgents } from "../api/client";
import type { AgentInfo, StatusResponse } from "../api/types";

interface WaitingRoomProps {
  jobId: string;
  onComplete: (result: StatusResponse) => void;
}

export function WaitingRoom({ jobId, onComplete }: WaitingRoomProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const { status, error } = usePolling(jobId, 3000);

  useEffect(() => {
    getAgents()
      .then((res) => setAgents(res.agents))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status?.status === "completed") {
      onComplete(status);
    }
  }, [status, onComplete]);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <Spinner size="lg" className="mx-auto mb-4" />
        <h1 className="text-2xl font-bold">Analyzing Case...</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Our specialist panel is reviewing the patient data. This typically
          takes a few minutes.
        </p>
      </div>
      
      {status?.progress && status.progress.length > 0 && (
         <div className="max-w-2xl mx-auto mb-8 bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-y-auto h-64 flex flex-col shadow-inner">
           <div className="space-y-2 mt-auto">
             {status.progress.map((p, i) => (
                <div key={i} className="text-green-400 opacity-90 break-words">
                  <span className="text-slate-500 text-xs mr-2">[{new Date(p.time).toLocaleTimeString()}]</span>
                  {p.message}
                </div>
             ))}
           </div>
         </div>
      )}

      {agents.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Active Specialist Panel
          </h2>
          <AgentGrid agents={agents} />
        </div>
      )}

      {error && (
        <div className="text-center">
          <p className="text-sm text-danger">
            Something went wrong: {error.message}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            The diagnosis may still be processing. Try refreshing.
          </p>
        </div>
      )}

      {status?.status === "failed" && (
        <div className="text-center">
          <p className="text-sm text-danger">
            Diagnosis failed: {status.error || "Unknown error"}
          </p>
        </div>
      )}
    </div>
  );
}
