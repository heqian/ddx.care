## ADDED Requirements

### Requirement: Dockerfile pins a specific Bun version

The Dockerfile SHALL use a pinned Bun base image version instead of `oven/bun:latest`. The pinned version SHALL match the Bun version in the project's lockfile.

#### Scenario: Dockerfile does not use latest tag
- **WHEN** the Dockerfile `FROM` line is inspected
- **THEN** it specifies a versioned tag like `oven/bun:1.3.13` rather than `oven/bun:latest`

#### Scenario: Version matches project requirements
- **WHEN** the pinned version is compared against `bun.lock`
- **THEN** it matches the Bun version used during development

### Requirement: Dockerfile declares SQLite data volumes

The Dockerfile SHALL include `VOLUME` declarations for the directories containing persistent SQLite databases (`jobs.sqlite`, `tool-cache.sqlite`, `orphadata.sqlite`). Alternatively, a `docker-compose.yml` SHALL declare named volumes and mount them to the correct paths.

#### Scenario: Container restart preserves job data
- **WHEN** the Docker container is stopped and restarted with volume mounts
- **THEN** previously stored job records, tool cache entries, and Orphadata data are preserved

#### Scenario: Volume mounts are documented
- **WHEN** a developer reads the deployment documentation
- **THEN** they can identify which paths need persistent storage

### Requirement: docker-compose.yml is provided

The project SHALL include a `docker-compose.yml` at the repository root that orchestrates the ddx.care service with all required environment variables, port mappings, and volume mounts.

#### Scenario: Single-command deployment
- **WHEN** a developer runs `docker compose up -d`
- **THEN** the application starts on the configured port with all persistent volumes mounted

#### Scenario: Environment variables are configurable
- **WHEN** the compose file is inspected
- **THEN** it uses `${VAR_NAME}` syntax for required variables like `OLLAMA_API_KEY` and sensible defaults for optional variables like `PORT`

### Requirement: CI workflow caches node_modules

The GitHub Actions CI workflow SHALL cache the `node_modules` directory using `actions/cache@v5` with a key derived from the `bun.lock` file hash. ALL CI jobs (lint, typecheck, test, frontend-test, build, e2e) SHALL restore this cache before running `bun install --frozen-lockfile`.

#### Scenario: Cache hit avoids full install
- **WHEN** CI runs on a branch where `bun.lock` has not changed
- **THEN** `bun install --frozen-lockfile` completes in under 5 seconds using cached `node_modules`

#### Scenario: Cache miss on lockfile change
- **WHEN** `bun.lock` changes in a PR
- **THEN** the cache misses, a full `bun install` runs, and the result is cached for subsequent runs

#### Scenario: All jobs use the same cache key
- **WHEN** the CI workflow is inspected
- **THEN** every job that runs `bun install` references the same cache key derived from `hashFiles('bun.lock')`
