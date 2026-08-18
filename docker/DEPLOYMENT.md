# ngdpbase Deployment Guide

Guide for deploying ngdpbase to various environments.

> __For headless / containerized deploys__ (Docker, Kubernetes), also read [`HEADLESS-DEPLOYMENT-NOTES.md`](./HEADLESS-DEPLOYMENT-NOTES.md). It captures gotchas — anchor Organization JSON-LD, theme/front-page/page-provider config, addons-path array form, Alpine `ndots:5` DNS, `npm ci --omit=dev` + husky, addon UUID validation — that aren't obvious from the default config alone.

## Published Image

ngdpbase publishes a container image to `ghcr.io/jwilleke/ngdpbase:<version>` on every tagged release. The publish is automated by `.github/workflows/docker-build.yml`, which builds from `docker/Dockerfile`, runs smoke tests, and runs a Trivy CVE scan against the resulting image. Tags published per release: `<major>.<minor>.<patch>`, `<major>.<minor>`, `<major>`, and `latest` (default branch only).

This image is the single canonical container artifact for ngdpbase. It's intended for:

- __Container deployments__ — `docker run`, `docker-compose`, Kubernetes manifests pulling the image directly.
- __Downstream domain-addon images__ that layer on top using `FROM ghcr.io/jwilleke/ngdpbase:<version>` and add their own addon code (e.g. [`jwilleke/geohazardwatch`](https://github.com/jwilleke/geohazardwatch)). These consumers should add a [Renovate](https://docs.renovatebot.com/) (or Dependabot) annotation so the `FROM` tag auto-bumps when ngdpbase ships a new version — see [`docs/platform/addon-development-guide.md`](../docs/platform/addon-development-guide.md) for the recipe.

It is __not__ consumed by host-deployed instances managed via `./server.sh` and PM2 (jimstest, fairways-base, ngdp-temp-builds, etc.). Those run from a git checkout against Node directly; they pull source on every release, build locally with `npm run build`, and never touch the image. Sister-site working copies do contain `.github/workflows/docker-build.yml` because it's tracked in upstream master, but the workflow only fires in the canonical `jwilleke/ngdpbase` repo — clones never trigger it.

Net effect: exactly __one__ image build per ngdpbase release, regardless of how many sister-site clones exist.

## Table of Contents

- [Local Deployment](#local-deployment)
- [Remote Linux Server](#remote-linux-server)
- [Cloud Deployment](#cloud-deployment)
- [Production Checklist](#production-checklist)

## Local Deployment

Deploy on your local machine (development or testing):

```bash
# Option 1: Pre-built image from GHCR (fastest)
docker run -d --name ngdpbase -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  ghcr.io/jwilleke/ngdpbase:latest

# Option 2: Build from source
./docker-setup.sh
docker-compose up -d

# Access at http://localhost:3000
```

See [DOCKER.md - Pre-built Image from GHCR](DOCKER.md#pre-built-image-from-ghcr) for available tags and update instructions. See [DOCKER.md](DOCKER.md) for the full Docker usage guide.

## Remote Linux Server

Deploy to a remote Linux server via SSH.

### Prerequisites

__On your local machine:__

- SSH access to remote server
- Git (recommended for deployment)

__On remote server:__

- Docker and Docker Compose installed
- Git installed
- SSH access (key-based authentication recommended)
- Open port for web access (default: 3000)

### Quick Deployment

```bash
# Set server details
export REMOTE_USER="your-username"
export REMOTE_HOST="your-server.com"
export REMOTE_PATH="~/ngdpbase"

# Deploy
./deploy-remote.sh
```

The script will:

1. Test SSH connection
2. Verify Docker installation
3. Copy files to remote server (rsync or git)
4. Run setup and configure environment
5. Start Docker containers
6. Display access URL

### Manual Deployment (Recommended: Git-Based)

#### Fresh/Clean Deployment

For a brand new installation or to start over:

```bash
# 1. SSH to server
ssh root@192.168.68.71  # or your server

# 2. Choose deployment location and clean if needed
cd /opt/dosckers  # or your preferred location
rm -rf ngdpbase/   # if starting fresh
mkdir -p ngdpbase
cd ngdpbase

# 3. Clone the repository (note the trailing dot to clone into current dir)
git clone https://github.com/jwilleke/ngdpbase.git .

# 4. Create runtime directories (NOT in repo, created on deployment)
mkdir -p pages data logs sessions search-index work

# 5. Configure environment
cd docker
cp .env.example .env
# Optional: Edit .env for custom UID, GID, or ports
vim .env

# 6. Build and start
docker-compose up -d --build

# 7. Verify deployment
docker-compose ps
docker-compose logs -f ngdpbase

# 8. Test access
curl http://localhost:3000
# Or from another machine: curl http://192.168.68.71:3000
```

__Important directories:__

- `required-pages/` - System pages (IN REPO - automatically cloned)
- `pages/` - User wiki content (created at runtime, persisted across restarts)
- `data/` - Attachments, users, versions (created at runtime)
- `logs/` - Application logs (created at runtime)
- `sessions/` - User sessions (created at runtime)

#### Update Existing Deployment

To update code on an already-deployed server:

```bash
ssh user@server
cd /opt/dosckers/ngdpbase
git pull origin master
cd docker
docker-compose down
docker-compose up -d --build
docker-compose logs -f ngdpbase
```

__Note:__ Updates preserve your `pages/`, `data/`, `logs/`, and `sessions/` directories.

### Deployment Methods

#### Method 1: Git Clone/Pull (Recommended)

Uses git to deploy from repository:

```bash
DEPLOY_METHOD=git ./deploy-remote.sh
```

__Pros:__

- Version controlled on server
- Easy rollbacks and updates
- Multiple servers can pull from same repo
- Ensures `required-pages/` system directory is present
- Cleaner deployment process

__Cons:__

- Requires git repository
- Server needs network access to git remote

__Important:__ The `required-pages/` directory is __required__ and is part of the repository. It contains system pages like "Everything We Know About You", "LeftMenu", etc. Git-based deployment ensures this directory is present.

#### Method 2: rsync (Alternative)

Copies files directly from local to remote:

```bash
DEPLOY_METHOD=rsync ./deploy-remote.sh
```

__Pros:__

- Fast for updates
- No need for git repository on server
- Excludes development files automatically

__Cons:__

- Requires rsync on both machines
- Doesn't track version history on server
- Must ensure `required-pages/` is copied

### Environment Configuration

The deployment script automatically creates `.env` with server's UID/GID.

To customize before deployment, edit `.env.example` or set environment variables:

```bash
export HOST_PORT=8080
export NODE_ENV=production
./deploy-remote.sh
```

### Post-Deployment

#### Verify Deployment

```bash
# Check container status
ssh user@server "cd ~/ngdpbase && docker-compose ps"

# View logs
ssh user@server "cd ~/ngdpbase && docker-compose logs -f"

# Test access
curl http://your-server:3000
```

#### Update Deployment

To update an existing deployment:

```bash
# Re-run deployment script (will sync changes)
./deploy-remote.sh

# Or manually on server
ssh user@server
cd ~/ngdpbase
git pull  # if using git method
docker-compose down
docker-compose up -d --build
```

## Cloud Deployment

### AWS EC2

```bash
# 1. Launch EC2 instance (Ubuntu 22.04 recommended)
# 2. Install Docker
ssh ubuntu@ec2-instance
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

# 3. Deploy
exit
export REMOTE_USER=ubuntu
export REMOTE_HOST=<ec2-public-ip>
./deploy-remote.sh

# 4. Configure security group
# Allow inbound TCP port 3000
```

### Google Cloud Platform (GCE)

```bash
# 1. Create Compute Engine instance
# 2. Install Docker
gcloud compute ssh instance-name --command="curl -fsSL https://get.docker.com | sh"

# 3. Deploy
export REMOTE_USER=$(whoami)
export REMOTE_HOST=$(gcloud compute instances describe instance-name --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
./deploy-remote.sh

# 4. Configure firewall
gcloud compute firewall-rules create ngdpbase --allow tcp:3000
```

### DigitalOcean Droplet

```bash
# 1. Create Droplet with Docker pre-installed (Docker Marketplace image)
# 2. Deploy
export REMOTE_USER=root
export REMOTE_HOST=<droplet-ip>
./deploy-remote.sh
```

### Azure VM

```bash
# 1. Create Ubuntu VM
# 2. Install Docker
az vm run-command invoke \
  --resource-group myResourceGroup \
  --name myVM \
  --command-id RunShellScript \
  --scripts "curl -fsSL https://get.docker.com | sh"

# 3. Deploy
export REMOTE_USER=azureuser
export REMOTE_HOST=<vm-public-ip>
./deploy-remote.sh

# 4. Open port in Network Security Group
az network nsg rule create \
  --resource-group myResourceGroup \
  --nsg-name myNetworkSecurityGroup \
  --name allow-ngdpbase \
  --priority 1000 \
  --destination-port-ranges 3000
```

## Production Checklist

Before deploying to production:

### Security

- [ ] Change `ngdpbase.session.secret` to a secure random value
- [ ] Set `ngdpbase.session.secure` to `true` (requires HTTPS)
- [ ] Configure firewall (only allow necessary ports)
- [ ] Set up SSH key authentication (disable password auth)
- [ ] Keep `ngdpbase.translator-reader.allow-html` as `false`
- [ ] Review user permissions and access control

### Configuration

- [ ] Set `ngdpbase.server.host` to `0.0.0.0` in Docker
- [ ] Configure `ngdpbase.base-url` with your actual domain
- [ ] Set appropriate `NODE_ENV=production`
- [ ] Configure logging level (`ngdpbase.logging.level`)
- [ ] Review and customize all ConfigurationManager settings

### Infrastructure

- [ ] Set up reverse proxy (nginx, traefik, caddy) for HTTPS
- [ ] Configure domain name and DNS
- [ ] Set up SSL/TLS certificates (Let's Encrypt recommended)
- [ ] Configure automated backups for volumes
- [ ] Set up monitoring and alerting
- [ ] Configure log rotation

### Reverse Proxy Setup (nginx example)

```nginx
server {
    listen 80;
    server_name wiki.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name wiki.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/wiki.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wiki.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Backup Strategy

```bash
# Automated backup script (example)
#!/bin/bash
BACKUP_DIR="/backups/ngdpbase"
DATE=$(date +%Y%m%d_%H%M%S)

docker-compose exec -T ngdpbase tar czf - /app/pages /app/data \
  > "$BACKUP_DIR/ngdpbase_backup_$DATE.tar.gz"

# Keep last 7 days
find "$BACKUP_DIR" -name "ngdpbase_backup_*.tar.gz" -mtime +7 -delete
```

### Monitoring

Set up monitoring for:

- Container health status
- Disk usage (pages, data, logs directories)
- Memory and CPU usage
- Response times
- Error logs

### Updates and Maintenance

```bash
# Update deployment
./deploy-remote.sh

# Or manually
ssh user@server
cd ~/ngdpbase
git pull
docker-compose pull
docker-compose up -d --build

# Backup before updates
docker-compose exec ngdpbase tar czf /tmp/backup.tar.gz /app/pages /app/data
docker cp ngdpbase:/tmp/backup.tar.gz ./backup_$(date +%Y%m%d).tar.gz
```

## Troubleshooting

### Deployment Script Issues

__Cannot connect via SSH:__

```bash
# Test SSH manually
ssh -v user@host

# Check SSH config
cat ~/.ssh/config

# Use specific key
ssh -i ~/.ssh/id_rsa user@host
```

__rsync not found:__

```bash
# Install rsync on macOS
brew install rsync

# Install on Linux
sudo apt-get install rsync
```

__Docker not found on remote:__

```bash
# Install Docker on remote server
ssh user@server
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### Container Issues

__Container won't start:__

```bash
# Check logs
docker-compose logs -f

# Check container status
docker-compose ps

# Rebuild
docker-compose down
docker-compose up -d --build
```

__Permission errors:__

```bash
# Check UID/GID in .env
cat .env | grep -E "UID|GID"

# Fix ownership
sudo chown -R $(id -u):$(id -g) pages data logs sessions
```

### Firewall Issues

__Can't access from outside:__

```bash
# Check if port is open locally
curl http://localhost:3000

# Check firewall on server
sudo ufw status
sudo ufw allow 3000/tcp

# Check cloud firewall/security groups
```

## References

- [Docker Documentation](DOCKER.md)
- [ConfigurationManager Documentation](docs/managers/ConfigurationManager-Documentation.md)
- [Docker Official Docs](https://docs.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)
