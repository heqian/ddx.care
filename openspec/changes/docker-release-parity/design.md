## Context

`Dockerfile:6-10` installs `--production`, excluding `tailwindcss` and `bun-plugin-tailwind` (devDependencies per `package.json:18-29`), and does not copy `bunfig.toml` (which enables the Tailwind plugin at `bunfig.toml:1-2`). The image runs source `index.ts` (`Dockerfile:26`) that imports `index.html`/CSS requiring Tailwind processing. CI builds `dist` (`.github/workflows/ci.yml:68-80`) but Docker never runs that build. Compose maps `${PORT}:3000` and sets `PORT=${PORT}` (`docker-compose.yml:4-9`), so a non-default port makes the process listen on the wrong container port. `Dockerfile:24` switches to `USER bun` without creating/chowning `/app/data`. Compose passes only a subset of variables (`docker-compose.yml:6-17`). CI uses `bun-version: latest` (`.github/workflows/ci.yml:16`) while Docker pins `1.3.13`. `.dockerignore:10` excludes `*.sqlite` but not `*.sqlite-wal`/`*.sqlite-shm`.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Serve a styled, tested frontend in production.
- Fix port, volume, env, and version mismatches.
- Add container smoke tests to CI.

**Non-Goals:**
- Kubernetes/Helm manifests.
- Multi-arch images.
- Changing the Caddy reverse proxy topology.

## Decisions

### D1: Multi-stage build serving prebuilt assets

**Decision:** Add a builder stage that runs `bun install` (full, not `--production`) and `bun run build`, then a final stage that copies `dist/` and runs `bun index.ts` (which serves the bundled HTML). If `index.ts`'s HTMLBundle route requires the source `index.html`, copy `dist/index.html` and the built assets.

**Rationale:** Serving the CI-built artifact guarantees the deployed UI matches the tested UI and removes the runtime Tailwind dependency.

**Alternatives considered:**
- Move Tailwind packages to `dependencies` and copy `bunfig.toml` — works but ships a heavier image and processes CSS at runtime, which is slower and less reproducible.
- Keep `--production` and prebuild — requires the build stage to have devDependencies; the multi-stage approach handles this.

### D2: Fixed container port, separate host port

**Decision:** Keep `ENV PORT=3000` in the Dockerfile. Compose maps `${HOST_PORT:-3000}:3000` and does not set `PORT` in the container environment.

**Rationale:** Decouples host exposure from the container's listen port, so health checks and Caddy (which target 3000) keep working regardless of the host port.

### D3: Create and chown /app/data

**Decision:** Before `USER bun`, run `install -d -o bun -g bun /app/data` (or `mkdir -p /app/data && chown bun:bun /app/data`).

**Rationale:** A fresh named volume is initialized with the directory's ownership from the image; creating it as `bun` ensures the non-root process can write.

### D4: env_file for full variable passthrough

**Decision:** Compose SHALL use `env_file: [".env"]` (or an explicit list) so every documented variable reaches the container, while still overriding specific values (e.g., `DB_PATH=/app/data/jobs.sqlite`) in the `environment` block.

**Rationale:** Passing only a subset silently ignores operator settings. `env_file` forwards all variables; explicit overrides handle path normalization.

### D5: Aligned Bun versions

**Decision:** Add `"packageManager": "bun@1.3.13"` to `package.json`, pin CI to `1.3.13`, and keep the Dockerfile at `oven/bun:1.3.13`.

**Rangement:** Ensures the tested and deployed runtimes match.

### D6: Broaden .dockerignore

**Decision:** Change `.dockerignore` `*.sqlite` to `*.sqlite*` and add `logs/`, `*.log`, and the data directory.

**Rationale:** WAL/SHM sidecars and audit logs should not enter build contexts.

## Risks / Trade-offs

- **[Multi-stage build is larger/slower to build]** → The builder stage installs devDependencies. **Mitigation:** Layer caching; the final image stays small.
- **[env_file forwards secrets]** → `.env` may contain `OLLAMA_API_KEY`. **Mitigation:** That is intended; Compose env_file is the standard mechanism.
- **[packageManager field requires Bun ≥1.0]** → Already satisfied.

## Migration Plan

1. Merge the multi-stage Dockerfile and updated Compose; existing `.env` files work with `env_file`.
2. Add the CI docker build/test job.
3. Rollback: revert to the production-install single-stage image (unstyled risk but backward-compatible).

## Open Questions

- Does `index.ts`'s HTMLBundle route serve `dist/index.html` or the source `index.html`? (Need to verify during implementation; if it requires source, copy source `index.html` into the final stage and rely on prebuilt JS/CSS assets.)