# ngdpbase Deployment with Traefik and Authelia

This guide explains how to deploy ngdpbase behind Traefik reverse proxy with Authelia authentication.

## Prerequisites

- Traefik v3.5+ running on 192.168.68.71 with:
  - Docker provider enabled
  - External network `traefik_net` created
  - Let's Encrypt certificate resolver configured
- Authelia running and accessible at `auth.deby.nerdsbythehour.com`
- Docker and Docker Compose installed on the deployment host
- DNS record pointing your domain to the Traefik server (192.168.68.71)

## Setup Instructions

### 1. Create External Network

If you haven't already created the `traefik_net` network on your deployment host, run:

```bash
docker network create traefik_net
```

__Note:__ This network should be the same network that Traefik is using on 192.168.68.71.

### 2. Configure Environment

Copy the example environment file:

```bash
cd docker
cp .env.example .env
```

Edit `.env` and set your domain (see "Traefik Reverse Proxy" section):

```bash
# Example: wiki.deby.nerdsbythehour.com
NGDPBASE_DOMAIN=wiki.example.com

# Set user permissions (optional)
UID=1000
GID=1000
```

### 3. Configure Authelia Access Control

On your Authelia server (192.168.68.71), add ngdpbase to the access control configuration.

Edit `/opt/traefik/authelia/config/configuration.yml` and add:

```yaml
access_control:
  default_policy: deny
  rules:
    # ... your existing rules ...

    # ngdpbase access
    - domain: "wiki.example.com"  # Replace with your domain
      policy: two_factor  # or 'one_factor' for less security
      # Optional: Restrict to specific users/groups
      # subject:
      #   - "user:admin"
      #   - "group:admins"
```

Restart Authelia:

```bash
cd /opt/traefik
docker-compose -f authelia-compose.yml restart
```

### 4. Deploy ngdpbase

From the docker directory:

```bash
cd docker

# Build and start the container
docker-compose -f docker-compose-traefik.yml up -d

# Check logs
docker-compose -f docker-compose-traefik.yml logs -f
```

### 5. Verify Deployment

