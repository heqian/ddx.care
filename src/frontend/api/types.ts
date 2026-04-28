import type { z } from "zod";
import type { reportSchema } from "../../backend/workflows/diagnostic-workflow";
import type { ProgressEventType } from "../../backend/progress-store";

export interface DiagnoseRequest {
  medicalHistory: string;
  conversationTranscript: string;
  labResults: string;
}

export interface DiagnoseResponse {
  jobId: string;
  status: "pending";
  token: string;
}

export interface SpecialistConsulted {
  specialist: string;
  keyFindings: string;
}

export type DiagnosisReport = z.infer<typeof reportSchema>;
export type Diagnosis = DiagnosisReport["diagnoses"][number];

export interface DiagnosisResult {
  report: DiagnosisReport;
  generatedAt: string;
  disclaimer: string;
}

export interface ProgressEvent {
  time: string;
  message: string;
  eventType?: ProgressEventType;
  agentId?: string;
  toolName?: string;
  toolArgs?: string | null;
}

export interface StatusResponse {
  jobId: string;
  status: "pending" | "completed" | "failed";
  progress?: ProgressEvent[];
  result?: {
    status: string;
    result?: DiagnosisResult;
    error?: string;
  };
  error?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
}

export interface AgentsResponse {
  agents: AgentInfo[];
}

export type WsMessage =
  | {
      type: "progress";
      jobId: string;
      event: ProgressEvent;
    }
  | {
      type: "completed";
      jobId: string;
      result:
        | { result?: DiagnosisResult; error?: string; status: string }
        | DiagnosisResult;
    }
  | { type: "failed"; jobId: string; error: string };
