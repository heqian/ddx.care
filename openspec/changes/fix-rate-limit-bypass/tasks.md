## 1. Move rateLimiter.record() Call

- [ ] 1.1 In `src/backend/api/routes.ts`, move `rateLimiter.record(ip)` from after Zod validation (line 211) to immediately after the `rateLimiter.check(ip)` success check (after line 131), before `canStartWorkflow()`.
- [ ] 1.2 Verify that `startWorkflow()` / `finishWorkflow()` calls remain unchanged — slots are still only consumed for requests that pass validation.

## 2. Testing

- [ ] 2.1 Update existing tests in `tests/api.test.ts` that assert invalid requests do NOT increment the rate limit — these must now assert that they DO increment it.
- [ ] 2.2 Add test verifying rapid invalid payloads (e.g., 10 consecutive malformed requests) trigger `429 Too Many Requests` on the 11th request.
- [ ] 2.3 Add test verifying that schema-validation failures (valid JSON, fails Zod) still increment the rate limit.
- [ ] 2.4 Verify existing concurrent-workflow-slot tests still pass (slots only consumed for valid requests).
- [ ] 2.5 Run `bun run lint && bun run typecheck && bun run test` to verify all changes.

## 3. Documentation

- [ ] 3.1 Update `AGENTS.md` config section to clarify that `RATE_LIMIT_MAX_REQUESTS` counts all requests (valid and invalid), not just valid ones.
