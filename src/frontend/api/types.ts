export interface DiagnoseRequest {
  medicalHistory: string;
  conversationTranscript: string;
  labResults: string;
}

export interface DiagnoseResponse {
  jobId: string;
  status: "pending";
}

export interface DiagnosisResult {
  report: string;
  generatedAt: string;
  disclaimer: string;
}

export interface StatusResponse {
  jobId: string;
  status: "pending" | "completed" | "failed";
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

export interface ParsedDiagnosis {
  rank: number;
  name: string;
  confidence: number | null;
  urgency: "emergent" | "urgent" | "routine" | null;
  supportingEvidence: string[];
  contradictoryEvidence: string[];
  nextSteps: string[];
  rationale: string;
}

export interface ParsedReport {
  diagnoses: ParsedDiagnosis[];
  consultNotes: string;
  rawReport: string;
}
