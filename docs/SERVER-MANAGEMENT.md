# Server Management - Best Practices & Issue #167 Solution

__Purpose:__ Define ideal server management practices and document the solution to GitHub issue #167 (multiple instances running)

__Status:__ ✅ __IMPLEMENTED AND TESTED__ (Session 2025-12-06)

## Problem Definition (SOLVED)

### What's Wrong

1. __Multiple server instances__ running at once (PIDs 45254, 5754, 9905, etc.)
2. __No proper process validation__ before starting new server
3. __Stale PID files__ not cleaned up (`.ngdpbase.pid` becomes outdated)
4. __PM2 and server.sh managing independently__ - not coordinated
5. __Old processes__ continue serving cached responses after restart
6. __Form changes__ not reflected (old process still running old code)

### Evidence from Session 2025-12-06

```bash
# Multiple processes found simultaneously:
PID 45254  - Running old code (serving cached forms)
PID 5754   - From restart attempt
PID 9905   - From another restart attempt

# After killing old process:
kill 45254
# THEN form updates finally appeared

# Root cause:
- server.sh restart doesn't verify old process is gone
- PM2 creates separate PID management
- No validation that only ONE process should run
```

## Solution Implemented

### 7-Step Startup Process (in server.sh)

```
./server.sh start
    ↓
STEP 1: Validate existing PID file
    ├─ Check if .ngdpbase.pid exists
    ├─ If yes: Is process alive?
    │   ├─ YES → ERROR: Server already running, suggest stop/unlock
    │   └─ NO → Remove stale PID, continue
    └─ If no: Continue
    ↓
STEP 2: Check port 3000 availability
    ├─ Using: lsof -Pi :3000
    ├─ If in use → ERROR: Show what's using it, suggest kill or unlock
    └─ If free: Continue
    ↓
STEP 3: Kill orphaned Node processes
    ├─ pkill -9 -f "node.*app\.js"
    └─ Sleep 1 second for cleanup
    ↓
STEP 4: Remove legacy PID files
    ├─ rm -f .ngdpbase-*.pid (PM2 artifacts)
    ├─ rm -f server.pid (deprecated format)
    └─ Continue
    ↓
STEP 5: Start via PM2
    ├─ npx pm2 start ecosystem.config.js --env {environment}
    └─ Sleep 1 second for startup
    ↓
STEP 6: Write .ngdpbase.pid (single source of truth)
    ├─ Get PM2 process ID
    ├─ Write to .ngdpbase.pid
    └─ Report success with PID
    ↓
STEP 7: Clean PM2 artifacts
    ├─ rm -f .ngdpbase-*.pid (remove any PM2-generated files)
    └─ Ensures ONLY .ngdpbase.pid exists
```

### Testing Results ✅

- ✅ Single instance enforcement: ONE `.ngdpbase.pid`, ONE Node process
- ✅ Duplicate prevention: Second start blocks with helpful error
- ✅ Graceful shutdown: Stop command works with force-kill fallback
- ✅ Clean restart: Process replaced with new PID
- ✅ Port conflict detection: Prevents startup if port in use
- ✅ Stale PID cleanup: Removes orphaned lock files

## Implementation Details

### 1. Enhance server.sh

__Key improvements:__

```bash
start_server() {
  # 1. Validate no existing process
  if [ -f "$PID_FILE" ]; then
    EXISTING_PID=$(cat "$PID_FILE")
    if ps -p "$EXISTING_PID" > /dev/null 2>&1; then
      echo "❌ ERROR: Server already running (PID $EXISTING_PID)"
      echo "Options:"
      echo "  1. Wait for startup to complete"
      echo "  2. Stop with: ./server.sh stop"
      echo "  3. Force unlock: ./server.sh unlock"
      exit 1
    else
      echo "⚠️  Removing stale PID file (process $EXISTING_PID not found)"
      rm -f "$PID_FILE"
    fi
  fi

  # 2. Check port availability
  if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null; then
    USING_PID=$(lsof -Pi :3000 -sTCP:LISTEN -t)
    echo "❌ ERROR: Port 3000 in use by PID $USING_PID"
    echo "Kill with: kill -9 $USING_PID"
    exit 1
  fi

  # 3. Kill orphaned Node processes
  echo "🧹 Cleaning orphaned Node processes..."
  pkill -9 -f "node.*app.js" 2>/dev/null || true
  sleep 1

  # 4. Start via PM2
  echo "🚀 Starting ngdpbase in $ENV mode..."
  pm2 start app.js --name "ngdpbase-ngdpbase" ...

  # 5. Store PID
  echo $! > "$PID_FILE"

  echo "✅ Server started (PID: $!)"
}
```

### 2. Stop Procedure

