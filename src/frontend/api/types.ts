import type {
  ProgressEventType,
  ToolResultStatus,
} from "../../backend/progress-store";
import type {
  DiagnosisReport,
  ReportOutcome,
} from "../../shared/report-outcome";

export type {
  AvailableReportOutcome,
  DiagnosisReport,
  ReportOutcome,
} from "../../shared/report-outcome";

export interface DiagnoseRequest {
  medicalHistory: string;
  conversationTranscript: string;
  labResults: string;
}

export interface DiagnoseResponse {
  jobId: string;
  status: "pending";
  token: string;
  wsTicket: string;
}

export interface SpecialistConsulted {
  specialist: string;
  keyFindings: string;
}

export type Diagnosis = DiagnosisReport["diagnoses"][number];

export type ToolStatus = "running" | "success" | "partial" | "error";

export interface ToolHistoryEntry {
  toolName: string;
  toolArgs: string | null;
  status: ToolStatus;
  durationMs?: number;
  resultSummary?: string | null;
  cached?: boolean;
}

export interface ProgressEvent {
  time: string;
  message: string;
  eventType?: ProgressEventType;
  agentId?: string;
  toolName?: string;
  toolArgs?: string | null;
  success?: boolean;
  toolResultStatus?: ToolResultStatus;
  retriable?: boolean;
  durationMs?: number;
  resultSummary?: string | null;
  errorType?: string;
  cached?: boolean;
  specialistIds?: string[];
}

export interface StatusResponse {
  jobId: string;
  status: "pending" | "completed" | "failed";
  progress?: ProgressEvent[];
  result?: ReportOutcome;
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
      result: ReportOutcome;
    }
  | { type: "failed"; jobId: string; error: string };
