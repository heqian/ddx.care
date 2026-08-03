## Context

The exported specialist record uses camelCase keys because those keys are consumed by the CMO and API. Eight agent configuration objects use kebab-case runtime IDs, while the tool assignment manifest uses camelCase. Importing `SpecialistId` directly from the registry into the factory would create a circular dependency.

## Goals / Non-Goals

**Goals:**
- Establish one compile-time and runtime source of specialist identity.
- Remove silent fallback behavior for registered specialists.
- Detect identity drift before serving requests.
- Preserve current public camelCase IDs.

**Non-Goals:**
- Renaming specialist display names or file names.
- Supporting aliases for undocumented internal kebab-case IDs.
- Changing which tool categories are intentionally assigned.
- Persisting a specialist registry in a database.

## Decisions

### 1. Use camelCase registry IDs as canonical IDs

The current API, CMO schema, and progress events already use the registry's camelCase keys. The eight internal runtime IDs change to those values. This minimizes externally observable change and repairs tool lookup directly.

### 2. Define identity in a dependency-neutral manifest

Create a specialist manifest module containing canonical IDs and metadata needed by both agent creation and registration. It exports the `SpecialistId` type without importing agent instances. Agent files, the factory, tool assignments, and registry build from this manifest, avoiding circular imports.

### 3. Make tool assignment exhaustive at compile time

The assignment object uses `satisfies Record<SpecialistId, ToolCategory[]>`. Unknown keys and missing specialists fail type checking. The registered-agent record uses the same ID set.

### 4. Validate runtime identity at startup

Startup verifies that each registry key equals the agent runtime ID and that the key sets for the manifest, registry, and assignments are identical. Validation throws before `Bun.serve` starts. Generic fallback remains available only for explicitly unregistered experimental callers if still needed; registered construction never uses it.

### 5. Test expected categories, not only non-empty tools

An exhaustive table asserts exact category coverage for every specialist and explicitly checks all eight previously mismatched IDs. This prevents the universal fallback from satisfying a weak non-empty assertion.

## Risks / Trade-offs

- [Mastra traces may show changed runtime IDs] -> Public IDs become consistent; document the one-time trace naming change.
- [Manifest adds one abstraction] -> It replaces multiple unsynchronized identity lists and remains data-only.
- [Strict startup failure blocks partial development] -> Fail fast with a precise identifier; provide no production bypass.

## Migration Plan

1. Add the manifest and exhaustive identity tests.
2. Type the tool assignments against the manifest.
3. Change the eight runtime IDs to canonical camelCase values.
4. Build the registry and API metadata from the manifest.
5. Add startup validation and remove weak fallback-based tests.
6. No persisted-data migration is required because progress events already use registry keys and expire within the job TTL.
