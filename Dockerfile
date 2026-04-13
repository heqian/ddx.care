FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "index.ts"]
