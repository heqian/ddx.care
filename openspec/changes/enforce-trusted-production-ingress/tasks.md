## 1. Configuration Enforcement

- [ ] 1.1 Add strict production validation for trusted origins and minimum token-secret length
- [ ] 1.2 Add and validate explicit trusted proxy IP configuration
- [ ] 1.3 Emit development warnings for insecure local defaults without logging secret values
- [ ] 1.4 Add fresh-process configuration tests for secure and rejected production combinations

## 2. Trusted Client Identity

- [ ] 2.1 Resolve the direct socket peer before considering forwarded headers
- [ ] 2.2 Ignore forwarding headers from peers outside the trusted proxy set
- [ ] 2.3 Validate trusted proxy address values and safely fall back on malformed headers
- [ ] 2.4 Add real route tests for direct spoofing and trusted proxy forwarding

## 3. Deployment Topology

- [ ] 3.1 Keep the application on fixed container port 3000 and add a separate host port setting
- [ ] 3.2 Bind the Compose backend host port to loopback only
- [ ] 3.3 Pass documented runtime settings through an explicit environment file
- [ ] 3.4 Create and own the container data directory before switching to the non-root user
- [ ] 3.5 Update Caddy and deployment documentation with the enforced topology and required settings

## 4. Verification

- [ ] 4.1 Add `docker compose config`, image build, fresh-volume, and styled-root smoke checks to CI
- [ ] 4.2 Add a production startup test that rejects empty secrets and wildcard origins
- [ ] 4.3 Add a bypass test proving remote direct backend access is unavailable
- [ ] 4.4 Validate the Caddyfile in CI and test forwarding to the fixed backend port
- [ ] 4.5 Run `bun run lint`, `bun run typecheck`, backend tests, frontend tests, and deployment smoke tests
