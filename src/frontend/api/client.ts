import type {
  DiagnoseRequest,
  DiagnoseResponse,
  StatusResponse,
  AgentsResponse,
} from "./types";

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

  if (parsedError) {
    throw new Error(parsedError);
  }

  throw new Error(errText || `Request failed with status ${res.status}`);
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

export async function getJobStatus(jobId: string): Promise<StatusResponse> {
  const res = await fetch(`/v1/status/${jobId}`);
  if (!res.ok) {
    await handleResponseText(res);
  }
  return res.json();
}

export async function getAgents(): Promise<AgentsResponse> {
  const res = await fetch("/v1/agents");
  if (!res.ok) {
    await handleResponseText(res);
  }
  return res.json();
}