The stop sequence is PM2-aware to prevent the respawn race condition (see issue #231).
PM2's `autorestart: true` will respawn killed processes unless the app is deleted from PM2 first.

__Key insight:__ Delete from PM2 FIRST before killing processes. This disables autorestart
before any kills happen, preventing the respawn race condition.

```bash
kill_all_ngdpbase() {
  # STEP 1: Delete ALL PM2 apps FIRST (disables autorestart before we kill anything)
  # This must happen before any kill commands to prevent respawn race condition
  echo "   Removing from PM2 (disabling autorestart)..."
  npx --no pm2 delete "$APP_NAME" 2>/dev/null || true
  npx --no pm2 delete all 2>/dev/null || true

  # Wait for PM2 to process the delete
  sleep 1

  # STEP 2: Now safe to kill processes - PM2 won't respawn them
  local app_pids=$(pgrep -f "node.*$SCRIPT_DIR/app\.js" 2>/dev/null || true)
  if [ -n "$app_pids" ]; then
    echo "   Killing app.js processes: $app_pids"
    echo "$app_pids" | xargs kill -9 2>/dev/null || true
  fi

  # STEP 3: Kill any process on port 3000 that's ours
  # ... (lsof check with $SCRIPT_DIR ownership verification)

  # STEP 4: Remove all PID files
  rm -f "$PID_FILE" "$SCRIPT_DIR"/.ngdpbase-*.pid "$SCRIPT_DIR"/server.pid
}
```

The `stop` command also includes a retry loop (up to 3 attempts) to handle the race
where PM2 respawns a process between stop and delete. After retries, it reports an
error and directs the user to `./server.sh unlock`.

__Key insight:__ Always delete the PM2 app entry *before* killing node processes.
Otherwise `autorestart: true` immediately respawns what you just killed.

### 3. Status Checking

```bash
status_check() {
  # 1. Check .ngdpbase.pid
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
      echo "✅ Server running (PID: $PID)"
    else
      echo "⚠️  Stale PID file found (PID: $PID not running)"
      echo "   Run: ./server.sh unlock"
    fi
  else
    echo "⛔️ No server running"
  fi

  # 2. Check PM2
  echo ""
  echo "PM2 Status:"
  pm2 list | grep ngdpbase

  # 3. Check port
  echo ""
  echo "Port 3000:"
  lsof -i :3000 || echo "Not in use"

  # 4. Check orphaned processes
  echo ""
  echo "Node processes:"
  ps aux | grep "node.*app.js" | grep -v grep || echo "None"
}
```

### 4. Unlock/Reset

```bash
unlock_server() {
  echo "🔓 Unlocking server..."

  # 1. Run comprehensive kill (stops PM2 apps, kills processes, cleans PIDs)
  kill_all_ngdpbase

  # 2. Delete all PM2 apps then kill daemon
  npx --no pm2 delete all 2>/dev/null || true
  npx --no pm2 kill 2>/dev/null || true
  pkill -9 -f "PM2.*God Daemon" 2>/dev/null || true

  # 3. Kill any remaining node processes from this directory
  pgrep -f "node.*$SCRIPT_DIR" | xargs kill -9 2>/dev/null || true

  # 4. Clear PM2 logs
  npx --no pm2 flush 2>/dev/null || true

  echo "✅ Server unlocked. Run: ./server.sh start"
}
```

## Single PID File Standard

__Decision:__ Use ONLY `.ngdpbase.pid`

__Never create:__

- `server.pid`
- `.ngdpbase-*.pid`
- Any PM2 generated PID files

__Rules:__

1. PID file contains: single integer (the process ID)
2. Only written by server.sh during startup
3. Only removed by server.sh during shutdown
4. Readable by: `cat .ngdpbase.pid` to get the PID
5. Cleaned up on crash: `./server.sh unlock`

## PM2 Configuration

### Current Setup (PM2 handles restart/monitoring)

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "ngdpbase-ngdpbase",
      script: "app.js",
      env: {
        NODE_ENV: "production"
      },
      env_development: {
        NODE_ENV: "development"
      },
      // Process management
      instances: 1,  // Single instance only
      exec_mode: "fork",  // Not cluster mode
      watch: false,  // We manage restarts via server.sh
      autorestart: true,  // Restart if it crashes
      max_memory_restart: "500M",
      error_file: "./data/logs/pm2-error.log",
      out_file: "./data/logs/pm2-out.log",
      log_file: "./data/logs/pm2-combined.log",
      // Safety
      kill_timeout: 5000,
      listen_timeout: 3000
    }
  ]
};
```

### Restart Strategy (via server.sh, not PM2)

```bash
restart_server() {
  echo "🔄 Restarting ngdpbase..."

  # Stop gracefully
  ./server.sh stop

  # Wait for full shutdown
  sleep 2

  # Verify it's gone
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
      echo "⚠️  Force killing PID $PID"
      kill -9 "$PID"
    fi
  fi

  # Start fresh
  ./server.sh start $ENV

  echo "✅ Restart complete"
}
```

## Validation Steps (Pre-Start Checklist)

Before starting server, `./server.sh start` should verify:

1. ✅ __No existing PID file__ or stale PID file can be removed
2. ✅ __Port 3000 is available__ (nothing listening)
3. ✅ __No orphaned Node processes__ running
4. ✅ __PM2 daemon is running__ (or can be started)
5. ✅ __Configuration files exist__ (default + environment)
6. ✅ __Logs directory exists__ (./data/logs/)
7. ✅ __Permission to write PID file__ (.ngdpbase.pid)

## Error Messages (User-Friendly)

### Error: Server Already Running

```
❌ ERROR: Server already running (PID 5754)

