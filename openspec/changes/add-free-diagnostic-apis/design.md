## Context

The ddx.care system has 36 specialist agents + 1 CMO, each currently assigned a subset of 16 tools via per-specialist category mappings in `src/backend/tools/index.ts`. The tools follow a consistent pattern: one file per API source, `createTool()` with Zod schemas, HTTP via `fetchJSON()` utility, and declarative category-to-specialist assignments.

Four new free (no API key) API sources need integration: Orphadata (rare diseases, cached in SQLite), NLM Clinical Tables (HPO + LOINC), and OpenFDA expansions (drug shortages, food adverse events, device adverse events). Additionally, all tools — existing and new — must become available to every specialist and the CMO, removing per-specialist restrictions.

## Goals / Non-Goals

**Goals:**
- Integrate 4 free API sources as 8 new tools following existing patterns
- Cache Orphadata data in SQLite at startup for zero-latency rare disease queries
- Make all 24 tools available to every specialist and the CMO
- Maintain backward compatibility with existing progress event system (tool labels)

**Non-Goals:**
- ICD/SNOMED/UMLS coding tools (administrative, not accuracy-improving)
- APIs requiring API keys or licenses (EndlessMedical, WHO ICD OAuth2, UMLS, LOINC direct)
- Caching NLM or OpenFDA responses (they are runtime HTTP calls with fresh data)
- Changing the frontend tool display or progress event format

## Decisions

### 1. Orphadata caching strategy: SQLite on startup

**Decision**: Fetch all Orphadata datasets at server startup, parse, normalize, and insert into SQLite tables. Tools query SQLite directly at diagnosis time.

**Why not HTTP at runtime**: Orphadata is updated only twice yearly (July/December). Runtime HTTP calls would add ~200ms latency per rare disease lookup with no freshness benefit. SQLite queries complete in ~0ms.

**Why SQLite over in-memory**: The project already uses `bun:sqlite` via `progressStore`. Consistent with existing patterns. Survives if we later want to inspect/debug cached data. Memory footprint is small (~6,000 rare disease records).

**Tables**:
- `orphadata_diseases` — Orphacode, disease name, definition, disorder group, disorder type
- `orphadata_genes` — Orphacode, gene symbol, gene name, source
- `orphadata_phenotypes` — Orphacode, HPO ID, phenotype name, frequency

**Alternatives considered**:
- In-memory Map — simpler but loses debuggability
- Download JSON files only, no SQLite — slower queries, no indexing

### 2. NLM Clinical Tables: single file with two tools

**Decision**: Create `nlm-clinical-tables.ts` containing both `hpoTermSearch` and `loincTestLookup`. Both use the same base URL (`clinicaltables.nlm.nih.gov/api`) and response format.

**Why one file**: They share the same API, response parser, and error handling. Splitting adds boilerplate with no benefit.

### 3. OpenFDA expansions: extend existing `open-fda.ts`

**Decision**: Add `drugShortagesTool`, `foodAdverseEventsTool`, and `deviceAdverseEventsTool` to the existing `open-fda.ts` file.

**Why not new file**: They use the same `FDA_BASE` URL, same `fetchJSON` wrapper, and same response patterns as existing FDA tools. Three endpoints don't justify a new file.

### 4. Flatten tool assignments: remove per-specialist categories

**Decision**: Replace the current `toolAssignments: Record<SpecialistId, ToolsInput[]>` and `getToolsForSpecialist()` with a single `getAllTools(): ToolsInput` function that returns all tools to all agents.

**Why**: Per-specialist restrictions were artificial — all specialists benefit from all data sources. A geneticist might need drug interactions; a cardiologist might need rare disease data for unusual presentations. The category system created unnecessary complexity and restricted diagnostic coverage.

**Migration**: The `toolAssignments` object, per-specialist category constants, and `getToolsForSpecialist()` function are removed. The `chiefMedicalOfficer` agent factory and specialist `factory.ts` call `getAllTools()` instead of `getToolsForSpecialist(id)`.

### 5. Tool label mappings

**Decision**: Add labels for all 8 new tools to `tool-labels.ts` following the existing pattern.

| Tool ID | Label |
|---|---|
| `rare-disease-search` | "Searching rare diseases" |
| `rare-disease-genes` | "Looking up disease genes" |
| `rare-disease-phenotypes` | "Retrieving disease phenotypes" |
| `hpo-term-search` | "Searching phenotype terms" |
| `loinc-test-lookup` | "Looking up lab test" |
| `drug-shortages` | "Checking drug shortages" |
| `food-adverse-events` | "Searching food adverse events" |
| `device-adverse-events` | "Searching device adverse events" |

## Risks / Trade-offs

**[Orphadata startup delay]** → Fetching + parsing + inserting ~6,000 records adds ~2-5 seconds to server startup. Mitigated by logging progress and running concurrently with other startup tasks.

**[Orphadata API unavailability at startup]** → If `api.orphadata.com` is down at startup, the cache will be empty and rare disease tools return empty results. Mitigated by logging a warning and allowing the server to start anyway. No crash.

**[More tools = more tokens in agent context]** → 24 tools in the agent's tool list increases context size per call. Mitigated by keeping tool descriptions concise. LLMs handle 24 tools well.

**[Tool choice confusion]** → More tools could cause agents to call irrelevant tools. Mitigated by clear tool descriptions that explain when each tool is useful.
