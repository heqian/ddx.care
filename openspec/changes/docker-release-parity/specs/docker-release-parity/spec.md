## Purpose

Ensures the deployed Docker artifact matches the CI-tested artifact, serves a styled frontend, uses a correct port mapping, owns its data directory, and receives all documented environment variables so production deployment is reliable and representative of tested behavior.

## ADDED Requirements

### Requirement: Docker image serves the CI-built frontend

The Dockerfile SHALL build frontend assets in a builder stage (running `bun run build`) and the final image SHALL serve those prebuilt assets. Alternatively, if serving source, the image SHALL copy `bunfig.toml` and include `tailwindcss` and `bun-plugin-tailwind` as runtime dependencies. CI SHALL build the image and smoke-test that the root page returns styled HTML.

#### Scenario: Container serves styled HTML
- **WHEN** the built image is started and `GET /` is requested
- **THEN** the response includes the bundled CSS link and is not unstyled

#### Scenario: Health check passes with prebuilt assets
- **WHEN** the container starts with prebuilt assets
- **THEN** `GET /v1/health` returns 200 and `GET /` returns 200 with styled HTML

### Requirement: Container port is fixed and host port is separate

The container SHALL listen on a fixed `3000` port. Compose SHALL map `${HOST_PORT:-3000}:3000` and SHALL NOT set the container `PORT` to a variable. Health checks SHALL target `3000`.

#### Scenario: Non-default host port works
- **WHEN** `HOST_PORT=8080` is set
- **THEN** host port 8080 forwards to container port 3000 and the health check (targeting 3000) passes

#### Scenario: Default host port works
- **WHEN** `HOST_PORT` is not set
- **THEN** host port 3000 forwards to container port 3000

### Requirement: Data directory is owned by the non-root user

The Dockerfile SHALL create `/app/data` and chown it to the non-root user before switching to that user. A fresh named volume mounted at `/app/data` SHALL be writable by the non-root process.

#### Scenario: Fresh named volume is writable
- **WHEN** the container starts with a fresh named volume at `/app/data`
- **THEN** SQLite initialization succeeds because the directory is owned by the non-root user

### Requirement: Compose passes all supported environment variables

Compose SHALL pass every supported application variable to the container, via `env_file` or an explicit mapping. Operators SHALL be able to set any documented variable (e.g., `JOB_TTL_MS`, `TOOL_CACHE_TTL_MS`, `ORPHADATA_ENABLED`, audit settings) and have it take effect.

#### Scenario: Documented variable takes effect
- **WHEN** `JOB_TTL_MS=600000` is set in the Compose environment
- **THEN** the running container uses a 10-minute job TTL

#### Scenario: All documented variables are accepted
- **WHEN** the Compose environment is inspected
- **THEN** every variable in `.env.example` is forwarded to the container

### Requirement: Bun versions are aligned

CI, the Dockerfile, and the `packageManager` field SHALL reference one pinned Bun version so the tested runtime matches the deployed runtime.

#### Scenario: CI and Docker use the same Bun version
- **WHEN** the Bun version in CI is compared to the Dockerfile base image
- **THEN** they match exactly