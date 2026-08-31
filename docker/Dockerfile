# ngdpbase Docker Image - Multi-Stage Build
# JSPWiki-style wiki with advanced search capabilities
#
# Multi-stage build:
#   Stage 1 (builder): Install all deps, build TypeScript, compile native modules
#   Stage 2 (runtime): Production-only dependencies, optimized for size
#
# Expected image size: ~400-500MB (down from ~2.2GB single-stage)

# Build arguments
ARG NODE_VERSION=24

# =============================================================================
# Stage 1: Builder
# =============================================================================
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files first (for layer caching)
COPY package*.json ./

# Install ALL dependencies (including devDependencies for TypeScript build)
RUN npm ci

# Copy source files
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Prune devDependencies for production
RUN npm prune --omit=dev

# =============================================================================
# Stage 2: Runtime
# =============================================================================
FROM node:${NODE_VERSION}-alpine AS runtime

# Labels for container metadata
LABEL org.opencontainers.image.title="ngdpbase"
LABEL org.opencontainers.image.description="JSPWiki-style wiki with advanced search capabilities"
LABEL org.opencontainers.image.source="https://github.com/jwilleke/ngdpbase"

WORKDIR /app

# Take whatever Alpine has already fixed, rather than waiting on the base image
# to republish (#1143).
#
# Trivy raised 20 alerts against v4.12.1 — 10 OpenSSL CVEs across libcrypto3 and
# libssl3, all fixed in 3.5.8-r0. `node:24-alpine` still ships 3.5.7-r0, so a
# rebuild with --pull does NOT clear them; the fix exists in Alpine's repo and
# nothing was reaching for it.
#
# Deliberately a blanket upgrade rather than pinning the two packages. This
# Dockerfile already carries the lesson from #859/#956 — that chasing a
# vendored tree's lag "means living with whatever CVEs it carries, on someone
# else's release schedule". Naming individual packages here would be the same
# trap in a new place: it fixes this CVE set and silently misses the next one.
# The smoke test (#1142) covers the risk that an upgrade breaks first boot.
RUN apk upgrade --no-cache

# Install runtime dependencies only (for bcrypt native bindings)
# Note: g++ is needed at runtime for node-gyp if bcrypt needs recompilation
RUN apk add --no-cache libstdc++

# Remove npm and npx from the runtime image entirely (#956).
#
# #859 replaced the base image's npm with npm@12 so its bundled dependencies
# would be current. That stopped working as a strategy: npm@12.0.1 — the latest
# release — still bundles `tar 7.5.19` and `brace-expansion 5.0.7`, each exactly
# one patch below the fix (7.5.21 and 5.0.8). Chasing npm's bundle lag means
# living with whatever CVEs its vendored tree carries, on npm's release
# schedule rather than ours.
#
# The runtime does not use npm. CMD is `node dist/src/app.js`, HEALTHCHECK is
# `node -e`, and every dependency is copied pre-installed from the builder
# stage. The `npm:` strings in AddonsManager are a source *label* for addons
# resolved under node_modules, not a shell-out. Nothing in docker-compose, the
# k8s manifests or the deploy scripts execs npm inside the container.
#
# So npm is dead weight that only contributes vulnerable files to scans. Deleting
# it removes this entire class of finding permanently instead of re-triaging it
# every time npm's vendored tree falls behind.
#
# Tradeoff: nothing in THIS image can run npm any more. That covers two flows,
# and the second one is load-bearing (#1001):
#
#   1. `docker exec <container> npm ...` — never a supported flow. The image is
#      a runtime, not a build environment.
#   2. Building `FROM ghcr.io/jwilleke/ngdpbase:<version>` and then running
#      `npm install <addon>` — this IS supported. It is the packaged-addon
#      deployment model documented in
#      docs/platform/deployment/addon-packaged.md, and it is how geohazardwatch
#      is built. #956 broke it, in a patch release, and the break surfaced as a
#      red release build downstream.
#
# Flow 2 is restored by the `devtools` stage below rather than by putting npm
# back here, so the deployed image still carries none of npm's vendored CVEs.
# Derived images build FROM the `-devtools` tag instead.
#
# (The original note here suggested reinstating with `npm install -g npm@12` in
# a derived image. That cannot work — there is no npm left to run it with.)
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
    && rm -rf /root/.npm /root/.npmrc 2>/dev/null || true

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JavaScript
COPY --from=builder /app/dist ./dist

# Copy package.json (needed for module resolution metadata)
COPY --from=builder /app/package.json ./

# Copy views (EJS templates)
COPY --from=builder /app/views ./views

# Copy public assets
COPY --from=builder /app/public ./public

# Copy themes (core CSS variables, default/flatly/fairways/volcano theme dirs).
# Required at runtime — the page header references /themes/core.css and
# /themes/<active>/theme.css. Without this, the runtime falls back to a
# regenerated default.css and any non-default theme returns 404.
COPY --from=builder /app/themes ./themes

# Copy required-pages (system templates)
COPY --from=builder /app/required-pages ./required-pages

# Copy addons (compiled JS, views, public assets, seed pages, node_modules)
COPY --from=builder /app/addons ./addons

