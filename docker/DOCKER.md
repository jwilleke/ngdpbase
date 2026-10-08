# Docker Deployment Guide for ngdpbase

This guide explains how to run ngdpbase in Docker with proper ConfigurationManager awareness.

It is the detail for method 2 in [docs/installation/Implementation.md](../docs/installation/Implementation.md), the lead document on the four ways to run ngdpbase.

## Table of Contents

- [Pre-built Image from GHCR](#pre-built-image-from-ghcr)
- [Quick Start](#quick-start)
- [Headless Installation](#headless-installation-automated-deployments)
- [Configuration Overview](#configuration-overview)
- [Building the Image](#building-the-image)
- [Running with Docker](#running-with-docker)
- [Running with Docker Compose](#running-with-docker-compose)
- [Configuration Management](#configuration-management)
- [Volume Mounts](#volume-mounts)
- [Environment Variables](#environment-variables)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Pre-built Image from GHCR

The fastest way to run ngdpbase is to pull the pre-built image from GitHub Container Registry. No cloning or building required.

### Available Tags

| Tag | Description |
| --- | --- |
| `ghcr.io/jwilleke/ngdpbase:latest` | Latest release from the default branch |
| `ghcr.io/jwilleke/ngdpbase:1.5.4` | Specific version (e.g., 1.5.4) |
| `ghcr.io/jwilleke/ngdpbase:1.5` | Latest patch in the 1.5.x series |
| `ghcr.io/jwilleke/ngdpbase:1` | Latest minor/patch in the 1.x.x series |

### Browse Available Versions

View all published versions at: <https://github.com/jwilleke/ngdpbase/pkgs/container/ngdpbase>

### Pull and Run

```bash
# Pull the latest image
docker pull ghcr.io/jwilleke/ngdpbase:latest

# Run with persistent data
docker run -d \
  --name ngdpbase \
  -p 3000:3000 \
  -e NGDPBASE_ADMIN_PASSWORD=choose-a-password \
  -v $(pwd)/data:/app/data \
  ghcr.io/jwilleke/ngdpbase:latest

# Access the wiki
open http://localhost:3000
```

### Pull and Run with Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  ngdpbase:
    image: ghcr.io/jwilleke/ngdpbase:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

Then run:

```bash
docker-compose up -d
```

### Verify the Image

```bash
# Check image details
docker inspect ghcr.io/jwilleke/ngdpbase:latest --format '{{.Config.Labels}}'

# Check the version inside the container
docker run --rm ghcr.io/jwilleke/ngdpbase:latest node -e "console.log(require('./package.json').version)"
```

### Updating to a New Version

```bash
# Pull the new version
docker pull ghcr.io/jwilleke/ngdpbase:latest

# Recreate the container (data persists in the volume)
docker stop ngdpbase && docker rm ngdpbase
docker run -d \
  --name ngdpbase \
  -p 3000:3000 \
  -e NGDPBASE_ADMIN_PASSWORD=choose-a-password \
  -v $(pwd)/data:/app/data \
  ghcr.io/jwilleke/ngdpbase:latest

# Or with Docker Compose
docker-compose pull
docker-compose up -d
```

## Quick Start

### Using Setup Script (Easiest)

```bash
# 1. Clone the repository
git clone <repository-url>
cd ngdpbase

# 2. Run the automated setup script
./docker/docker-setup.sh

# 3. Start the application
cd docker
docker-compose up -d

# 4. Access the wiki
open http://localhost:3000
```

The `docker-setup.sh` script automatically:

- Creates required directories
- Configures `docker/.env` with your current user's ids as `PUID`/`PGID` (1000:1000 when run as root)
- Optionally creates production config
- Validates Docker installation

### Using Docker Compose (Manual Setup)

```bash
# 1. Clone the repository
git clone <repository-url>
cd ngdpbase

# 2. Create required directories
mkdir -p pages data logs sessions

# 3. Configure environment (port and user permissions)
cp docker/.env.example docker/.env

# Set the run-as user (#1693) — required; 1000:1000 is the standard default
echo "PUID=$(id -u)" >> docker/.env
echo "PGID=$(id -g)" >> docker/.env

# Optional: Change port if 3000 is in use
# Edit docker/.env and set HOST_PORT=8080

# 4. (Optional) Create instance configuration
# Instance configs are created automatically during installation wizard
# Or manually create in data/config/app-custom-config.json

# 5. Start the application
cd docker
docker-compose up -d

# 6. Access the wiki
open http://localhost:3000
```

### Using Docker CLI

```bash
# Build the image
docker build -t ngdpbase .

# Run the container (single data volume)
docker run -d \
  --name ngdpbase \
  -p 3000:3000 \
  -e NGDPBASE_ADMIN_PASSWORD=choose-a-password \
  -v $(pwd)/data:/app/data \
  ngdpbase

# Access the wiki
open http://localhost:3000
```

## Headless Installation (Automated Deployments)

For Docker/Kubernetes deployments that need to skip the interactive installation wizard, use headless installation mode.

### Enabling Headless Mode

Set `HEADLESS_INSTALL=true` environment variable:

```bash
# Docker Compose
HEADLESS_INSTALL=true docker-compose up -d

# Or in .env file
echo "HEADLESS_INSTALL=true" >> docker/.env
docker-compose up -d

# Docker CLI
docker run -d \
  --name ngdpbase \
  -p 3000:3000 \
  -e HEADLESS_INSTALL=true \
  -e NGDPBASE_ADMIN_PASSWORD=choose-a-password \
  -v $(pwd)/data:/app/data \
  ngdpbase
```

### What Headless Install Does

When `HEADLESS_INSTALL=true` is set:

- Copies required startup pages to `data/pages/` automatically
- Copies example configs to `data/config/` automatically
- Creates `.install-complete` marker file
- Creates the `admin` account with the password from `NGDPBASE_ADMIN_PASSWORD`
- App is immediately ready for use - no wizard required

### Security Note

The `admin` account is created on first start with the default password `admin123`. __Change it immediately after first login__ — the console warns until you do. The examples above pass `NGDPBASE_ADMIN_PASSWORD` so the account never holds the published default; that is optional, and works because `ngdpbase.user.security.defaultpassword` can be pointed at `"$NGDPBASE_ADMIN_PASSWORD"` in `app-custom-config.json`.

### Pre-configuring Settings (Optional)

You can pre-configure settings via environment variables or a mounted config file:

```bash
# Using environment variables
docker run -d \
  --name ngdpbase \
  -p 3000:3000 \
  -e HEADLESS_INSTALL=true \
  -e NGDPBASE_APP_NAME="My Company Wiki" \
  -e NGDPBASE_BASE_URL="https://wiki.example.com" \
  -e NGDPBASE_SESSION_SECRET="your-secure-secret-here" \
  -v $(pwd)/data:/app/data \
  ngdpbase

# Or mount a pre-configured config file
docker run -d \
  --name ngdpbase \
  -p 3000:3000 \
  -e HEADLESS_INSTALL=true \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/my-config.json:/app/data/config/app-custom-config.json \
  ngdpbase
```

### Environment Variables for Headless Mode

| Variable | Description | Default |
| --- | --- | --- |
| `HEADLESS_INSTALL` | Enable headless mode | `false` |
| `NGDPBASE_APP_NAME` | Application display name | `ngdpbase` |
| `NGDPBASE_BASE_URL` | Base URL for the wiki | (empty) |
| `NGDPBASE_SESSION_SECRET` | Session cookie signing key | generated into `<data volume>/.env` on first boot if unset (#1194) |
| `NGDPBASE_HOST` | Server bind address | `localhost` |
| `NGDPBASE_PORT` | Server port | `3000` |
| `INSTANCE_DATA_FOLDER` | Data directory path | `./data` |

## Configuration Overview

ngdpbase uses the __ConfigurationManager__ which implements a two-tier configuration system:

1. `config/app-default-config.json` - Base defaults (read-only, in Docker image)
2. `INSTANCE_DATA_FOLDER/config/{INSTANCE_CONFIG_FILE}` - Instance overrides (default: `app-custom-config.json`)

Instance configuration files are stored in `data/config/` and are created automatically during the installation wizard, or can be mounted manually.

Environment variables:

- `INSTANCE_DATA_FOLDER` - Base path for instance data (default: `/app/data`)
- `INSTANCE_CONFIG_FILE` - Config filename to load (default: `app-custom-config.json`)

## Building the Image

### Basic Build

```bash
docker build -t ngdpbase .
```

### Build with Custom Tag

```bash
docker build -t ngdpbase:1.3.2 .
docker build -t mycompany/ngdpbase:latest .
```

### Multi-stage Build for Production

The Dockerfile is optimized for production with:

- Node.js 20 Alpine Linux (minimal size)
- Production-only dependencies
- Non-root user execution
- Health checks
- Proper volume configuration

## Running with Docker

### Basic Run

```bash
docker run -d \
  --name ngdpbase \
  -p 3000:3000 \
  ngdpbase
```

### Run with Different Port

If port 3000 is already in use:

```bash
# Use port 8080 instead
docker run -d \
  --name ngdpbase \
  -p 8080:3000 \
  ngdpbase

# Let Docker auto-assign a port
docker run -d \
  --name ngdpbase \
  -p 3000 \
  ngdpbase

# Find the assigned port
docker port ngdpbase 3000
```

### Run with Volume Mounts

```bash
# Single data volume (recommended)
docker run -d \
  --name ngdpbase \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  ngdpbase
```

### Run with Custom Configuration

```bash
# Option 1: Mount custom config file
docker run -d \
  --name ngdpbase \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/config/app-custom-config.json:/app/config/app-custom-config.json \
  ngdpbase

# Option 2: Mount entire config directory
docker run -d \
  --name ngdpbase \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/config:/app/config \
  ngdpbase
```

### Run with Different Environment

```bash
# Run in development mode
docker run -d \
  --name ngdpbase-dev \
  -p 3000:3000 \
  -e NODE_ENV=development \
  ngdpbase

# Run in production mode (default)
docker run -d \
  --name ngdpbase-prod \
  -p 3000:3000 \
  -e NODE_ENV=production \
  ngdpbase
```

## Running with Docker Compose

The `docker-compose.yml` file provides a complete deployment configuration.

### Port Configuration

By default, ngdpbase runs on port 3000. If this port is already in use, you have several options:

#### Option 1: Use .env file (Recommended)

```bash
# Copy the example file
cp .env.example .env

# Edit .env and change HOST_PORT
echo "HOST_PORT=8080" > .env

# Start with the new port
docker-compose up -d

# Access at http://localhost:8080
```

#### Option 2: Use environment variable at runtime

```bash
# Specify port when starting
HOST_PORT=8080 docker-compose up -d

# Access at http://localhost:8080
```

#### Option 3: Let Docker auto-assign a port

```bash
# Set empty HOST_PORT to auto-assign
HOST_PORT= docker-compose up -d

# Find the assigned port
docker-compose port ngdpbase 3000
# Output: 0.0.0.0:32768 (example)
```

#### Option 4: Edit docker-compose.yml directly

```yaml
ports:
  - "8080:3000"  # Change 8080 to your desired port
```

### Start Services

```bash
# Start in detached mode
docker-compose up -d

# Start with logs
docker-compose up

# Start and rebuild
docker-compose up -d --build

# Start with custom port
HOST_PORT=8080 docker-compose up -d
```

### Stop Services

```bash
# Stop containers
docker-compose stop

# Stop and remove containers
docker-compose down

# Stop, remove containers, and remove volumes
docker-compose down -v
```

### View Logs

```bash
# View logs
docker-compose logs

# Follow logs
docker-compose logs -f

# View last 100 lines
docker-compose logs --tail=100
```

### Manage Services

```bash
# Restart service
docker-compose restart

# View running services
docker-compose ps

# Execute command in container
docker-compose exec ngdpbase sh
```

## Configuration Management

### Initial Setup (Installation Wizard)

On first run, the installation wizard handles all setup automatically:

- Creates admin user account
- Copies example configs to `data/config/`
- Creates required directories
- Marks installation complete (`.install-complete` marker)

Simply start the container and access `http://localhost:3000` to complete the wizard.

### Customizing Configuration (After Setup)

After initial setup, edit `data/config/app-custom-config.json` to customize settings:

```json
{
  "ngdpbase.base-url": "https://your-domain.com",
  "ngdpbase.application-name": "My Wiki",
  "ngdpbase.session.secret": "your-secure-random-secret",
  "ngdpbase.session.secure": true
}
```

Then restart the container:

```bash
docker-compose restart
```

### Key Configuration Properties

#### Server Configuration

```json
{
  "ngdpbase.server.host": "0.0.0.0",
  "ngdpbase.server.port": 3000
}
```

__Important:__ Use `0.0.0.0` for the host in Docker to bind to all interfaces.

#### Base URL

```json
{
  "ngdpbase.base-url": "https://your-domain.com"
}
```

Set this to your actual domain or IP address.

#### Session Security

```json
{
  "ngdpbase.session.secret": "CHANGE-THIS-TO-A-SECURE-RANDOM-STRING",
  "ngdpbase.session.secure": true,
  "ngdpbase.session.http-only": true,
  "ngdpbase.session.max-age": 86400000
}
```

__Generate a secure secret:__

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Directories

All instance data is consolidated under `./data/`:

```json
{
  "ngdpbase.page.provider.filesystem.storagedir": "./data/pages",
  "ngdpbase.user.provider.storagedir": "./data/users",
  "ngdpbase.attachment.provider.basic.storagedir": "./data/attachments",
  "ngdpbase.logging.dir": "./data/logs",
  "ngdpbase.search.provider.lunr.indexdir": "./data/search-index",
  "ngdpbase.backup.directory": "./data/backups"
}
```

This enables a single Docker volume mount for all persistent data.

## Volume Mounts

All instance data is consolidated under a __single volume mount__:

| Host Path | Container Path | Purpose |
| ----------- | --------------- | --------- |
| `./data` | `/app/data` | All instance data |
| `./required-pages` | `/app/required-pages` | System templates (read-only) |
| `./config` | `/app/config` | Configuration overrides (optional) |

The `./data` directory contains all persistent data:

| Subdirectory | ConfigurationManager Property | Purpose |
| -------------- | ------------------------------ | --------- |
| `data/pages/` | `ngdpbase.page.provider.filesystem.storagedir` | Wiki content |
| `data/users/` | `ngdpbase.user.provider.storagedir` | User accounts |
| `data/attachments/` | `ngdpbase.attachment.provider.basic.storagedir` | File attachments |
| `data/logs/` | `ngdpbase.logging.dir` | Application logs |
| `data/search-index/` | `ngdpbase.search.provider.lunr.indexdir` | Search index |
| `data/backups/` | `ngdpbase.backup.directory` | Backup files |
| `data/sessions/` | (session file store) | User sessions |
| `data/versions/` | (versioning provider) | Page versions |

### Creating Host Directories

__Auto-Creation Behavior:__

- Docker Compose will automatically create the `data/` directory
- Subdirectories are created automatically by the application
- __Best practice:__ Pre-create `data/` and set `PUID`/`PGID` before first run

__Recommended setup:__

```bash
# Create the data directory
mkdir -p data

# Set PUID/PGID (required)
# See "Run-as user (PUID/PGID)" below
```

### Run-as user (PUID/PGID)

`PUID` and `PGID` are __required__: the server refuses to start without them, and it never runs as root ([#1693](https://github.com/jwilleke/ngdpbase/issues/1693)). The standard default is `1000:1000`, which `docker/.env.example` and `docker-compose.yml` ship. The full rule is in [the bootstrap guide](../docs/guides/bootstrap-developer-guide.md#run-as-user-puidpgid).

- __Started as root__ (plain `docker run`, the shipped Compose file): the server gives the data folder to `PUID:PGID` if it isn't already theirs, switches to that user, then starts.
- __Started directly as the user__ (Compose `user: "1000:1000"`, Kubernetes `runAsUser`): `PUID`/`PGID` must be the same ids, or it refuses and says what to set.

```bash
# Match your host user (macOS typically 501:20)
echo "PUID=$(id -u)" >> docker/.env
echo "PGID=$(id -g)" >> docker/.env
docker compose up -d
```

On an NFS share that maps every file to one owner, use that owner's ids (for example `PUID=977`, `PGID=988`). Set them in the container's environment rather than in the volume's `.env`: a root start may not be able to read that file.

### Using Named Volumes

For better portability, use Docker named volumes:

```yaml
volumes:
  ngdpbase-data:

services:
  ngdpbase:
    volumes:
      - ngdpbase-data:/app/data
```

### Backing Up Volumes

```bash
# Backup all data
docker run --rm \
  -v ngdpbase_data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/ngdpbase-data-backup.tar.gz -C /data .

# Restore all data
docker run --rm \
  -v ngdpbase_data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar xzf /backup/ngdpbase-data-backup.tar.gz -C /data
```

## Environment Variables

Environment variables have the __highest priority__ in the configuration system, overriding both default and custom config file values.

### Configuration Override Variables

| Environment Variable | Config Property | Description |
| --- | --- | --- |
| `NGDPBASE_BASE_URL` | `ngdpbase.base-url` | Base URL for the wiki |
| `NGDPBASE_HOSTNAME` | `ngdpbase.hostname` | Server hostname |
| `NGDPBASE_HOST` | `ngdpbase.server.host` | Server bind address |
| `NGDPBASE_PORT` | `ngdpbase.server.port` | Server port |
| `NGDPBASE_SESSION_SECRET` | `ngdpbase.session.secret` | Session encryption key |
| `NGDPBASE_APP_NAME` | `ngdpbase.application-name` | Application display name |

### Instance Management Variables

| Environment Variable | Description | Default |
| --- | --- | --- |
| `NODE_ENV` | Environment (`production`, `development`, `test`) | `production` |
| `INSTANCE_DATA_FOLDER` | Base path for instance data | `/app/data` |
| `INSTANCE_CONFIG_FILE` | Config filename to load | `app-custom-config.json` |
| `HEADLESS_INSTALL` | Skip interactive wizard | `true` |

### Example: Override config with env vars

```bash
docker run -d \
  --name ngdpbase \
  -p 3000:3000 \
  -e NGDPBASE_APP_NAME="My Company Wiki" \
  -e NGDPBASE_BASE_URL="https://wiki.example.com" \
  -e NGDPBASE_SESSION_SECRET="your-secure-secret-here" \
  -v $(pwd)/data:/app/data \
  ghcr.io/jwilleke/ngdpbase:latest
```

For full details on the configuration priority order, all supported variables, and usage patterns, see [Installation System - Environment Variable Overrides](../docs/INSTALLATION/INSTALLATION-SYSTEM.md#environment-variable-overrides).

## Security Considerations

### Production Checklist

- [ ] Change `ngdpbase.session.secret` to a secure random string
- [ ] Set `ngdpbase.session.secure` to `true` (requires HTTPS)
- [ ] Set `ngdpbase.server.host` to `0.0.0.0` for Docker
- [ ] Set `ngdpbase.base-url` to your actual domain
- [ ] Keep `ngdpbase.translator-reader.allow-html` as `false`
- [ ] Enable HTTPS with reverse proxy (nginx, traefik, etc.)
- [ ] Use strong passwords for user accounts
- [ ] Regularly backup volumes
- [ ] Keep Docker image updated

### Using with Reverse Proxy

Example nginx configuration:

```nginx
server {
    listen 80;
    server_name wiki.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name wiki.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Update `data/config/app-custom-config.json`:

```json
{
  "ngdpbase.base-url": "https://wiki.example.com",
  "ngdpbase.session.secure": true
}
```

## Troubleshooting

### Container Won't Start

Check logs:

```bash
docker-compose logs -f
docker logs ngdpbase
```

Common issues:

- Port already in use: Change port mapping in `docker-compose.yml`
- Permission errors: Ensure host directories are writable
- Configuration errors: Validate JSON syntax in config files

### Can't Access Wiki

Step 1. Check container is running:

```bash
docker-compose ps
```

Step 2. Check port mapping:

```bash
docker port ngdpbase
```

Step 3. Test from within container:

```bash
docker-compose exec ngdpbase wget -O- http://localhost:3000
```

Step 4. Check firewall rules on host

### Configuration Not Loading

Step A Check NODE_ENV:

```bash
docker-compose exec ngdpbase printenv NODE_ENV
```

Step B Verify config file exists:

```bash
docker-compose exec ngdpbase ls -la data/config/
```

Step C Check config file syntax:

```bash
docker-compose exec ngdpbase cat data/config/app-custom-config.json | node -e "console.log(JSON.parse(require('fs').readFileSync(0)))"
```

### Volume Permissions

If you encounter permission errors:

```bash
# Check current user ID
id -u
id -g

# Fix ownership (if needed)
sudo chown -R 1000:1000 pages data logs sessions

# Or run container with specific user
docker run --user 1000:1000 ngdpbase
```

### Health Check Failing

Check health status:

```bash
docker inspect --format='{{json .State.Health}}' ngdpbase | jq
```

Test manually:

```bash
docker-compose exec ngdpbase wget -O- http://localhost:3000/
```

## Advanced Topics

### Building Multi-Architecture Images

```bash
# Enable buildx
docker buildx create --use

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  -t mycompany/ngdpbase:latest \
  --push .
```

### Using Docker Secrets

For sensitive configuration:

```yaml
services:
  ngdpbase:
    secrets:
      - session_secret

secrets:
  session_secret:
    file: ./secrets/session_secret.txt
```

### Resource Limits

Limit CPU and memory:

```yaml
services:
  ngdpbase:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Monitoring

Add monitoring with Prometheus:

```yaml
services:
  ngdpbase:
    labels:
      - "prometheus.scrape=true"
      - "prometheus.port=3000"
```

## References

- [ConfigurationManager Documentation](docs/managers/ConfigurationManager-Documentation.md)
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
