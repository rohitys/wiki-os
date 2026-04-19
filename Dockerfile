# syntax=docker/dockerfile:1.7
# wiki-os on Fly.io — multi-stage build.
# Vault content is cloned from the private rohitys/ripster-vault repo at build time
# using a BuildKit secret (GitHub fine-grained PAT, repo:read on that repo only).
# The secret is never written to an image layer.

# ── Builder ────────────────────────────────────────────────────────────────────
FROM node:24-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      git ca-certificates python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Clone the private vault. BuildKit secret is mounted only for this RUN step.
RUN --mount=type=secret,id=github_token \
    GITHUB_TOKEN="$(cat /run/secrets/github_token)" && \
    git clone --depth 1 \
      "https://x-access-token:${GITHUB_TOKEN}@github.com/rohitys/ripster-vault.git" \
      /app/vault && \
    rm -rf /app/vault/.git

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    PORT=5211 \
    WIKIOS_OPEN_BROWSER=0 \
    WIKIOS_DISABLE_WATCH=1 \
    WIKI_ROOT=/app/vault \
    WIKIOS_INDEX_DB=/app/index/wiki.sqlite

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/vault /app/vault

RUN mkdir -p /app/index

EXPOSE 5211

CMD ["node", "dist-server/server/server.js"]
