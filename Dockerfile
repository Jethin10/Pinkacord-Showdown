# syntax=docker/dockerfile:1.7

# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 — build
#   Installs all deps (including devDeps for the TypeScript build), then
#   transpiles every TS file under sim/, server/, data/, config/, tools/ into
#   dist/ using PS's own esbuild-based build script. Also runs the Pinkacord
#   content generator to produce data/mods/pinkacord/ and config/custom-formats.ts.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Install build-essentials for native modules (better-sqlite3 needs python3/make/g++).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy lockfile + package metadata first to maximize layer cache hits.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Create config.js from the example if it doesn't exist (it's gitignored)
RUN cp -n config/config-example.js config/config.js 2>/dev/null || true

# Phase 1: PS TypeScript build
RUN node build force

# Phase 2: Pinkacord content generator (reads content/*.json, emits data/mods/pinkacord/*.ts + config/custom-formats.ts)
RUN node dist/tools/pinkacord/cli.js build


# ──────────────────────────────────────────────────────────────────────────────
# Stage 2 — runtime
#   Slim image with only the JS runtime + production deps + the dist/ output.
#   Runs as non-root and exposes both PS (8000) and admin (8001) ports.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Production-only install reuses the layer cache from stage 1 when package.json
# is unchanged. We keep devDeps out of the final image to minimize attack surface.
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Bring in the source we still need at runtime + the transpiled output.
# PS's bin script reads config/, data/, server/static/, etc. from the repo root.
COPY --from=build /app/pokemon-showdown ./pokemon-showdown
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
COPY --from=build /app/config ./config
COPY --from=build /app/data ./data
COPY --from=build /app/server ./server
COPY --from=build /app/sim ./sim
COPY --from=build /app/lib ./lib
COPY --from=build /app/tools ./tools
COPY --from=build /app/translations ./translations
COPY --from=build /app/content ./content

# Persist these directories on a mounted volume so user data survives container
# replacement. See HOSTING.pinkacord.md for the volume mount pattern.
VOLUME ["/app/logs", "/app/databases", "/app/content"]

# Drop privileges to the stock node user.
RUN mkdir -p /app/logs /app/databases /app/logs/pinkacord && chown -R node:node /app/logs /app/databases /app/content
USER node

# Documented for orchestrators; bind at runtime via env vars if you need 0.0.0.0.
ENV PINKACORD_PS_PORT=8000 \
    PINKACORD_ADMIN_PORT=8001 \
    PINKACORD_ADMIN_BIND=0.0.0.0
EXPOSE 8000 8001

# Health: the admin panel's /health requires no auth and 200s when the process
# is up. Fly.io and most orchestrators read this directly.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PINKACORD_ADMIN_PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tools/launcher.js is PID 1. It wires SIGTERM/SIGINT to both child processes.
ENTRYPOINT ["node", "tools/launcher.js"]
