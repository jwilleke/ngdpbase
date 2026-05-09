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

# Install runtime dependencies only (for bcrypt native bindings)
# Note: g++ is needed at runtime for node-gyp if bcrypt needs recompilation
RUN apk add --no-cache libstdc++

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
    CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit((r.statusCode === 200 || r.statusCode === 302) ? 0 : 1))"

# Volume mounts for persistent data
VOLUME ["/app/data"]

# Start command - direct node execution (no PM2)
# PM2 is removed for K8s compatibility - K8s handles process management
CMD ["node", "dist/src/app.js"]

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
