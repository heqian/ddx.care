## MODIFIED Requirements

### Requirement: docker-compose.yml is provided

The project SHALL include a `docker-compose.yml` at the repository root that runs the application on a fixed internal port, binds any host backend port to loopback only, injects the documented environment configuration, and mounts writable persistent storage. Host port selection SHALL use a distinct setting and SHALL NOT change the container application port.

#### Scenario: Single-command deployment preserves proxy boundary
- **WHEN** a developer runs `docker compose up -d` with production settings
- **THEN** the application starts on the fixed internal port and its host binding is restricted to loopback for the security proxy

#### Scenario: Environment variables are configurable
- **WHEN** the Compose configuration is inspected
- **THEN** required secrets and all documented runtime settings are passed explicitly or through a declared environment file

#### Scenario: Host port is overridden
- **WHEN** the host backend port override is changed
- **THEN** the host binding changes while the application and health check continue to use the fixed container port

#### Scenario: Fresh volume is mounted
- **WHEN** the service starts with a new empty data volume
- **THEN** the non-root application user can create and update all configured SQLite databases