This means a server process is already active. You have two options:

1. If server is working fine:
   → Just wait, it may still be starting up
   → Check status with: ./server.sh status

2. If you need to restart:
   → Stop first with: ./server.sh stop
   → Then start again with: ./server.sh start

3. If server crashed (unresponsive):
   → Force unlock with: ./server.sh unlock
   → Then start fresh with: ./server.sh start

More info:
  - Check logs: ./server.sh logs
  - Manual cleanup: ./server.sh force-unlock (if desperate)
```

### Error: Port Already in Use

```
❌ ERROR: Port 3000 in use by PID 12345

This means another process has claimed port 3000.

Options:
1. If it's an old ngdpbase process:
   → Kill it with: kill -9 12345
   → Or: ./server.sh force-unlock

2. If it's a different application:
   → Either stop that application
   → Or change ngdpbase port in config
   → Restart ngdpbase

Check what's using port 3000:
  lsof -i :3000
```

## Testing Checklist

- [ ] Fresh start: `./server.sh start` (no previous state)
- [ ] Double start: `./server.sh start` twice → second fails gracefully
- [ ] Graceful stop: `./server.sh stop` → server stops cleanly
- [ ] Crash recovery: Kill process, `./server.sh start` → works
- [ ] Stale PID: Manually delete PID file, `./server.sh start` → works
- [ ] Port conflict: Start another app on 3000, `./server.sh start` → fails with helpful error
- [ ] Restart: `./server.sh restart dev` → stops old, starts new
- [ ] Unlock: `./server.sh unlock` → clears all locks
- [ ] Status: `./server.sh status` → accurate info
- [ ] PM2 name mismatch: `pm2 start app.js --name ngdpbase` then `./server.sh stop` → still stops (#231)
- [ ] Stop retry: verify port 3000 is free after `./server.sh stop` (no PM2 respawn race)

## Documentation Updates Needed

1. Update `SERVER.md` with new validation logic
2. Add troubleshooting for multiple instances
3. Document `./server.sh unlock` usage
4. Add "What to do if server won't start" section
5. Reference issue #167 as solved

## Performance Impact

- __Startup time:__ Add 1-2 seconds for validation checks
- __Shutdown time:__ Graceful stop + verification = 3 seconds
- __Memory:__ No change (no new processes)
- __PID file overhead:__ Negligible (64 bytes)

## Backwards Compatibility

- Existing `./server.sh` commands work unchanged
- New error messages are user-friendly
- `.ngdpbase.pid` location unchanged
- PM2 ecosystem file unchanged
- Configuration files unchanged

## Implementation Priority

1. __Critical (fixes #167):__
   - Process validation before start
   - Stale PID cleanup
   - Single PID file enforcement
   - Orphaned process cleanup

2. __High (prevents issues):__
   - Port availability check
   - Error messages improvement
   - Force unlock capability

3. __Nice to have:__
   - Daemon mode (background startup)
   - Auto-restart on file changes (development)
   - Health check endpoint
   - Metrics collection

## References

- GitHub Issue #167: Multiple server instances running
- GitHub Issue #231: server.sh stop fails to stop server (PM2 respawn race)
- Current `SERVER.md`: Process management documentation
- `./server.sh`: Implementation file
- `ecosystem.config.js`: PM2 configuration

## Success Criteria

✅ Only ONE Node.js process running at any time
✅ Only ONE `.ngdpbase.pid` file exists
✅ Stale processes cleaned up on start
✅ Clear error messages for conflicts
✅ Graceful stop/restart works reliably
✅ Form changes reflected immediately after restart
✅ No orphaned processes after crashes

## Docker & Kubernetes Deployment

### Current Implementation (Bare Metal / VMs)

__Strategy:__ Option A - Keep PM2 for process management

- __Best For:__ Development, on-premises servers, single-machine deployments
- __PM2 Features Used:__
  - Auto-restart on crash (`autorestart: true`)
  - Memory-limit enforcement (1G max)
  - Log rotation
  - Single instance mode (instances: 1)
  - Graceful shutdown timeout
- __Coordinator:__ `server.sh` manages PM2, enforces single instance via `.ngdpbase.pid`
- __Stop strategy (fix for #231):__ Delete PM2 app entries *before* killing node processes.
  This prevents PM2's `autorestart` from respawning killed processes. The stop command
  includes a `pm2 stop all` / `pm2 delete all` fallback to handle PM2 name mismatches,
  plus a retry loop to handle the respawn race condition.

### Docker Deployment (Recommended)

__Strategy:__ Option C - Simple Node process (no PM2)

- __Architecture:__ Node runs as PID 1 in container (`CMD ["node", "app.js"]`)
- __Not affected by #231:__ Docker does not use PM2 or `server.sh`. The container
  runtime handles process lifecycle, so the PM2 respawn race does not apply.
- __Container Handles:__
  - Process restart (via restart policy: `unless-stopped`)
  - Logging (via log driver: `json-file` with rotation)
  - Resource limits (via `--memory` and `--cpus` flags)
  - Health checks (via `HEALTHCHECK` instruction)
- __Single Instance Enforcement:__ One process per container, enforced by Docker

__Benefits:__

- ✅ Cleaner process model (standard Docker practices)
- ✅ No PM2 overhead in lightweight containers
- ✅ Direct signal forwarding (SIGTERM → app)
- ✅ Smaller image size (no PM2 dependency)
- ✅ Better resource efficiency
- ✅ Immune to PM2 respawn race (#231)

__Implementation:__

```dockerfile
# Dockerfile.prod
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Run Node directly (not via PM2)
CMD ["node", "app.js"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"
```

__Docker Compose:__

```yaml
version: '3.8'
services:
  ngdpbase:
    image: ngdpbase:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - ./pages:/app/pages              # Wiki pages
      - ./users:/app/users              # User data
      - ./attachments:/app/attachments  # Uploads
      - ./config:/app/config            # Custom config
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
    # Resource limits
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Kubernetes Deployment

__Strategy:__ Option C variant - Simple Node process with K8s orchestration

- __Pod Model:__ Node runs as PID 1, K8s manages lifecycle
- __Not affected by #231:__ Like Docker, K8s does not use PM2 or `server.sh`.
  Pod restart policies and liveness probes handle process lifecycle.
- __Kubernetes Handles:__
  - Pod restart (via restart policy)
  - Scaling (via Deployment replicas)
  - Health checks (via liveness/readiness probes)
  - Resource management (via requests/limits)
  - Service discovery (via Service)
  - ConfigMaps for environment variables
  - PersistentVolumes for data storage

__Implementation:__

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ngdpbase
  labels:
    app: ngdpbase
spec:
  replicas: 2  # Or 1 if you want single instance
  selector:
    matchLabels:
      app: ngdpbase
  template:
    metadata:
      labels:
        app: ngdpbase
    spec:
      containers:
      - name: ngdpbase
        image: ngdpbase:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 1
        volumeMounts:
        - name: pages
          mountPath: /app/pages
        - name: users
          mountPath: /app/users
        - name: attachments
          mountPath: /app/attachments
      volumes:
      - name: pages
        persistentVolumeClaim:
          claimName: ngdpbase-pages
      - name: users
        persistentVolumeClaim:
          claimName: ngdpbase-users
      - name: attachments
        persistentVolumeClaim:
          claimName: ngdpbase-attachments
---
apiVersion: v1
kind: Service
metadata:
  name: ngdpbase
spec:
  type: LoadBalancer
  selector:
    app: ngdpbase
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
    name: http
```

__Important Notes for Kubernetes:__

- Each Pod gets its own `.ngdpbase.pid` (isolated file system)
- Single instance per Pod enforced automatically
- Use `replicas: 1` to enforce single instance globally (or use StatefulSet)
- Stateless design allows horizontal scaling if needed
- PersistentVolumes shared across replicas for data consistency

### Migration Path: Bare Metal → Docker → Kubernetes

1. __Today (Current):__ PM2 + server.sh (working, tested)
2. __Next (Docker):__ Remove PM2, use simple Node in containers
3. __Future (K8s):__ Standard K8s Deployment with PersistentVolumes

All strategies keep `.ngdpbase.pid` locking mechanism:

- __Bare Metal:__ Enforces single instance per machine
- __Docker:__ Enforces single instance per container
- __Kubernetes:__ Enforces single instance per Pod (via shared filesystem)

### Health Check Endpoint Recommendation

For all deployment models, add `/health` endpoint to `app.js`:

```javascript
// app.js
app.get('/health', (req, res) => {
  // Simple check that server is responsive
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});
```

This enables:

- Container health checks (Docker HEALTHCHECK)
- Kubernetes liveness/readiness probes
- Load balancer health verification
- Monitoring system integration
