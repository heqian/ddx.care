import { Agent } from "@mastra/core/agent";
import { SPECIALIST_MODEL } from "../config";
import { getAllTools } from "../tools";

export interface SpecialistConfig {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

const TOOL_INSTRUCTIONS = `

## Available Medical Tools

You have access to medical reference tools. Use them to ground your analysis in current evidence rather than relying solely on training data.

### When to Use Tools
- **Drug interactions** (drug-lookup then drug-interaction): Use when the patient takes multiple medications. Always check interactions before recommending drug combinations.
- **FDA adverse events** (adverse-events): Use when evaluating drug safety or when a patient reports a possible adverse reaction to a medication.
- **FDA drug labeling** (drug-labeling): Use to confirm official indications, contraindications, warnings, and dosing for medications the patient is taking.
- **MedlinePlus** (medlineplus-search): Use for patient-friendly clinical summaries and general medical reference.
- **Rare diseases** (rare-disease-search, rare-disease-genes, rare-disease-phenotypes): Use when a rare genetic or inherited condition is suspected.
- **Clinical trials** (clinical-trials-search): Use when considering experimental treatments or when standard treatment options are limited.
- **Phenotype terms** (hpo-term-search): Use to find standardized phenotype terminology for clinical features.
- **Lab test lookup** (loinc-test-lookup): Use to find standardized codes and reference information for laboratory tests.

### Tool Usage Rules
- Always use drug-interaction before recommending medication combinations or when the patient is on polypharmacy (3+ drugs).
- Do not call tools you do not need — use clinical judgment to decide which tools are relevant for this case.
- Tool results supplement your expertise; always interpret them in clinical context.`;

export function createSpecialistAgent(config: SpecialistConfig): Agent {
  return new Agent({
    id: config.id,
    name: config.name,
    model: SPECIALIST_MODEL,
    tools: getAllTools(),
    description: config.description,
    instructions: config.instructions + TOOL_INSTRUCTIONS,
  });
}
