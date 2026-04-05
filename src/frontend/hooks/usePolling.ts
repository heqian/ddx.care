import { useEffect, useState } from "react";
import { getJobStatus } from "../api/client";
import type { StatusResponse } from "../api/types";

export function usePolling(jobId: string | null, intervalMs = 3000) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const result = await getJobStatus(jobId);
        if (cancelled) return;
        setStatus(result);
        if (result.status !== "pending") return;
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error("Polling failed"));
      }
    };

    poll();
    const id = setInterval(poll, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [jobId, intervalMs]);

  return { status, error };
}
