import { Agent } from "@mastra/core/agent";
import { SPECIALIST_MODEL } from "../config";
import { getToolsForSpecialist, toolAssignments } from "../tools";
import type { SpecialistId } from ".";

export interface SpecialistConfig {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

export function createSpecialistAgent(config: SpecialistConfig): Agent {
  const convertedId = kebabToCamel(config.id) as SpecialistId;
  if (!(convertedId in toolAssignments)) {
    throw new Error(
      `Specialist "${config.id}" converted to "${convertedId}" does not exist in toolAssignments.`,
    );
  }
  return new Agent({
    id: config.id,
    name: config.name,
    model: SPECIALIST_MODEL,
    tools: getToolsForSpecialist(convertedId),
    description: config.description,
    instructions: config.instructions,
  });
}
