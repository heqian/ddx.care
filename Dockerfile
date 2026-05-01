FROM oven/bun:latest AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src/ src/
COPY index.ts index.html tsconfig.json ./

FROM oven/bun:latest

WORKDIR /app

COPY --from=builder /app ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD bun -e "const r = await fetch('http://localhost:3000/v1/health'); process.exit(r.ok ? 0 : 1)"

USER bun

CMD ["bun", "index.ts"]
