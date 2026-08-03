## Context

Caddy is documented as the production security boundary, but Compose publishes the application port on all interfaces and does not run Caddy. Client IP extraction trusts forwarding headers without validating the socket peer. Production configuration validation permits wildcard origins and an empty token secret.

## Goals / Non-Goals

**Goals:**
- Make the documented host-Caddy topology enforce the assumed network boundary.
- Fail production startup when required security configuration is absent.
- Prevent direct clients from choosing their rate-limit identity.
- Preserve simple direct access for local development.

**Non-Goals:**
- Introducing user accounts or replacing Caddy Basic authentication.
- Supporting arbitrary multi-proxy chains without explicit configuration.
- Containerizing Caddy in the initial implementation.
- Providing multi-host or multi-region deployment.

## Decisions

### 1. Bind the Compose backend to loopback

Compose maps `127.0.0.1:${HOST_PORT:-3000}:3000`. The container always listens on port 3000; `HOST_PORT` only selects the host-side loopback port. Host Caddy continues to proxy to `localhost:3000` by default.

An internal Caddy service can be added later, but binding loopback is the smallest change that enforces the current documented topology.

### 2. Add production-only configuration invariants

Configuration validation rejects production startup unless `TRUSTED_ORIGINS` contains explicit HTTPS origins and `WS_TOKEN_SECRET` has at least 32 characters. `ALLOWED_ORIGINS=*` remains available only outside production. The service logs which controls are enabled without logging secret values.

### 3. Configure trusted proxy peers explicitly

Add `TRUSTED_PROXY_IPS`, defaulting to loopback addresses for the documented host-Caddy topology in production. Client IP resolution first obtains the socket peer. Forwarding headers are considered only when that peer is trusted. A trusted request accepts one normalized `X-Real-IP` value; malformed or multiple values fall back to the socket peer.

### 4. Pass application settings through an explicit environment file

Compose declares `env_file: .env` and overrides only fixed storage and internal-port settings. This prevents retention, audit, model, or cache settings from silently remaining at defaults.

### 5. Verify the deployed boundary, not a copied helper

Integration tests start the application in production configuration and exercise real client-IP resolution. A container smoke test verifies loopback binding, fresh-volume write access, fixed internal port behavior, and startup rejection for missing security settings.

## Risks / Trade-offs

- [Existing deployments connect directly to the host app port] -> This is an intentional breaking change; require access through Caddy or an SSH/local tunnel.
- [Proxy address differs in custom deployments] -> Require operators to set `TRUSTED_PROXY_IPS`; never fall back to trusting all peers.
- [Local HTTPS origin requirements complicate development] -> Apply strict invariants only when `NODE_ENV=production`.
- [Compose env_file can expose unused settings] -> Keep `.env` excluded from Git and Docker build context and document secret management for production.

## Migration Plan

1. Add production configuration validation and tests.
2. Add trusted-peer-aware client IP resolution.
3. Update Compose to fixed internal port, loopback binding, explicit environment file, and writable data directory.
4. Validate Caddy configuration and deploy Caddy before the new application container.
5. Verify external port scans expose only Caddy ports.
6. Roll back by restoring the prior image while retaining firewall rules; do not reopen the backend port publicly.
