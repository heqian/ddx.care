import { useEffect, useRef, useState } from "react";
import { getJobStatus } from "../api/client";
import type { StatusResponse, WsMessage } from "../api/types";
import { reportOutcomeSchema } from "../../shared/report-outcome";

type StatusHandler = (status: StatusResponse, generation: number) => void;
type ErrorHandler = (error: Error | null, generation: number) => void;

function isTerminal(status: StatusResponse | null): boolean {
  return status?.status === "completed" || status?.status === "failed";
}

export function useJobStream(
  jobId: string | null,
  token?: string,
  generation = 0,
  onStatus?: StatusHandler,
  onError?: ErrorHandler,
) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const statusRef = useRef<StatusResponse | null>(null);
  const onStatusRef = useRef(onStatus);
  const onErrorRef = useRef(onError);
  onStatusRef.current = onStatus;
  onErrorRef.current = onError;

  useEffect(() => {
    statusRef.current = null;
    setStatus(null);
    setError(null);
    if (!jobId) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let pollTimer: number | null = null;
    let retryCount = 0;
    let polling = false;
    const controllers = new Set<AbortController>();

    const publishStatus = (next: StatusResponse) => {
      if (cancelled || next.jobId !== jobId) return;
      if (isTerminal(statusRef.current) && !isTerminal(next)) return;
      statusRef.current = next;
      setStatus(next);
      onStatusRef.current?.(next, generation);
      setError(null);
      onErrorRef.current?.(null, generation);
    };

    const publishError = (value: unknown) => {
      if (cancelled) return;
      const next = value instanceof Error ? value : new Error("Polling failed");
      setError(next);
      onErrorRef.current?.(next, generation);
    };

    const fetchStatus = async () => {
      const controller = new AbortController();
      controllers.add(controller);
      try {
        return await getJobStatus(jobId, token, controller.signal);
      } finally {
        controllers.delete(controller);
      }
    };

    const poll = async () => {
      if (cancelled || !polling) return;
      try {
        const next = await fetchStatus();
        if (cancelled) return;
        publishStatus(next);
        if (next.status === "pending") {
          pollTimer = window.setTimeout(poll, 3000);
        } else {
          polling = false;
        }
      } catch (value) {
        if (
          cancelled ||
          (value instanceof DOMException && value.name === "AbortError")
        ) {
          return;
        }
        publishError(value);
        pollTimer = window.setTimeout(poll, 3000);
      }
    };

    const startPolling = () => {
      if (polling || cancelled) return;
      polling = true;
      void poll();
    };

    const connectWebSocket = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
      const wsUrl = `${protocol}//${window.location.host}/ws?jobId=${encodeURIComponent(jobId)}${tokenParam}`;

      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data) as WsMessage;
          if (data.jobId !== jobId) return;
          const current = statusRef.current ?? {
            jobId,
            status: "pending" as const,
            progress: [],
          };
          if (isTerminal(current) && data.type === "progress") return;

          let next = current;
          if (data.type === "progress") {
            const exists = current.progress?.some(
              (item) =>
                item.time === data.event.time &&
                item.message === data.event.message,
            );
            if (!exists) {
              next = {
                ...current,
                progress: [...(current.progress ?? []), data.event],
              };
            }
          } else if (data.type === "completed") {
            next = {
              ...current,
              status: "completed",
              result: reportOutcomeSchema.parse(data.result),
            };
          } else if (data.type === "failed") {
            next = { ...current, status: "failed", error: data.error };
          }
          if (next !== current) publishStatus(next);
        } catch (value) {
          console.error("Failed to parse WS message", value);
        }
      };
      ws.onerror = () => {
        if (!cancelled) console.warn("WebSocket error occurred.");
      };
      ws.onclose = (event) => {
        if (cancelled || event.code === 1000) return;
        if (retryCount < 5) {
          const delay = 2 ** retryCount * 1000;
          retryCount += 1;
          retryTimer = window.setTimeout(async () => {
            if (cancelled) return;
            try {
              const next = await fetchStatus();
              if (cancelled) return;
              publishStatus(next);
              if (isTerminal(next)) return;
            } catch (value) {
              if (
                cancelled ||
                (value instanceof DOMException && value.name === "AbortError")
              ) {
                return;
              }
            }
            connectWebSocket();
          }, delay);
        } else {
          startPolling();
        }
      };
    };

    connectWebSocket();

    return () => {
      cancelled = true;
      ws?.close();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      for (const controller of controllers) controller.abort();
      controllers.clear();
    };
  }, [jobId, token, generation]);

  return { status, error };
}
