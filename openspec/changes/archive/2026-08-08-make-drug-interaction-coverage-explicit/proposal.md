## Why

The drug-interaction tool currently swallows RxNav and OpenFDA failures and reports `noInteractionsFound: true`, making an outage indistinguishable from a complete negative check. This can falsely reassure agents when interaction evidence was never retrieved.

## What Changes

- Add explicit interaction-check coverage metadata for every requested drug.
- Reserve "no interactions found" for checks with complete successful coverage.
- Return an unknown or partial result when any drug cannot be resolved or checked.
- Prevent operational failures from being logged or streamed as successful tool results.
- Document that absence of a literal mention in an FDA label is not proof that no interaction exists.
- Replace tests that currently encode API failure as a successful negative result.

## Capabilities

### New Capabilities
- `drug-interaction-coverage`: Defines complete, partial, and unavailable coverage semantics and safe negative-result rules for interaction checks.

### Modified Capabilities
- `tool-error-transparency`: Extends failure transparency to partial coverage and requires workflow observability to honor the tool's `ok` and coverage fields.

## Impact

- `src/backend/tools/drug-interaction.ts` output schema and execution logic
- Tool-result progress and summary handling
- Specialist and CMO tool-use instructions
- Tool unit, integration, workflow, and prompt-behavior tests
- Consumers of the drug-interaction tool output
