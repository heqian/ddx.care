export const SPECIALIST_MODEL =
  process.env.SPECIALIST_MODEL ?? "google/gemini-3.1-pro-preview";
export const ORCHESTRATOR_MODEL =
  process.env.ORCHESTRATOR_MODEL ?? "google/gemini-3.1-pro-preview";
export const DIAGNOSIS_TIMEOUT_MS = 300_000;
export const MAX_DIAGNOSIS_ROUNDS = parseInt(process.env.MAX_DIAGNOSIS_ROUNDS ?? "3", 10);
