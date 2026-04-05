import type {
  DiagnoseRequest,
  DiagnoseResponse,
  StatusResponse,
  AgentsResponse,
} from "./types";

export async function submitDiagnosis(
  data: DiagnoseRequest,
): Promise<DiagnoseResponse> {
  const res = await fetch("/v1/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.json();
}

export async function getJobStatus(jobId: string): Promise<StatusResponse> {
  const res = await fetch(`/v1/status/${jobId}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.json();
}

export async function getAgents(): Promise<AgentsResponse> {
  const res = await fetch("/v1/agents");
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.json();
}
