export interface DiagnoseRequest {
  medicalHistory: string;
  conversationTranscript: string;
  labResults: string;
}

export interface DiagnoseResponse {
  jobId: string;
  status: "pending";
}

export interface SpecialistConsulted {
  specialist: string;
  keyFindings: string;
}

export interface Diagnosis {
  rank: number;
  name: string;
  confidence: number;
  urgency: "emergent" | "urgent" | "routine";
  rationale: string;
  supportingEvidence: string[];
  contradictoryEvidence: string[];
  nextSteps: string[];
}

export interface DiagnosisReport {
  chiefComplaint: string;
  patientSummary: string;
  specialistsConsulted: SpecialistConsulted[];
  diagnoses: Diagnosis[];
  crossSpecialtyObservations: string;
  recommendedImmediateActions: string;
}

export interface DiagnosisResult {
  report: DiagnosisReport;
  generatedAt: string;
  disclaimer: string;
}

export interface StatusResponse {
  jobId: string;
  status: "pending" | "completed" | "failed";
  progress?: { time: string; message: string }[];
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