# Copy resources (if exists)
COPY --from=builder /app/resources ./resources

# Copy default configuration
COPY --from=builder /app/config/app-default-config.json ./config/

# Create data directories with proper permissions
# All instance-specific data is consolidated under /app/data
# Directory structure:
#   data/
#   ├── pages/        - Wiki content
#   ├── users/        - User accounts
#   ├── attachments/  - File attachments
#   ├── logs/         - Application logs
#   ├── search-index/ - Search index
#   ├── backups/      - Backup files
#   ├── config/       - Instance configuration
#   └── sessions/     - Session files
RUN mkdir -p \
    data/pages \
    data/users \
    data/attachments \
    data/versions \
    data/logs \
    data/search-index \
    data/backups \
    data/config \
    data/sessions && \
    chmod -R 755 /app && \
    chmod -R 777 /app/data

# Note: chmod 777 on /app/data allows any user to write (needed for docker-compose user override)
# This is safe in Docker since the container is isolated

# Expose port (configurable via ngdpbase.server.port)
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV INSTANCE_DATA_FOLDER=/app/data
ENV HEADLESS_INSTALL=true

# Health check
# Accepts both 200 (OK) and 302 (Redirect) as healthy responses
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    # #1079: was `/` accepting 200 OR 302 — so an instance that redirected
# everything, including a misconfigured one, reported healthy. /health/liveness
# returns 200 and nothing else.
CMD node -e "require('http').get('http://localhost:3000/health/liveness', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Volume mounts for persistent data
VOLUME ["/app/data"]

# Start command - direct node execution (no PM2)
# PM2 is removed for K8s compatibility - K8s handles process management
CMD ["node", "dist/src/app.js"]

# =============================================================================
# Stage 3: Devtools — build-capable variant, published as :<version>-devtools
# =============================================================================
#
# Identical to `runtime` in every respect except that npm/npx are present.
# Exists for images built FROM ngdpbase that need to install something into the
# derived layer — the packaged-addon model (#1001). Not for deployment: it
# carries npm's vendored dependency tree, which is the whole thing #956 removed.
#
# Which tag to use:
#
#   ghcr.io/jwilleke/ngdpbase:X.Y.Z            deploy this
#   ghcr.io/jwilleke/ngdpbase:X.Y.Z-devtools   build FROM this
#
# A derived image built FROM `-devtools` inherits npm. If the final artifact is
# going to be deployed, drop npm again in the derived Dockerfile's last stage
# with the same `rm -rf` as the runtime stage above.
#
# npm is copied from `builder` rather than reinstalled, so the version is
# exactly the one the base node image shipped — no network fetch, no separate
# version axis to track.
FROM runtime AS devtools

COPY --from=builder /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm

# The node images ship these as relative symlinks into lib/node_modules; recreate
# them the same way so `npm` and `npx` resolve on PATH.
RUN ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && npm --version

LABEL org.opencontainers.image.title="ngdpbase-devtools"
LABEL org.opencontainers.image.description="ngdpbase with npm retained — for derived builds only, not for deployment"

# =============================================================================
# Configuration and Installation
# =============================================================================
#
# FIRST RUN BEHAVIOR:
# On first access, the installation wizard runs if:
#   - /app/data/.install-complete does not exist
#   - No admin user exists
# The wizard creates config files in /app/data/config/ and marks install complete.
#
# CONFIG FILE LOCATIONS:
# - /app/config/app-default-config.json (in image - base defaults, read-only)
# - /app/data/config/{INSTANCE_CONFIG_FILE} (volume - instance overrides; provided by operator
#   via volume mount or k8s ConfigMap, OR via env-var overrides like NGDPBASE_BASE_URL)
#
# ConfigurationManager loads (two-tier merge):
# 1. config/app-default-config.json (required - in image, read-only)
# 2. INSTANCE_DATA_FOLDER/config/{INSTANCE_CONFIG_FILE} (default: app-custom-config.json)
#
# ENVIRONMENT VARIABLES:
# - INSTANCE_DATA_FOLDER: Base path for instance data (default: /app/data)
# - INSTANCE_CONFIG_FILE: Config filename to load (default: app-custom-config.json)
#
# DEPLOYMENT OPTIONS:
#
# Option 1: Interactive Installation (recommended for first deployment)
#   docker run -p 3000:3000 -v ./data:/app/data ngdpbase
#   # Access http://localhost:3000 and complete installation wizard
#
# Option 2: Mount pre-configured config (skip wizard)
#   docker run -p 3000:3000 \
#     -v ./data:/app/data \
#     -v ./my-config.json:/app/data/config/app-custom-config.json \
#     ngdpbase
#   # NOTE: You must also create admin user and .install-complete marker
#
# Option 3: Use different config file
#   docker run -p 3000:3000 \
#     -e INSTANCE_CONFIG_FILE=app-staging-config.json \
#     -v ./data:/app/data \
#     ngdpbase
#
# Common properties to override:
# - ngdpbase.server.port: Server port (default: 3000)
# - ngdpbase.server.host: Server host (default: 0.0.0.0 for Docker)
# - ngdpbase.application.base-url: Base URL for the wiki
# - ngdpbase.session.secret: Session secret (MUST change in production!)
