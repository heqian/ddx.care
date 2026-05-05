import { Agent } from "@mastra/core/agent";
import { SPECIALIST_MODEL } from "../config";
import { getAllTools } from "../tools";

export interface SpecialistConfig {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

export function createSpecialistAgent(config: SpecialistConfig): Agent {
  return new Agent({
    id: config.id,
    name: config.name,
    model: SPECIALIST_MODEL,
    tools: getAllTools(),
    description: config.description,
    instructions: config.instructions,
  });
}
