## Why

The Docker image installs production dependencies only, excluding `tailwindcss` and `bun-plugin-tailwind` (devDependencies), and does not copy `bunfig.toml`, yet it runs source that imports HTML/CSS requiring Tailwind processing — risking an unstyled or broken frontend while `/v1/health` still passes. CI builds `dist` but Docker never runs that build or copies `dist`, so the tested artifact differs from the deployed artifact. Compose maps host `${PORT}` to container 3000 while also making the process listen on `${PORT}`, so non-default ports break routing and health checks. A fresh named volume for `/app/data` may be root-owned, making SQLite startup fail for the non-root `bun` user. Compose passes only a subset of documented environment variables, so most `.env` settings silently have no effect.

## What Changes

- **Multi-stage build serving prebuilt assets**: the Dockerfile SHALL build frontend assets in a builder stage and the final image SHALL serve those assets (or copy `bunfig.toml` and runtime-required Tailwind packages if serving source).
- **CI builds and tests the image**: CI SHALL `docker build` the image, start it with an empty volume, and smoke-test the root page and `/v1/health`.
- **Fixed container port**: the container SHALL listen on a fixed `3000` port; Compose SHALL introduce a separate `HOST_PORT` for host mapping and health checks SHALL target `3000`.
- **Data directory ownership**: the Dockerfile SHALL create and chown `/app/data` before switching to the non-root user.
- **Full env var passthrough**: Compose SHALL pass every supported application variable via `env_file` or explicit mapping.
- **Aligned Bun versions**: CI, Dockerfile, and `packageManager` SHALL use one pinned Bun version.

## Capabilities

### New Capabilities

- `docker-release-parity`: Ensures the deployed Docker artifact matches the CI-tested artifact, serves a styled frontend, uses a correct port mapping, owns its data directory, and receives all documented environment variables.

### Modified Capabilities

- `devops-improvements`: The Dockerfile SHALL serve prebuilt assets (or include runtime Tailwind config), SHALL create and own `/app/data`, and SHALL use a fixed container port; Compose SHALL pass all supported env vars and use a separate host port.

## Impact

- **Infrastructure**: `Dockerfile` (multi-stage, data dir, port), `docker-compose.yml` (host port, env_file, volume ownership), `.dockerignore` (`*.sqlite*`, logs), `bunfig.toml` (copied if serving source), `.github/workflows/ci.yml` (docker build/test, pinned Bun).
- **Config**: `package.json` (`packageManager` field).
- **Tests**: container smoke tests.
- **Documentation**: `AGENTS.md`, `README.md` (deployment).