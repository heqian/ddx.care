## 1. Orphadata Cache Infrastructure

- [x] 1.1 Create `src/backend/orphadata-cache.ts` with SQLite table creation (drop + create `orphadata_diseases`, `orphadata_genes`, `orphadata_phenotypes` with indexes)
- [x] 1.2 Implement `fetchDiseases()` to fetch from Orphadata diseases API, parse JSON, and insert into `orphadata_diseases`
- [x] 1.3 Implement `fetchGenes()` to fetch from Orphadata genes API, parse JSON, and insert into `orphadata_genes` (lazy, on-demand)
- [x] 1.4 Implement `fetchPhenotypes()` to fetch from Orphadata phenotypes API, parse JSON, and insert into `orphadata_phenotypes` (lazy, on-demand)
- [x] 1.5 Implement `initializeOrphadataCache()` that calls disease fetcher with error handling (warn + continue on failure)
- [x] 1.6 Add `ORPHADATA_ENABLED` config variable (default `true`) to `src/backend/config.ts`
- [x] 1.7 Wire `initializeOrphadataCache()` into server startup in `index.ts` (after progressStore init, before listening)
- [x] 1.8 Write unit tests for cache initialization, table creation, and graceful failure

## 2. Orphadata Tools

- [x] 2.1 Create `src/backend/tools/orphadata.ts` with imports from `orphadata-cache.ts`
- [x] 2.2 Implement `rareDiseaseSearchTool` — accepts query + maxResults, queries `orphadata_diseases` with LIKE on name
- [x] 2.3 Implement `rareDiseaseGenesTool` — accepts orphacode, queries `orphadata_genes` (lazy-cached)
- [x] 2.4 Implement `rareDiseasePhenotypesTool` — accepts orphacode, queries `orphadata_phenotypes` (lazy-cached)
- [x] 2.5 Write unit tests for all three tools with mock SQLite data

## 3. NLM Clinical Tables Tools

- [x] 3.1 Create `src/backend/tools/nlm-clinical-tables.ts` with shared NLM API base URL and response parser
- [x] 3.2 Implement `hpoTermSearchTool` — accepts query + maxResults, queries NLM HPO API, returns ID/name
- [x] 3.3 Implement `loincTestLookupTool` — accepts query + maxResults, queries NLM LOINC API, returns LOINC code/name/system/method
- [x] 3.4 Write unit tests for both tools mocking HTTP responses

## 4. OpenFDA Expansions

- [x] 4.1 Add `drugShortagesTool` to `src/backend/tools/open-fda.ts` — queries `/drug/shortages.json`
- [x] 4.2 Add `foodAdverseEventsTool` to `src/backend/tools/open-fda.ts` — queries `/food/event.json`
- [x] 4.3 Add `deviceAdverseEventsTool` to `src/backend/tools/open-fda.ts` — queries `/device/event.json`
- [x] 4.4 Add TypeScript interfaces for each endpoint's response shape
- [x] 4.5 Write unit tests for all three new tools

## 5. Flatten Tool Assignments

- [x] 5.1 Replace `toolAssignments` and per-specialist category constants in `src/backend/tools/index.ts` with a single `getAllTools()` function that merges all tool objects
- [x] 5.2 Update `src/backend/agents/factory.ts` to call `getAllTools()` instead of `getToolsForSpecialist(id)`
- [x] 5.3 Update `src/backend/agents/chief-medical-officer.ts` to use `getAllTools()`
- [x] 5.4 Remove the `getToolsForSpecialist` function export and all category constant exports
- [x] 5.5 Update any tests that import `getToolsForSpecialist` or `toolAssignments`

## 6. Tool Labels

- [x] 6.1 Add labels for all 8 new tools to `src/backend/tools/tool-labels.ts`

## 7. Verification

- [x] 7.1 Run `bun run lint` and fix any issues
- [x] 7.2 Run `bun run typecheck` and fix any type errors
- [x] 7.3 Run `bun run test` and ensure all existing + new tests pass
- [x] 7.4 Verify startup logs show Orphadata cache loading (confirmed via test suite output: `INFO orphadata_cache_complete {"diseaseCount":11456}`)