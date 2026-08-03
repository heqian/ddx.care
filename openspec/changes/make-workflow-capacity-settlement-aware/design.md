## Context

Capacity is currently a scalar incremented before body parsing. A bounded set remembers released IDs, but cancellation decrements immediately and the set is cleared by periodic pruning. Workflow startup spans database creation, Mastra run creation, controller registration, and asynchronous execution without one exception-safe reservation owner.

## Goals / Non-Goals

**Goals:**
- Make capacity ownership exact, job-scoped, and inspectable.
- Count work until its underlying promise settles.
- Make every release path idempotent without historical release storage.
- Ensure initialization failures cannot leak reservations.

**Non-Goals:**
- Building a durable queue.
- Sharing capacity across multiple processes.
- Guaranteeing immediate cancellation of non-abortable third-party operations.
- Changing the configured admission limit or per-IP rate policy.

## Decisions

### 1. Represent active capacity as `Set<jobId>`

Replace `activeCount` and `releasedJobIds` with an `activeJobIds` set. `tryStartWorkflow(jobId)` checks capacity and adds the job atomically in the same synchronous method. `finishWorkflow(jobId)` deletes only that ID and returns whether a reservation was released. `activeWorkflows` is the set size.

No release history is needed because absence from the active set is sufficient to make duplicate release a no-op.

### 2. Reserve only after parsing and schema validation

Per-IP requests are still recorded before body parsing, and Bun still enforces the body-size limit. Workflow capacity is reserved only after valid input and job ID generation. This prevents slow or malformed bodies from occupying expensive workflow slots.

### 3. Use one startup compensation boundary

After reservation, job creation, run creation, controller registration, and `run.start` setup execute inside one try/catch. A release-once cleanup closes the exact reservation if any synchronous setup step fails. If the job row exists, it is marked failed with a sanitized initialization error.

### 4. Release only from workflow settlement

The DELETE handler aborts and records cancellation but never calls `finishWorkflow`. The workflow promise's `finally` removes the controller and reservation. Tool and LLM cancellation improvements can reduce settlement time independently without weakening the capacity invariant.

### 5. Drive shutdown from exact active ownership

Graceful shutdown observes the active job set and logs the IDs only at debug level if necessary. Future promise tracking can build on the same ownership model; this change retains the existing shutdown deadline.

## Risks / Trade-offs

- [Cancelled work keeps capacity occupied briefly] -> This is intentional because the work still consumes resources; improve abort propagation separately.
- [Parsing happens before capacity rejection] -> Bun caps request size and per-IP rate limiting remains early; body-read timeouts can be added independently.
- [A never-settling provider holds capacity until timeout] -> The diagnosis timeout remains the final release bound.
- [Single-process set cannot coordinate replicas] -> Continue enforcing one replica until a shared admission system is designed.

## Migration Plan

1. Add active-job ownership APIs and focused unit tests.
2. Move reservation after validation and wrap initialization in compensation logic.
3. Remove capacity release from DELETE.
4. Update shutdown and health reporting to use active set size.
5. Replace tests that expect prune to clear release guards or cancellation to free capacity immediately.
6. Deploy without data migration; rollback requires the previous application version only.
