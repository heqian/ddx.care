import { Mastra } from "@mastra/core";
import { specialists } from "./agents/index";
import { chiefMedicalOfficer } from "./agents/chief-medical-officer";
import { diagnosticWorkflow } from "./workflows/diagnostic-workflow";

export const mastra = new Mastra({
  agents: {
    chiefMedicalOfficer,
    ...specialists,
  },
  workflows: { diagnosticWorkflow },
});
