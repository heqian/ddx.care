## Why

The documented Compose deployment publishes the Bun port on every host interface, allowing callers to bypass Caddy's TLS, Basic authentication, HSTS, and HTML security headers. The application also trusts forwarding headers from direct clients and permits production startup without trusted origins or a job-token secret.

## What Changes

- **BREAKING**: Make the backend private to loopback or the Compose-internal proxy network in production deployment definitions.
- Require explicit trusted origins and a strong job-token secret when `NODE_ENV=production`.
- Trust forwarded client-address headers only when the request came through a configured trusted proxy.
- Separate host-published port configuration from the fixed container application port.
- Add deployment tests proving direct backend access cannot bypass the proxy security boundary.
- Document supported direct-development and proxied-production topologies.

## Capabilities

### New Capabilities
- `trusted-production-ingress`: Defines production startup invariants, proxy trust, private backend exposure, and bypass-resistance checks.

### Modified Capabilities
- `devops-improvements`: Tightens Compose port, network, environment, and proxy behavior from deployable to security-enforced production topology.

## Impact

- `docker-compose.yml`, `Caddyfile`, and deployment documentation
- Backend configuration validation and client IP extraction
- Production environment-variable requirements
- API rate-limit behavior behind trusted proxies
- Container, Caddy, CORS, and proxy integration tests
