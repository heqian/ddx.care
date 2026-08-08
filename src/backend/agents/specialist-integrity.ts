import { toolAssignments } from "../tools";
import { agentList, specialists } from ".";
import { specialistIds, specialistManifest } from "./manifest";

interface IdentityEntry {
  readonly id: string;
}

interface RuntimeAgent {
  readonly id: string;
}

export interface SpecialistIntegrityInput {
  manifest: readonly IdentityEntry[];
  registry: Readonly<Record<string, RuntimeAgent>>;
  assignmentIds: readonly string[];
  cmoIds: readonly string[];
  apiIds: readonly string[];
}

function assertNoDuplicates(source: string, ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(
        `Specialist identity configuration error: duplicate ${source} ID "${id}"`,
      );
    }
    seen.add(id);
  }
}

function assertSameIds(
  source: string,
  expectedIds: readonly string[],
  actualIds: readonly string[],
): void {
  assertNoDuplicates(source, actualIds);
  const expected = new Set(expectedIds);
  const actual = new Set(actualIds);

  for (const id of expectedIds) {
    if (!actual.has(id)) {
      throw new Error(
        `Specialist identity configuration error: missing ${source} ID "${id}"`,
      );
    }
  }

  for (const id of actualIds) {
    if (!expected.has(id)) {
      throw new Error(
        `Specialist identity configuration error: orphaned ${source} ID "${id}"`,
      );
    }
  }
}

export function validateSpecialistIntegrity(
  input: SpecialistIntegrityInput = {
    manifest: specialistManifest,
    registry: specialists,
    assignmentIds: Object.keys(toolAssignments),
    cmoIds: specialistIds,
    apiIds: agentList.map(({ id }) => id),
  },
): number {
  const manifestIds = input.manifest.map(({ id }) => id);
  assertNoDuplicates("manifest", manifestIds);

  const registryIds = Object.keys(input.registry);
  assertSameIds("registry", manifestIds, registryIds);
  assertSameIds("tool assignment", manifestIds, input.assignmentIds);
  assertSameIds("CMO", manifestIds, input.cmoIds);
  assertSameIds("agent API", manifestIds, input.apiIds);

  const runtimeIds = registryIds.map((id) => input.registry[id].id);
  assertNoDuplicates("runtime", runtimeIds);
  for (const id of registryIds) {
    const runtimeId = input.registry[id].id;
    if (runtimeId !== id) {
      throw new Error(
        `Specialist identity configuration error: registry ID "${id}" does not match runtime ID "${runtimeId}"`,
      );
    }
  }

  return manifestIds.length;
}