1. Visit your domain (e.g., `https://wiki.example.com`)
2. You should be redirected to Authelia login
3. After authentication, you'll be redirected to ngdpbase
4. Verify SSL certificate is working (Let's Encrypt)

## Architecture

```text
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────────────────────────┐
│  Traefik (192.168.68.71)        │
│  - SSL Termination              │
│  - Routing                      │
└──────┬─────────────┬────────────┘
       │             │
       │ Forward     │ Auth Request
       │             ▼
       │     ┌──────────────┐
       │     │   Authelia   │
       │     │  (auth.deby) │
       │     └──────────────┘
       │
       ▼
┌──────────────────┐
│     ngdpbase      │
│   (Container)    │
│   Port 3000      │
└──────────────────┘
```

## How It Works

1. __HTTP to HTTPS Redirect__: Traefik automatically redirects HTTP to HTTPS
2. __SSL/TLS__: Traefik handles SSL termination using Let's Encrypt certificates
3. __Authentication__: Traefik forwards authentication requests to Authelia
4. __Routing__: After authentication, Traefik forwards requests to ngdpbase container
5. __Session Management__: ngdpbase handles its own session management after initial auth

## Configuration Details

### Traefik Labels Explained

```yaml
# Enable Traefik routing
traefik.enable=true

# HTTP Router (redirect to HTTPS)
traefik.http.routers.ngdpbase-http.rule=Host(`wiki.example.com`)
traefik.http.routers.ngdpbase-http.entrypoints=web
traefik.http.routers.ngdpbase-http.middlewares=ngdpbase-redirect-https

# HTTPS Router with Authelia protection
traefik.http.routers.ngdpbase.rule=Host(`wiki.example.com`)
traefik.http.routers.ngdpbase.entrypoints=websecure
traefik.http.routers.ngdpbase.tls=true
traefik.http.routers.ngdpbase.tls.certresolver=letsencrypt
traefik.http.routers.ngdpbase.middlewares=authelia@docker

# Service definition (container port)
traefik.http.services.ngdpbase.loadbalancer.server.port=3000
```

### Authelia Middleware

The `authelia@docker` middleware:

- Intercepts all requests before they reach ngdpbase
- Redirects unauthenticated users to Authelia login
- Validates authentication tokens
- Passes authenticated requests with user headers

## Customization

### Skip Authelia for Specific Paths

If you want to bypass authentication for certain paths (e.g., public pages), modify the labels in `docker-compose-traefik.yml`:

```yaml
# Add a second router without Authelia for public paths
- "traefik.http.routers.ngdpbase-public.rule=Host(`wiki.example.com`) && PathPrefix(`/public`)"
- "traefik.http.routers.ngdpbase-public.entrypoints=websecure"
- "traefik.http.routers.ngdpbase-public.tls=true"
- "traefik.http.routers.ngdpbase-public.tls.certresolver=letsencrypt"
# Note: No Authelia middleware for this router
```

### Custom ngdpbase Configuration

Create `config/app-custom-config.json` with your overrides:

```json
{
  "ngdpbase.server.host": "0.0.0.0",
  "ngdpbase.server.port": 3000,
  "ngdpbase.base-url": "https://wiki.example.com",
  "ngdpbase.session.secret": "your-secure-random-secret-here",
  "ngdpbase.session.secure": true
}
```

Uncomment the volume mount in `docker-compose-traefik.yml`:

```yaml
volumes:
  # ...
  - ../config/app-custom-config.json:/app/config/app-custom-config.json
```

__Note:__ ConfigurationManager loads configuration in two tiers:

- `config/app-default-config.json` (built into image, read-only defaults)
- `config/app-custom-config.json` (your instance overrides)

## Troubleshooting

### Connection Refused

Check if the container is running:

```bash
docker ps | grep ngdpbase
```

Check container logs:

```bash
docker logs ngdpbase
```

### 502 Bad Gateway

1. Verify ngdpbase is healthy:

   ```bash
   docker exec ngdpbase wget -O- http://localhost:3000
   ```

2. Check Traefik can reach the container:

   ```bash
   docker exec traefik ping ngdpbase
   ```

3. Verify both containers are on `traefik_net`:

   ```bash
   docker network inspect traefik_net
   ```

### Authelia Redirect Loop

1. Check Authelia logs on 192.168.68.71:

   ```bash
   docker logs authelia
   ```

2. Verify the domain is in Authelia's access control rules

3. Check that cookies are enabled in your browser

### SSL Certificate Issues

1. Check Traefik logs:

   ```bash
   docker logs traefik
   ```

2. Verify DNS points to 192.168.68.71:

   ```bash
   nslookup wiki.example.com
   ```

3. Check Let's Encrypt rate limits

## Management Commands

```bash
# View logs
docker-compose -f docker-compose-traefik.yml logs -f

# Restart container
docker-compose -f docker-compose-traefik.yml restart

# Stop container
docker-compose -f docker-compose-traefik.yml down

# Update image
docker-compose -f docker-compose-traefik.yml pull
docker-compose -f docker-compose-traefik.yml up -d

# Rebuild image
docker-compose -f docker-compose-traefik.yml build --no-cache
docker-compose -f docker-compose-traefik.yml up -d
```

## Security Considerations

1. __Session Secret__: Change the default session secret in production
2. __User Permissions__: Run container as non-root user (already configured)
3. __Network Isolation__: Container only accessible through Traefik
4. __Authentication__: All access protected by Authelia 2FA
5. __SSL/TLS__: Automatic HTTPS with Let's Encrypt certificates
6. __Security Headers__: Consider adding security headers in Traefik

### Recommended Traefik Security Headers

Add to your Traefik configuration for enhanced security:

```yaml
# In /opt/traefik/config/middlewares.yml
http:
  middlewares:
    security-headers:
      headers:
        frameDeny: true
        contentTypeNosniff: true
        browserXssFilter: true
        referrerPolicy: "strict-origin-when-cross-origin"
```

Then update the ngdpbase router middleware:

```yaml
- "traefik.http.routers.ngdpbase.middlewares=authelia@docker,security-headers@file"
```

## Backup and Maintenance

Important directories to backup (relative to project root, as mounted in docker-compose-traefik.yml):

- `pages/` - Wiki content
- `data/` - Attachments, users, versions, search index
- `logs/` - Application logs
- `sessions/` - Active sessions (optional)
- `config/` - Custom configuration (if mounted separately)

Backup command:

```bash
tar -czf ngdpbase-backup-$(date +%Y%m%d).tar.gz pages/ data/ logs/ config/
```

## Support

For issues:

- ngdpbase: <https://github.com/jwilleke/ngdpbase/issues>
- Traefik: <https://doc.traefik.io/traefik/>
- Authelia: <https://www.authelia.com/>
