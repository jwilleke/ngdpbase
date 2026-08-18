---
title: Server Management
uuid: 8dad9fdc-1d2e-4d4b-aeeb-a95bd1ba6a28
system-category: documentation
user-keywords:
  - server
  - operations
  - deployment
  - troubleshooting
slug: server-management
lastModified: '2025-12-06T06:33:00.000Z'
author: system
---

# Server Management Guide

## Quick Start

### Using the Helper Script (Recommended)

```bash
# Start the server (production mode - default)
./server.sh start

# Start in development mode
./server.sh start dev

# Start in production mode (explicit)
./server.sh start prod

# Stop the server
./server.sh stop

# Restart the server
./server.sh restart

# Check server status and environment
./server.sh status

# Show environment and available configs
./server.sh env

# View logs (default: 50 lines)
./server.sh logs

# View more logs
./server.sh logs 100

# Remove PID lock (if server crashed)
./server.sh unlock
```

## Environment Configuration

ngdpbase uses different configuration files based on the `NODE_ENV` environment variable:

%%table-striped
|| Environment || Config File || Use Case ||
| __production__ | `config/app-production-config.json` | Production deployment (default) |
| __development__ | `config/app-development-config.json` | Local development |
| __test__ | `config/app-test-config.json` | Running tests |
| __staging__ | `config/app-staging-config.json` | Staging server (if exists) |
| __custom__ | `config/app-custom-config.json` | Local overrides (not tracked in git) |
/%

### How Configuration Loading Works

1. __Default Config__: `config/app-default-config.json` is always loaded first (base settings)
2. __Environment Config__: Based on `NODE_ENV`, loads environment-specific config
3. __Custom Config__: `config/app-custom-config.json` is loaded last and overrides everything
   - This file is `.gitignore`d for local-only settings
   - Use this for machine-specific overrides (API keys, local ports, etc.)

### Starting with Different Environments

#### Using `./server.sh` argument (recommended)

```bash
./server.sh start dev          # Development mode
./server.sh start prod         # Production mode
./server.sh restart dev        # Restart in development mode
```

#### Using NODE_ENV environment variable

```bash
NODE_ENV=development ./server.sh start
NODE_ENV=staging ./server.sh start
NODE_ENV=production ./server.sh start
```

#### Using npm scripts directly

```bash
npm run start:dev              # Development
npm run start:prod             # Production
npm start                      # Production (default)
```

### Checking Current Environment

```bash
./server.sh env
```

## Multiple Instance Prevention

The server uses a PID lock file (`.ngdpbase.pid`) to prevent multiple instances from running simultaneously. This ensures:

- ✅ Only one server instance runs at a time
- ✅ Data consistency (no conflicting writes)
- ✅ Predictable behavior (no port conflicts)

### If You Get "Another instance is already running"

1. __Check if server is actually running:__

   ```bash
   ./server.sh status
   # or
   ps aux | grep "node app.js" | grep -v grep
   ```

2. __If server is running but shouldn't be:__

   ```bash
   ./server.sh stop
   ```

3. __If server crashed and lock file is stale:__

   ```bash
   ./server.sh unlock
   ./server.sh start
   ```

## Server Logs Location

All logs are written to the `./data/logs/` directory:

%%table-striped
|| Type || Location || Purpose ||
| PM2 Output | `./data/logs/pm2-out.log` | stdout, startup messages |
| PM2 Errors | `./data/logs/pm2-error.log` | stderr, runtime errors |
| PM2 Combined | `./data/logs/pm2-combined.log` | Combined PM2 logs |
| Application | `./data/logs/app.log` | Winston logger, detailed operations |
| Audit | `./data/logs/audit.log` | Security/audit events |
/%

## Manual Management

### Using PM2 Directly

```bash
# Start
pm2 start npm --name "ngdpbase" -- start

# Stop
pm2 stop ngdpbase

# Restart
pm2 restart ngdpbase

# View logs
pm2 logs ngdpbase

# Delete from PM2
pm2 delete ngdpbase
```

### Using npm (Not Recommended for Production)

```bash
# Start (will fail if another instance is running)
npm start

# Stop (Ctrl+C in terminal)
```

## Troubleshooting

### Problem: Server won't start, says another instance is running

__Solution 1:__ Check if another instance is actually running

```bash
pm2 list
ps aux | grep "node app.js"
```

__Solution 2:__ Stop all instances

```bash
pm2 stop all
pkill -f "node app.js"
```

__Solution 3:__ Remove stale PID lock

```bash
./server.sh unlock
```

### Problem: Changes not saving

__Cause:__ Multiple server instances were running, saving to different instances.

__Prevention:__ Always use `./server.sh` or PM2 to manage the server. The PID lock prevents this issue.

### Problem: Port 3000 already in use

__Cause:__ Another application or orphaned Node process is using port 3000.

__Solution:__

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process (replace PID with actual process ID)
kill -9 <PID>
```

## Production Deployment

For production, use PM2 with the ecosystem file:

```bash
# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Enable PM2 startup on system boot
pm2 startup
```

## PID Lock File

- __Location:__ `.ngdpbase.pid` in the project root
- __Purpose:__ Prevents multiple server instances
- __Cleanup:__ Automatically removed on clean shutdown
- __Manual Cleanup:__ Use `./server.sh unlock` if needed

---
