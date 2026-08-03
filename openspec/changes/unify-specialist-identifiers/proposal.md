## Why

Specialist registry keys use camelCase while eight internal agent IDs use kebab-case. The factory uses the internal ID for tool lookup, so emergency, maternal-fetal, surgical, allergy, and sports specialists silently receive the fallback tool set instead of their assigned capabilities.

## What Changes

- Define one canonical `SpecialistId` source of truth shared by the registry, agent configuration, CMO schema, tool assignments, progress events, and API metadata.
- Require every registered specialist to have an exact tool assignment.
- Remove the silent universal-tool fallback for registered specialists.
- Validate specialist identity and tool-assignment integrity during startup.
- Add exhaustive tests covering registry keys, agent IDs, CMO IDs, and assigned tool categories.

## Capabilities

### New Capabilities
- `specialist-identity-integrity`: Defines canonical specialist identifiers and startup invariants across agent registration, orchestration, and tool assignment.

### Modified Capabilities

None.

## Impact

- Agent configuration and registry under `src/backend/agents/`
- Specialist factory and tool assignment manifest
- CMO structured-output schema and progress metadata
- Agent listing API and related frontend types if identifiers change
- Tool assignment, startup invariant, and workflow tests
