## MODIFIED Requirements

### Requirement: docker-compose.yml is provided

The project SHALL include a `docker-compose.yml` at the repository root that orchestrates the ddx.care service with all required environment variables, port mappings, and volume mounts. Compose SHALL pass every supported application variable to the container via `env_file` or an explicit mapping. The container SHALL listen on a fixed `3000` port; Compose SHALL map `${HOST_PORT:-3000}:3000` and SHALL NOT set the container `PORT` to a variable. The Dockerfile SHALL create and chown `/app/data` before switching to the non-root user.

#### Scenario: Single-command deployment
- **WHEN** a developer runs `docker compose up -d`
- **THEN** the application starts on the configured host port with all persistent volumes mounted and all documented variables forwarded

#### Scenario: Non-default host port works
- **WHEN** `HOST_PORT=8080` is set
- **THEN** host port 8080 forwards to container port 3000 and the service is reachable

#### Scenario: Environment variables are configurable
- **WHEN** the compose file is inspected
- **THEN** it forwards every documented variable and uses `${VAR_NAME}` syntax for required variables with sensible defaults

#### Scenario: Fresh named volume is writable
- **WHEN** the container starts with a fresh named volume at `/app/data`
- **THEN** the non-root process can write SQLite files because the directory is owned by that user

### Requirement: Dockerfile pins a specific Bun version

The Dockerfile SHALL use a pinned Bun base image version instead of `oven/bun:latest`. The pinned version SHALL match the Bun version in the project's lockfile and the `packageManager` field, and SHALL match the version used by CI.

#### Scenario: Dockerfile does not use latest tag
- **WHEN** the Dockerfile `FROM` line is inspected
- **THEN** it specifies a versioned tag like `oven/bun:1.3.13` rather than `oven/bun:latest`

#### Scenario: Version matches across CI, Docker, and packageManager
- **WHEN** the pinned version is compared across CI, the Dockerfile, and `package.json` `packageManager`
- **THEN** they all match exactly