import { useEffect, useState } from "react";
import { getJobStatus } from "../api/client";
import type { StatusResponse, WsMessage } from "../api/types";

export function useJobStream(jobId: string | null) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let fallbackInterval: number | null = null;

    const connectWebSocket = () => {
      // Build absolute websocket URL handling http/https -> ws/wss
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws?jobId=${jobId}`;
      
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        if (cancelled) return;
        
        try {
          const data = JSON.parse(event.data) as WsMessage;
          
          setStatus((prev) => {
            const current = prev || { jobId, status: "pending", progress: [] };
            
            if (data.type === "progress") {
              // Ensure we don't duplicate events if replaying
              const exists = current.progress?.some((p) => p.time === data.event.time && p.message === data.event.message);
              if (exists) return current;
              
              return {
                ...current,
                progress: [...(current.progress || []), data.event],
              };
            }
            
            if (data.type === "completed") {
              const resultObj = "result" in data.result && "status" in data.result
                ? data.result
                : { status: "completed", result: data.result };
                
              return {
                ...current,
                status: "completed",
                result: resultObj,
              } as StatusResponse;
            }
            
            if (data.type === "failed") {
              return {
                ...current,
                status: "failed",
                error: data.error,
              };
            }
            
            return current;
          });
        } catch (e) {
          console.error("Failed to parse WS message", e);
        }
      };

      ws.onerror = () => {
        // Fallback to polling if WS fails
        if (cancelled) return;
        console.warn("WebSocket failed. Falling back to HTTP polling.");
        startPolling();
      };
      
      ws.onclose = (event) => {
        if (cancelled) return;
        // If closed abnormally, fallback
        if (event.code !== 1000 && event.code !== 1005) {
          startPolling();
        }
      };
    };

    const startPolling = () => {
      if (fallbackInterval) return; // already polling
      
      const poll = async () => {
        try {
          const result = await getJobStatus(jobId);
          if (cancelled) return;
          setStatus(result);
          if (result.status !== "pending" && fallbackInterval) {
            window.clearInterval(fallbackInterval);
          }
        } catch (e) {
          if (cancelled) return;
          setError(e instanceof Error ? e : new Error("Polling failed"));
        }
      };

      poll();
      fallbackInterval = window.setInterval(poll, 3000);
    };

    connectWebSocket();

    return () => {
      cancelled = true;
      if (ws) {
        ws.close();
      }
      if (fallbackInterval) {
        window.clearInterval(fallbackInterval);
      }
    };
  }, [jobId]);

  return { status, error };
}
