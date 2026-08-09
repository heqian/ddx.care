## 1. Dockerfile Multi-Stage Build

- [ ] 1.1 Add a builder stage to `Dockerfile` that runs full `bun install` and `bun run build`
- [ ] 1.2 In the final stage, copy the prebuilt `dist/` assets and any required `index.html`
- [ ] 1.3 Keep `ENV PORT=3000` and `EXPOSE 3000`; do not set `PORT` from Compose

## 2. Data Directory Ownership

- [ ] 2.1 Before `USER bun`, create and chown `/app/data` in the Dockerfile
- [ ] 2.2 Ensure `DB_PATH`, `TOOL_CACHE_DB_PATH`, and `ORPHADATA_DB_PATH` default to `/app/data/...` in Compose

## 3. Compose Port and Env

- [ ] 3.1 Change `docker-compose.yml` port mapping to `${HOST_PORT:-3000}:3000`; remove `PORT=${PORT}` from the container environment
- [ ] 3.2 Add `env_file: [".env"]` and keep explicit overrides for path normalization (`DB_PATH`, `TOOL_CACHE_DB_PATH`, `ORPHADATA_DB_PATH`)
- [ ] 3.3 Ensure every documented variable in `.env.example` is forwarded

## 4. Bun Version Alignment

- [ ] 4.1 Add `"packageManager": "bun@1.3.13"` to `package.json`
- [ ] 4.2 Pin CI `bun-version` to `1.3.13` in `.github/workflows/ci.yml`
- [ ] 4.3 Confirm the Dockerfile base image matches

## 5. .dockerignore

- [ ] 5.1 Update `.dockerignore` to use `*.sqlite*` and add `logs/`, `*.log`, and the data directory

## 6. CI Container Smoke Test

- [ ] 6.1 Add a CI job that `docker build`s the image, starts it with an empty named volume, and smoke-tests `GET /` (styled HTML) and `GET /v1/health` (200)

## 7. Documentation and Verification

- [ ] 7.1 Update `README.md` and `AGENTS.md` with the `HOST_PORT` distinction and `env_file` behavior
- [ ] 7.2 Run `bun run lint` and `bun run typecheck`; run the container smoke test locally if Docker is available