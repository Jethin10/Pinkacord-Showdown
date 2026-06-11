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

# Cache-bust: bump CACHE_BUST (or pass --build-arg CACHE_BUST=<timestamp>) to force
# everything below this line to rebuild. Render's BuildKit otherwise reuses CACHED
# layers for `COPY . .` and the build steps, which can ship a STALE config.js even
# after you've committed changes. This was the cause of the 512Mi boot OOM
# persisting across deploys: the running image predated the single-process fix.
ARG CACHE_BUST=2026-06-04-2
RUN echo "cache bust: ${CACHE_BUST}"

COPY . .

# Use committed config.js if it exists, otherwise fall back to the example.
# Both config.js and config-example.js default to single-process (subprocesses=0)
# unless PINKACORD_HIGH_MEMORY=1 is set, so either path is safe on a 512MB host.
RUN if [ -f config/config.js ]; then echo "using committed config.js"; else cp config/config-example.js config/config.js; fi

# Fail the build loudly if the config does NOT resolve to single-process by default.
# Cheap insurance against a future edit silently reintroducing the multi-process OOM.
RUN node -e "const c=require('./config/config.js'); if (c.subprocesses!==0) { console.error('FATAL: subprocesses must default to 0 (got '+JSON.stringify(c.subprocesses)+')'); process.exit(1);} console.log('config check OK: subprocesses=0');"

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

# Production-only install. We need zod at runtime because the admin panel's
# generator uses it for validation. Install it separately after the main install.
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm install zod --save=false --no-audit --no-fund && npm cache clean --force

# Bring in the source we still need at runtime + the transpiled output.
# PS's bin script reads config/, data/, server/static/, etc. from the repo root.
COPY --from=build /app/tsconfig.json ./
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
# logs/repl must exist at boot: lib/repl.ts cleanup() does a readdir on it and
# crashes the server with ENOENT otherwise (locally `node build` masks this by
# running in a repo where logs/repl is already present).
RUN mkdir -p /app/logs /app/databases /app/logs/pinkacord /app/logs/repl && chown -R node:node /app/logs /app/databases /app/content
USER node

# Override .npmrc's 3GB heap limit for constrained environments (Render free = 512MB).
# With subprocesses: 0, the server uses ~90MB RSS. 384MB heap leaves room for OS overhead.
#
# PINKACORD_LOW_MEMORY=1 is the load-bearing line for free-tier hosting: it makes
# config/config.js set `subprocesses: 0` so the whole server runs in ONE process.
# Without it, PS forks ~13 child processes at boot (one per role), each loading its
# own engine copy, and the container OOMs past 512Mi before it finishes starting.
# Baked in here as a safety net; render.yaml also sets it explicitly.
#
# MALLOC_ARENA_MAX=2 — THE fix for "62MB locally but 512MB+ on Render". glibc malloc
# allocates one ~64MB memory arena PER CPU CORE. Render's host reports many cores, so
# a single-process Node balloons to 8+ arenas (8x RSS) even though the heap is tiny.
# Capping arenas to 2 keeps RSS near the real heap size. This is the classic cause of
# "fine on my machine, OOMs in the cloud" for Node containers.
# UV_THREADPOOL_SIZE=2 trims libuv's worker threads (each has its own stack) similarly.
# GOMAXPROCS=1 caps esbuild's native Go binary, which sizes itself to reported CPU
# cores — only matters if a build ever runs inside the container (launcher passes
# --skip-build in normal operation), but cheap insurance against another silent OOM.
ENV PINKACORD_PS_PORT=8000 \
    PINKACORD_ADMIN_PORT=8001 \
    PINKACORD_ADMIN_BIND=0.0.0.0 \
    PINKACORD_LOW_MEMORY=1 \
    MALLOC_ARENA_MAX=2 \
    UV_THREADPOOL_SIZE=2 \
    GOMAXPROCS=1 \
    NODE_OPTIONS="--max-old-space-size=320 --max-semi-space-size=2"
EXPOSE 8000 8001

# Health check hits the PS server's /health endpoint (works in both normal and PS_ONLY modes).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PINKACORD_PS_PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tools/launcher.js is PID 1. It wires SIGTERM/SIGINT to both child processes.
ENTRYPOINT ["node", "tools/launcher.js"]
