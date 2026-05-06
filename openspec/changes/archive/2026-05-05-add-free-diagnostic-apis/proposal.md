## Why

The system's 36 specialist agents and CMO currently lack access to rare disease databases, structured phenotype matching, lab test interpretation, and expanded safety data. This creates diagnostic blind spots — especially for rare diseases (where LLMs are notoriously weak), lab result misinterpretation, and incomplete adverse event coverage. All new tools must be free (no API key required) and available to every specialist and the CMO to maximize diagnostic accuracy across all cases.

## What Changes

- Add Orphadata (Orphanet) rare disease tools: search rare diseases by name/clinical signs, look up associated genes, and retrieve phenotype annotations. Data cached in SQLite on startup to eliminate runtime latency.
- Add HPO term search via NLM Clinical Tables API: structured phenotype matching to help identify genetic syndromes from clinical features.
- Add LOINC lab test lookup via NLM Clinical Tables API: interpret what a lab test measures, its units, and context.
- Add OpenFDA drug shortages endpoint: check if a medication is currently in shortage so specialists can consider alternatives.
- Add OpenFDA food/dietary supplement/cosmetic adverse events endpoint: expand adverse event coverage beyond drugs.
- Add OpenFDA medical device adverse events endpoint: device safety data for surgical specialists.
- **BREAKING**: Flatten tool assignments — remove per-specialist category restrictions. All 24 tools (16 existing + 8 new) become available to all 36 specialists and the CMO.

## Capabilities

### New Capabilities
- `orphadata-cache`: Startup loading and SQLite caching of Orphanet rare disease data (diseases, genes, phenotypes)
- `orphadata-tools`: Three Mastra tools querying cached Orphadata data (rare disease search, gene lookup, phenotype retrieval)
- `nlm-clinical-tables`: HPO term search and LOINC lab test lookup tools via NLM Clinical Tables API
- `openfda-expansions`: Drug shortages, food adverse events, and device adverse events tools via OpenFDA API

### Modified Capabilities
- `tool-use-progress`: Tool assignment model changes from per-specialist categories to universal access for all specialists and CMO

## Impact

- **New files**: `src/backend/orphadata-cache.ts`, `src/backend/tools/orphadata.ts`, `src/backend/tools/nlm-clinical-tables.ts`
- **Modified files**: `src/backend/tools/open-fda.ts` (3 new tools), `src/backend/tools/index.ts` (simplify to universal access), `src/backend/config.ts` (Orphadata cache config)
- **Dependencies**: No new npm packages required — uses existing `bun:sqlite`, `fetchJSON`, and `createTool` patterns
- **Startup time**: Increases by a few seconds to fetch and cache Orphadata data (~6,000 rare diseases)
- **Runtime**: Orphadata tools query SQLite locally (~0ms). NLM and OpenFDA tools make HTTP calls (~100-200ms)
