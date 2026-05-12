## Context

This change consolidates fixes from a comprehensive codebase review covering reliability, security, agent orchestration, frontend UX, and DevOps. The system uses Mastra for LLM agent orchestration, Bun for the HTTP server, SQLite for persistence, and React 19 with Tailwind CSS v4 for the frontend. The changes span across all layers but are individually small and additive.

## Goals / Non-Goals

**Goals:**
- Eliminate race conditions where dual `finishWorkflow()` calls can underflow the concurrency counter
- Prevent job state corruption when cancellation races with workflow completion
- Harden request body parsing against spoofed `Content-Length` headers
- Improve CMO-to-specialist routing accuracy via dynamic ID injection and deduplication
- Enable cross-round context sharing by default
- Reduce token waste by assigning tools per specialist category
- Add progress phase indicators and markdown rendering on the frontend
- Pin infrastructure versions and add Docker orchestration

**Non-Goals:**
- Extracting the diagnostic-workflow.ts monolith into separate files (§1d of the review) — deferred to a follow-up
- Adding PDF export (§5c) or load/stress tests (§6d) — deferred to follow-ups
- Schema consolidation (§8a) or response flattening (§8b) — deferred to follow-ups
- Adding `/v1/metrics` endpoint (§7e) — deferred to a follow-up
- Fixing the Orphadata SQL LIKE injection surface (§2a) — lower priority, deferred

## Decisions

### 1. Concurrency slot guard: use a `released` WeakMap flag

**Decision**: Add a `Set<string>` tracking which job IDs have already released their concurrency slot. The `finishWorkflow()` method checks membership and no-ops if already released.

**Alternatives considered**:
- Removing `finishWorkflow()` from the DELETE handler entirely — but the cancel path needs to release the slot *immediately* so other users can proceed, not wait for the slow in-flight abort to propagate.
- Using `Math.min()` to clamp — hides the bug rather than fixing it.

### 2. Complete-after-fail guard: check current status in `complete()`

**Decision**: In `progressStore.complete()`, read the current job row. If `status === "failed"`, log a warning and return without overwriting. This is a read-then-write pattern; SQLite's single-writer serialization means no TOCTOU race within a single process.

**Alternatives considered**:
- Using SQLite's `INSERT OR IGNORE` — not applicable since `complete()` is an UPDATE.
- Adding a version/timestamp check — over-engineering for a single-process SQLite store.

### 3. Body size enforcement: use Bun's `maxRequestBodySize`

**Decision**: Set `maxRequestBodySize: MAX_PAYLOAD_BYTES` in `Bun.serve()`. Bun will stream the body and reject oversized requests with a `413 Payload Too Large` response before the application code ever reads it. This is the idiomatic Bun approach and requires no custom stream-reading code.

### 4. Specialist deduplication: filter by ID within the current round

**Decision**: Apply a `Map`-based deduplication on `newSpecialistRequests` before dispatching. Combine with the existing `allConsultedSpecialists` Set for cross-round dedup.

**Alternatives considered**:
- Teaching the CMO not to duplicate — unreliable; LLMs are non-deterministic.

### 5. Dynamic specialist IDs in CMO prompt

**Decision**: At workflow start, build the list of available specialist IDs from `Object.keys(specialists)` and inject it into the CMO's system prompt or instructions. The output schema's `id` field gains a Zod `enum()` constraint using the actual keys.

**Alternatives considered**:
- Hardcoding the list in the prompt — fragile, diverges from actual agent registry.
- Using a fixed string in the schema — same problem.

### 6. Per-specialist tool tiers

**Decision**: Define tool categories as a TypeScript enum-adjacent mapping and assign categories per specialist. The `getToolsForSpecialist(id)` function returns only the tools for the specialist's assigned categories. The CMO gets only `drug-interaction` and `medlineplus-search`.

Tool category assignments:
- **Universal** (all specialists): `medlineplus-search`, `drug-labeling`, `adverse-events`, `food-adverse-events`, `device-adverse-events`
- **Prescribing** (primary care, internists, surgeons, critical care): `drug-lookup`, `drug-interaction`, `drug-spelling-suggestion`, `drug-shortages`
- **Rare Disease** (geneticist, pediatrician, neurologist, pathologist, maternal-fetal): `rare-disease-search`, `rare-disease-genes`, `rare-disease-phenotypes`
- **Toxicology** (toxicologist, intensivist, emergency physician): `substance-toxicology`
- **Trials** (oncologist, hematologist, rheumatologist, neurologist): `clinical-trials-search`
- **Lab/Phenotype** (geneticist, pathologist, rheumatologist): `hpo-term-search`, `loinc-test-lookup`

The `tool-use-progress` spec's label lookup table already covers all 17 tools; this change only affects which tools are registered per agent, not the progress event labels.

### 7. `SPECIALIST_CONTEXT_MODE` default to `prior_rounds`

**Decision**: Change the default in `config.ts` from `"none"` to `"prior_rounds"`. This means specialists in round 2+ will receive a summary of findings from earlier rounds, improving diagnostic quality. Users who prefer isolation (e.g., for controlled experiments) can set `SPECIALIST_CONTEXT_MODE=none`.

### 8. Frontend progress phases

**Decision**: Derive the current phase from progress event types:
- Phase 1 "Triaging": after `round_start` but before any `specialist_start`
- Phase 2 "Consulting": during `specialist_start` / `specialist_complete` events (show X/Y count)
- Phase 3 "Synthesizing": after last `specialist_complete` and before `cmo_final`
- Phase 4 "Reporting": after `cmo_final` (during `formatReport` step)

Render as a horizontal step indicator with filled/current/pending states.

### 9. Markdown rendering in ResultsView

**Decision**: Use the existing `marked` and `isomorphic-dompurify` dependencies (already in `package.json` and used by `ConsultNotes`). Wrap `crossSpecialtyObservations` and `recommendedImmediateActions` strings through `DOMPurify.sanitize(marked.parse(text))` before rendering with `dangerouslySetInnerHTML`.

### 10. Dockerfile Bun version pin

**Decision**: Pin to `oven/bun:1.3.13` (the version currently in `bun.lock`).

### 11. CI cache

**Decision**: Add `actions/cache@v5` with key on `bun.lock` hash. Apply to all CI jobs.

## Risks / Trade-offs

- **Per-specialist tools may miss edge cases**: A dermatologist evaluating a drug-induced rash can't check drug interactions directly. Mitigation: Universal tools (`drug-labeling`, `adverse-events`) still provide drug information; the CMO can call drug-interaction on behalf of any specialist during synthesis.
- **`prior_rounds` context mode increases token usage**: Each specialist in rounds 2+ receives additional context text. Mitigation: `SPECIALIST_CONTEXT_MAX_CHARS` (default 2000) caps the context size per call. Users can revert to `none` if token costs are a concern.
- **Body size enforcement at HTTP layer**: Bun's `maxRequestBodySize` rejects the request with a 413 before our CORS middleware runs. Mitigation: Bun still sends CORS headers on preflight; the 413 only applies to the actual POST body. Since we control the client, this is acceptable.
