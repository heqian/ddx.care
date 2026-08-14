import type {
  DiagnoseRequest,
  DiagnoseResponse,
  StatusResponse,
  AgentsResponse,
} from "./types";
import { reportOutcomeSchema } from "../../shared/report-outcome";

export interface ApiError extends Error {
  status: number;
}

async function handleResponseText(res: Response): Promise<never> {
  const errText = await res.text();
  let parsedError: string | null = null;
  try {
    const errJson = JSON.parse(errText);
    if (errJson.error) {
      parsedError = errJson.error;
    }
  } catch (_e) {
    // Ignore JSON parse error
  }

  const message =
    parsedError ?? (errText || `Request failed with status ${res.status}`);
  const error = new Error(message) as ApiError;
  error.status = res.status;
  throw error;
}

export async function submitDiagnosis(
  data: DiagnoseRequest,
): Promise<DiagnoseResponse> {
  const res = await fetch("/v1/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    await handleResponseText(res);
  }
  return res.json();
}

export async function getJobStatus(
  jobId: string,
  token?: string,
  signal?: AbortSignal,
): Promise<StatusResponse> {
  // Keep the job capability separate from Caddy's HTTP Basic Authorization
  // header. Caddy redacts this custom header from access logs.
  const headers: Record<string, string> = {};
  if (token) headers["X-Job-Token"] = token;
  const res = await fetch(`/v1/status/${jobId}`, { headers, signal });
  if (!res.ok) {
    await handleResponseText(res);
  }
  const status = (await res.json()) as StatusResponse;
  if (status.status === "completed") {
    return {
      ...status,
      result: reportOutcomeSchema.parse(status.result),
    };
  }
  return status;
}

export async function getAgents(): Promise<AgentsResponse> {
  const res = await fetch("/v1/agents");
  if (!res.ok) {
    await handleResponseText(res);
  }
  return res.json();
}

export async function cancelDiagnosis(
  jobId: string,
  token?: string,
): Promise<{ status: string }> {
  // Keep the job capability separate from Caddy's HTTP Basic Authorization
  // header. Caddy redacts this custom header from access logs.
  const headers: Record<string, string> = {};
  if (token) headers["X-Job-Token"] = token;
  const res = await fetch(`/v1/diagnose/${jobId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    await handleResponseText(res);
  }
  return res.json();
}
