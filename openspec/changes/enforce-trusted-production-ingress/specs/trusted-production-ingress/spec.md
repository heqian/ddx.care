## Purpose

Ensures production traffic reaches the application only through the configured security proxy and cannot spoof proxy-derived identity.

## ADDED Requirements

### Requirement: Production configuration fails closed
When running in production, the service SHALL require a non-wildcard trusted-origin allowlist and a job-token secret of at least 32 characters. Missing or insecure values SHALL prevent startup.

#### Scenario: Production secret is empty
- **WHEN** `NODE_ENV=production` and the job-token secret is empty
- **THEN** configuration validation fails before the server starts

#### Scenario: Production origins are wildcard
- **WHEN** `NODE_ENV=production` and trusted origins are empty or resolve to `*`
- **THEN** configuration validation fails before the server starts

#### Scenario: Development uses explicit insecure defaults
- **WHEN** the service runs outside production with empty security settings
- **THEN** it may start for local development and emits a warning that authentication and origin enforcement are disabled

### Requirement: Backend ingress is private in production
The documented production topology SHALL expose only the security proxy to non-loopback clients. The backend application port SHALL be reachable only through loopback or a private container network.

#### Scenario: Remote client targets the backend port
- **WHEN** a remote client attempts to connect directly to the host's backend application port
- **THEN** the connection is not accepted by the production topology

#### Scenario: Proxy forwards an authenticated request
- **WHEN** the configured security proxy forwards a request over the trusted local boundary
- **THEN** the backend processes the request normally

### Requirement: Forwarded client identity is trusted only from configured proxies
The service SHALL use forwarded client-address headers only when the direct peer is in the configured trusted-proxy set. Otherwise it SHALL use the socket peer address and ignore supplied forwarding headers.

#### Scenario: Direct client spoofs X-Real-IP
- **WHEN** an untrusted direct peer sends `X-Real-IP` or `X-Forwarded-For`
- **THEN** rate limiting uses the direct peer address and ignores the spoofed values

#### Scenario: Trusted proxy supplies client address
- **WHEN** a configured trusted proxy supplies the client address header
- **THEN** rate limiting uses the validated forwarded client address

### Requirement: Proxy bypass is covered by deployment tests
The deployment test suite SHALL verify proxy-only access, production configuration rejection, and forwarded-header spoof resistance.

#### Scenario: Deployment security smoke test runs
- **WHEN** the production Compose topology is started in CI
- **THEN** proxy requests succeed, direct external backend requests fail, and spoofed headers do not change the effective client identity
