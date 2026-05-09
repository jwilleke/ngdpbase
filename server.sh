#!/bin/bash
# ngdpbase Server Management Script
#
# Configuration: Two-tier system
# - Base defaults: config/app-default-config.json (always loaded)
# - Instance overrides: ${FAST_STORAGE:-${INSTANCE_DATA_FOLDER:-./data}}/config/app-custom-config.json
# - .env file sourced automatically if present
#
# Examples:
#   ./server.sh start              # Production (default)
#   ./server.sh start dev          # Development mode
#   ./server.sh env                # Show config file paths

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.ngdpbase.pid"

# Source .env if present (shell exports and CLI args still override)
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# Source per-instance .env from FAST_STORAGE if present.
# FAST_STORAGE is the operational data directory (sessions, logs, users, config).
# Falls back to legacy INSTANCE_DATA_FOLDER, then ./data.
_FAST="${FAST_STORAGE:-${INSTANCE_DATA_FOLDER:-./data}}"
if [ -f "$_FAST/.env" ]; then
  set -a
  source "$_FAST/.env"
  set +a
fi
unset _FAST

# Derive PM2 app name from config files (same priority as the app itself):
#   1. Instance override: ${FAST_STORAGE}/config/app-custom-config.json
#   2. Base default:      ./config/app-default-config.json
#   3. .env PROJECT_NAME
#   4. Directory basename
# Resolve FAST_STORAGE relative to SCRIPT_DIR if it's a relative path
_FAST_RESOLVED="${FAST_STORAGE:-${INSTANCE_DATA_FOLDER:-}}"
if [ -z "$_FAST_RESOLVED" ] || [[ "$_FAST_RESOLVED" != /* ]]; then
  _FAST_RESOLVED="$SCRIPT_DIR/${_FAST_RESOLVED:-data}"
fi
_FAST_CFG="$_FAST_RESOLVED/config/app-custom-config.json"
unset _FAST_RESOLVED
_DEFAULT_CFG="$SCRIPT_DIR/config/app-default-config.json"
_get_app_name() {
  local v
  for f in "$_FAST_CFG" "$_DEFAULT_CFG"; do
    [ -f "$f" ] || continue
    v=$(grep -oE '"ngdpbase\.(application-name|applicationName)"[[:space:]]*:[[:space:]]*"[^"]*"' "$f" \
        | sed 's/.*"[^"]*"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' | head -1)
    [ -n "$v" ] && echo "$v" && return
  done
  echo "${PROJECT_NAME:-$(basename "$SCRIPT_DIR")}"
}
APP_NAME="$(_get_app_name)"
unset _FAST_CFG _DEFAULT_CFG _get_app_name

# Function to ensure PM2 daemon is healthy (only one running)
ensure_single_pm2_daemon() {
  local daemon_count=$(pgrep -f "PM2.*God Daemon" | wc -l | tr -d ' ')
  if [ "$daemon_count" -gt 1 ]; then
    echo "⚠️  Multiple PM2 daemons detected ($daemon_count). Killing all..."
    pkill -9 -f "PM2.*God Daemon" 2>/dev/null || true
    sleep 1
    echo "   Restarting PM2 daemon..."
  fi
}

# Detect if running in container (Docker/K8s)
is_container() {
  # Check for Docker
  [ -f /.dockerenv ] && return 0
  # Check for Kubernetes
  [ -n "$KUBERNETES_SERVICE_HOST" ] && return 0
  # Check cgroup (Linux containers)
  grep -q 'docker\|kubepods\|containerd' /proc/1/cgroup 2>/dev/null && return 0
  return 1
}

# Check if dist/ is out of date relative to src/; prompt to build if so.
# Pass "starting" as $1 when called from the start flow (server not yet up).
check_build_needed() {
  local context="${1:-}"   # "starting" = server not yet running

  if [ ! -d "$SCRIPT_DIR/dist" ]; then
    echo "❌ ERROR: dist/ not found. Run: npm run build"
    exit 1
  fi

  # Find the most recently modified compiled JS in dist/
  local NEWEST_DIST
  NEWEST_DIST=$(find "$SCRIPT_DIR/dist" -name "*.js" -not -name "*.map" | xargs ls -t 2>/dev/null | head -1)

  if [ -z "$NEWEST_DIST" ]; then
    echo "⚠️  WARNING: No compiled JS found in dist/ — run: npm run build"
    return
  fi

  # Check if any TS source is newer than the newest dist file
  local STALE_SRC
  STALE_SRC=$(find "$SCRIPT_DIR/src" -name "*.ts" -not -name "*.d.ts" -newer "$NEWEST_DIST" 2>/dev/null | head -5)

  if [ -z "$STALE_SRC" ]; then
    return   # dist is up to date
  fi

  echo "⚠️  Source files are newer than dist/ — rebuild needed:"
  echo "$STALE_SRC" | while IFS= read -r f; do echo "     ${f#$SCRIPT_DIR/}"; done
  echo ""

  # Prompt user (skip in CI or non-interactive contexts)
  if [ -t 0 ] && [ -z "${CI:-}" ]; then
    printf "   Build now? [Y/n] "
    read -r BUILD_ANSWER
  else
    echo "   Non-interactive mode — building automatically..."
    BUILD_ANSWER="Y"
  fi
  case "${BUILD_ANSWER:-Y}" in
    [Yy]*)
      if [ "$context" != "starting" ]; then
        # Server may be running — stop it first
        echo "🛑 Stopping server before build..."
        "$0" stop
        sleep 1
      fi
      echo "🔨 Building..."
      if npm run build; then
        echo "✅ Build complete"
        if [ "$context" != "starting" ]; then
          echo "🚀 Restarting server..."
          "$0" start
          exit 0
        fi
      else
        echo "❌ Build failed — fix errors before starting"
        exit 1
      fi
      ;;
    *)
      echo "   Skipping build — starting with existing dist/"
      ;;
  esac
  echo ""
}

# Function to kill all ngdpbase processes (nuclear option)
# Key insight: DELETE from PM2 first to disable autorestart, THEN kill processes
kill_all_ngdpbase() {
  # STEP 1: Delete THIS app from PM2 (disables autorestart before we kill anything)
  # This must happen before any kill commands to prevent respawn race condition
  echo "   Removing from PM2 (disabling autorestart)..."
  npx --no pm2 delete "$APP_NAME" 2>/dev/null || true

  # Wait for PM2 to process the delete
  sleep 1

  # STEP 2: Now safe to kill processes - PM2 won't respawn them
  local app_pids=$(pgrep -f "node.*$SCRIPT_DIR/dist/src/app\.js" 2>/dev/null || true)
  if [ -n "$app_pids" ]; then
    echo "   Killing dist/src/app.js processes: $app_pids"
    echo "$app_pids" | xargs kill -9 2>/dev/null || true
  fi

  # STEP 3: Kill any process on port ${PORT:-3000} that's ours
  if command -v lsof &> /dev/null; then
    local port_pid=$(lsof -Pi :${PORT:-3000} -sTCP:LISTEN -t 2>/dev/null)
    if [ -n "$port_pid" ]; then
      local proc_cmd=$(ps -p "$port_pid" -o args= 2>/dev/null || true)
      if echo "$proc_cmd" | grep -q "$SCRIPT_DIR"; then
        echo "   Killing port ${PORT:-3000} holder: $port_pid"
        kill -9 "$port_pid" 2>/dev/null || true
      fi
    fi
  fi

  # STEP 4: Remove all PID files
  rm -f "$PID_FILE" "$SCRIPT_DIR"/.ngdpbase-*.pid "$SCRIPT_DIR"/server.pid
}

# Determine environment from second argument or NODE_ENV
ENV_ARG="${2:-}"
if [ -n "$ENV_ARG" ]; then
  case "$ENV_ARG" in
    dev|development)
      NPM_SCRIPT="start:dev"
      ENV_NAME="development"
      ;;
    prod|production)
      NPM_SCRIPT="start:prod"
      ENV_NAME="production"
      ;;
    test)
      NPM_SCRIPT="test"
      ENV_NAME="test"
      ;;
    *)
      NPM_SCRIPT="start"
      ENV_NAME="${NODE_ENV:-production}"
      ;;
  esac
else
  NPM_SCRIPT="start"
  ENV_NAME="${NODE_ENV:-production}"
fi

case "${1:-}" in
  start)
    # STEP 0: Check if dist/ is stale and offer to build
    check_build_needed "starting"

    # STEP 1: Ensure only one PM2 daemon is running
    ensure_single_pm2_daemon

    # STEP 2: Check if server is already running via PID file
    if [ -f "$PID_FILE" ]; then
      EXISTING_PID=$(cat "$PID_FILE")
      if ps -p "$EXISTING_PID" > /dev/null 2>&1; then
        echo "❌ ERROR: Server already running (PID $EXISTING_PID)"
        echo ""
        echo "Options:"
        echo "  1. Wait for startup to complete"
        echo "  2. Stop with: ./server.sh stop"
        echo "  3. Force unlock: ./server.sh unlock"
        exit 1
      else
        echo "🧹 Removing stale PID file (process $EXISTING_PID not found)..."
        rm -f "$PID_FILE"
      fi
    fi

    # STEP 3: Check if port ${PORT:-3000} is already in use
    if command -v lsof &> /dev/null; then
      PORT_PID=$(lsof -Pi :${PORT:-3000} -sTCP:LISTEN -t 2>/dev/null)
      if [ -n "$PORT_PID" ]; then
        # Check if it's OUR process (from this directory)
        PORT_CMD=$(ps -p "$PORT_PID" -o args= 2>/dev/null || true)
        if echo "$PORT_CMD" | grep -q "$SCRIPT_DIR"; then
          echo "⚠️  Found orphaned ngdpbase on port ${PORT:-3000} (PID $PORT_PID), killing..."
          kill -9 "$PORT_PID" 2>/dev/null || true
          sleep 1
        else
          echo "❌ ERROR: Port ${PORT:-3000} in use by another process (PID $PORT_PID)"
          echo ""
          echo "This process is preventing ngdpbase from starting:"
          lsof -i :${PORT:-3000} 2>/dev/null | grep LISTEN || true
          echo ""
          echo "Options:"
          echo "  1. Kill that process: kill -9 $PORT_PID"
          echo "  2. Use a different port (not yet supported)"
          exit 1
        fi
      fi
    fi

    # STEP 4: Clean up any orphaned Node processes running app.js FROM THIS DIRECTORY
    echo "🧹 Cleaning up any orphaned Node processes..."
    pgrep -f "node.*$SCRIPT_DIR/dist/src/app\.js" 2>/dev/null | xargs kill -9 2>/dev/null || true
    sleep 1

    # STEP 5: Clean up any PM2-created PID files (.ngdpbase-*.pid) and legacy files
    rm -f "$SCRIPT_DIR"/.ngdpbase-*.pid "$SCRIPT_DIR"/server.pid

    # STEP 6: Delete any existing PM2 app entry (prevents duplicates)
    npx --no pm2 delete "$APP_NAME" 2>/dev/null || true

    # STEP 7: Start via PM2
    echo "🚀 Starting ngdpbase in $ENV_NAME mode..."
    echo "   Base config: config/app-default-config.json"
    echo "   Instance config: ${FAST_STORAGE:-${INSTANCE_DATA_FOLDER:-./data}}/config/${INSTANCE_CONFIG_FILE:-app-custom-config.json}"
    echo "   Logs: ${FAST_STORAGE:-${INSTANCE_DATA_FOLDER:-./data}}/logs/"
    npx --no pm2 start ecosystem.config.cjs --env $ENV_NAME

    # STEP 8: Wait for server to start and verify it's running
    echo "   Waiting for server to start..."
    MAX_WAIT=30
    WAIT_COUNT=0
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
      sleep 1
      WAIT_COUNT=$((WAIT_COUNT + 1))

      # Check if PM2 shows the app as online
      PM2_STATUS=$(npx --no pm2 show "$APP_NAME" 2>/dev/null | grep -E "^\s*status" | awk '{print $NF}' || true)
      if [ "$PM2_STATUS" = "online" ]; then
        break
      fi

      # Check if app crashed
      if [ "$PM2_STATUS" = "errored" ] || [ "$PM2_STATUS" = "stopped" ]; then
        echo "❌ ERROR: Server failed to start (status: $PM2_STATUS)"
        echo "   Check logs: npx pm2 logs $APP_NAME --lines 50"
        rm -f "$PID_FILE"
        exit 1
      fi

      # Show progress every 5 seconds
      if [ $((WAIT_COUNT % 5)) -eq 0 ]; then
        echo "   Still waiting... ($WAIT_COUNT/$MAX_WAIT seconds)"
      fi
    done

    # STEP 9: Verify server started and write PID file
    PM2_PID=$(npx --no pm2 pid "$APP_NAME" 2>/dev/null | grep -oE '[0-9]+' | head -1)
    if [ -n "$PM2_PID" ] && [ "$PM2_PID" != "0" ]; then
      # Verify the process is actually running
      if ps -p "$PM2_PID" > /dev/null 2>&1; then
        echo "$PM2_PID" > "$PID_FILE"
        echo "✅ Server started (PID: $PM2_PID)"
        echo "🌐 http://${HOST:-localhost}:${PORT:-3000}"
      else
        echo "❌ ERROR: PID $PM2_PID reported but process not found"
        rm -f "$PID_FILE"
        exit 1
      fi
    else
      echo "❌ ERROR: Server failed to start - no PID detected"
      echo "   Check logs: npx pm2 logs $APP_NAME --lines 50"
      rm -f "$PID_FILE"
      exit 1
    fi

    # STEP 10: Clean up PM2-generated PID files (keep only .ngdpbase.pid as source of truth)
    rm -f "$SCRIPT_DIR"/.ngdpbase-*.pid
    ;;

  stop)
    echo "🛑 Stopping $APP_NAME..."

    # Use the comprehensive kill function
    kill_all_ngdpbase
    sleep 1

    # Verify nothing is left on port ${PORT:-3000} (retry up to 3 times for PM2 race condition)
    STOP_ATTEMPTS=0
    while [ $STOP_ATTEMPTS -lt 3 ]; do
      if command -v lsof &> /dev/null; then
        PORT_PID=$(lsof -Pi :${PORT:-3000} -sTCP:LISTEN -t 2>/dev/null)
        if [ -n "$PORT_PID" ]; then
          PORT_CMD=$(ps -p "$PORT_PID" -o args= 2>/dev/null || true)
          if echo "$PORT_CMD" | grep -q "$SCRIPT_DIR"; then
            echo "⚠️  Process still on port ${PORT:-3000} (PID $PORT_PID), retrying stop..."
            kill -9 "$PORT_PID" 2>/dev/null || true
            npx --no pm2 delete "$APP_NAME" 2>/dev/null || true
            sleep 1
            STOP_ATTEMPTS=$((STOP_ATTEMPTS + 1))
            continue
          fi
        fi
      fi
      break
    done

    # Final check
    if command -v lsof &> /dev/null; then
      PORT_PID=$(lsof -Pi :${PORT:-3000} -sTCP:LISTEN -t 2>/dev/null)
      if [ -n "$PORT_PID" ]; then
        PORT_CMD=$(ps -p "$PORT_PID" -o args= 2>/dev/null || true)
        if echo "$PORT_CMD" | grep -q "$SCRIPT_DIR"; then
          echo "❌ ERROR: Failed to stop server after 3 attempts (PID $PORT_PID)"
          echo "   Try: ./server.sh unlock"
          exit 1
        fi
      fi
    fi

    echo "✅ Server stopped"
    ;;

  restart)
    echo "🔄 Restarting $APP_NAME..."

    # Stop everything
    "$0" stop
    sleep 2

    # Start fresh
    if [ -n "$ENV_ARG" ]; then
      "$0" start "$ENV_ARG"
    else
      "$0" start
    fi
    ;;

  status)
    echo "📊 ngdpbase Server Status"
    echo "========================"
    echo ""

    # Check for multiple PM2 daemons (common issue)
    DAEMON_COUNT=$(pgrep -f "PM2.*God Daemon" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$DAEMON_COUNT" -gt 1 ]; then
      echo "⚠️  WARNING: $DAEMON_COUNT PM2 daemons running (should be 1)"
      echo "    Run: ./server.sh unlock"
      echo ""
    elif [ "$DAEMON_COUNT" -eq 0 ]; then
      echo "ℹ️  PM2 daemon not running"
      echo ""
    fi

    # Check PID file
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if ps -p "$PID" > /dev/null 2>&1; then
        echo "✅ PID Lock: Valid (PID $PID is running)"
      else
        echo "⚠️  PID Lock: Stale (PID $PID not running)"
        echo "    Run: ./server.sh unlock"
      fi
    else
      echo "❌ PID Lock: Not found (server likely not running)"
    fi

    echo ""
    echo "PM2 Status:"
    npx --no pm2 list 2>/dev/null | grep -E "(id|$APP_NAME)" || echo "   No PM2 processes found"

    echo ""
    echo "Port ${PORT:-3000}:"
    if command -v lsof &> /dev/null; then
      if lsof -Pi :${PORT:-3000} -sTCP:LISTEN -t >/dev/null 2>&1; then
        lsof -i :${PORT:-3000} | grep LISTEN || echo "   Port in use (process unknown)"
      else
        echo "   Port available"
      fi
    else
      echo "   (lsof not available - install to check port status)"
    fi

    echo ""
    echo "Node Processes (this project):"
    ps aux | grep "$SCRIPT_DIR/dist/src/app\.js" | grep -v grep || echo "   None found"

    # Check for PID file duplicates
    PID_COUNT=$(ls -1 "$SCRIPT_DIR"/.ngdpbase*.pid 2>/dev/null | wc -l | tr -d ' ')
    if [ "$PID_COUNT" -gt 1 ]; then
      echo ""
      echo "⚠️  WARNING: Multiple PID files found:"
      ls -la "$SCRIPT_DIR"/.ngdpbase*.pid 2>/dev/null
    fi
    ;;

  logs)
    npx --no pm2 logs "$APP_NAME" --lines ${2:-50}
    ;;

  env)
    echo "Configuration:"
    echo "  NODE_ENV: ${NODE_ENV:-production}"
    echo "  FAST_STORAGE: ${FAST_STORAGE:-${INSTANCE_DATA_FOLDER:-./data}}"
    echo "  SLOW_STORAGE: ${SLOW_STORAGE:-${FAST_STORAGE:-${INSTANCE_DATA_FOLDER:-./data}}}"
    echo "  INSTANCE_CONFIG_FILE: ${INSTANCE_CONFIG_FILE:-app-custom-config.json}"
    echo ""
    echo "Config files loaded:"
    echo "  1. config/app-default-config.json (base defaults)"
    CUSTOM_PATH="${FAST_STORAGE:-${INSTANCE_DATA_FOLDER:-./data}}/config/${INSTANCE_CONFIG_FILE:-app-custom-config.json}"
    if [ -f "$SCRIPT_DIR/$CUSTOM_PATH" ] || [ -f "$CUSTOM_PATH" ]; then
      echo "  2. $CUSTOM_PATH (instance overrides)"
    else
      echo "  2. $CUSTOM_PATH (not found)"
    fi
    ;;

  upgrade-pm2)
    # Reload the running PM2 daemon onto the version installed in node_modules.
    # Wraps `pm2 update` (save → kill → respawn → resurrect) so apps registered
    # by OTHER repos under this user's daemon survive the swap. Prefer this over
    # `unlock` whenever you've just bumped the pm2 dep.
    #
    # `pm2 update` is idempotent — safe to run when versions already match
    # (will simply save, kill, respawn, restore at the same version).
    PM2_BIN="$SCRIPT_DIR/node_modules/.bin/pm2"
    if [ ! -x "$PM2_BIN" ]; then
      echo "❌ pm2 not found in node_modules. Run 'npm install' first."
      exit 1
    fi
    LOCAL_PM2=$("$PM2_BIN" --version 2>/dev/null | tail -1)
    echo "🔄 Upgrading PM2 daemon to local pm2 $LOCAL_PM2..."
    echo "   (preserves apps registered by other repos sharing this user's daemon)"
    "$PM2_BIN" update
    NEW_PM2=$("$PM2_BIN" --version 2>/dev/null | tail -1)
    echo "✅ Daemon now running pm2 $NEW_PM2"
    ;;

  unlock)
    echo "🔓 Unlocking server (nuclear cleanup)..."

    # 1. Kill all ngdpbase processes
    echo "   Stopping all ngdpbase processes..."
    kill_all_ngdpbase

    # 2. Kill PM2 daemon entirely (unlock is a nuclear option — intentional)
    DAEMON_COUNT=$(pgrep -f "PM2.*God Daemon" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$DAEMON_COUNT" -gt 0 ]; then
      echo "   Killing $DAEMON_COUNT PM2 daemon(s)..."
      npx --no pm2 delete all 2>/dev/null || true
      npx --no pm2 kill 2>/dev/null || true
      pkill -9 -f "PM2.*God Daemon" 2>/dev/null || true
    fi

    # 3. Kill any remaining node processes from this directory
    echo "   Killing any remaining Node processes..."
    pgrep -f "node.*$SCRIPT_DIR" 2>/dev/null | xargs kill -9 2>/dev/null || true

    # 4. Clear PM2 logs
    echo "   Clearing PM2 logs..."
    npx --no pm2 flush 2>/dev/null || true

    sleep 1
    echo "✅ Server unlocked. Run: ./server.sh start"
    ;;

  setup)
    # Parse --config flag
    SETUP_CONFIG=""
    SETUP_ARGS=("${@:2}")
    while [ ${#SETUP_ARGS[@]} -gt 0 ]; do
      case "${SETUP_ARGS[0]}" in
        --config)
          SETUP_CONFIG="${SETUP_ARGS[1]:-}"
          SETUP_ARGS=("${SETUP_ARGS[@]:2}")
          ;;
        *)
          SETUP_ARGS=("${SETUP_ARGS[@]:1}")
          ;;
      esac
    done

    echo "🔧 ngdpbase setup"
    echo ""

    # Step 1: Install dependencies
    echo "📦 Installing dependencies..."
    if ! npm install; then
      echo "❌ npm install failed"
      exit 1
    fi
    echo ""

    # Step 2: Build
    echo "🔨 Building..."
    if ! npm run build; then
      echo "❌ Build failed — fix errors before starting"
      exit 1
    fi
    echo ""

    # Step 3: Place custom config if supplied
    if [ -n "$SETUP_CONFIG" ]; then
      if [ ! -f "$SETUP_CONFIG" ]; then
        echo "❌ Config file not found: $SETUP_CONFIG"
        exit 1
      fi
      _FAST_SETUP="${FAST_STORAGE:-${INSTANCE_DATA_FOLDER:-./data}}"
      _CONFIG_DIR="$_FAST_SETUP/config"
      mkdir -p "$_CONFIG_DIR"
      cp "$SETUP_CONFIG" "$_CONFIG_DIR/app-custom-config.json"
      echo "✅ Config installed: $_CONFIG_DIR/app-custom-config.json"
      unset _FAST_SETUP _CONFIG_DIR
      echo ""
      export HEADLESS_INSTALL=true
    fi

    # Step 4: Start server
    "$0" start
    ;;

  *)
    echo "ngdpbase Server Management"
    echo ""
    echo "Usage: $0 {setup|start|stop|restart|status|logs|env|upgrade-pm2|unlock} [environment]"
    echo ""
    echo "Commands:"
    echo "  setup        - Fresh-clone setup: install deps, build, and start"
    echo "                 Options: --config <path>  supply app-custom-config.json"
    echo "                          (implies HEADLESS_INSTALL=true — no wizard)"
    echo "  start [env]  - Start server (validates: no existing process, port available)"
    echo "                 env: dev, prod (default: production)"
    echo "  stop         - Stop server gracefully (with force-kill fallback)"
    echo "  restart [env]- Restart server (full stop → start cycle)"
    echo "  status       - Show comprehensive server status"
    echo "                 • PID lock validity"
    echo "                 • PM2 process list"
    echo "                 • Port ${PORT:-3000} availability"
    echo "                 • Node processes"
    echo "  logs [n]     - Show server logs (n = line count, default: 50)"
    echo "  env          - Show current environment and available configs"
    echo "  upgrade-pm2  - Reload the PM2 daemon onto the version in node_modules"
    echo "                 (pm2 update — save/kill/respawn/resurrect, preserves siblings)"
    echo "                 Use after bumping the pm2 dep instead of unlock."
    echo "  unlock       - Force unlock server (clears PM2, kills processes, removes locks)"
    echo "                 Use if server crashed or stuck — NUCLEAR; kills sibling apps"
    echo "                 sharing this user's PM2 daemon. Prefer upgrade-pm2 for routine"
    echo "                 daemon-binary upgrades."
    echo ""
    echo "Process Management:"
    echo "  • Single instance guaranteed via .ngdpbase.pid lock"
    echo "  • Automatic cleanup of orphaned Node processes on start"
    echo "  • Port conflict detection before startup"
    echo "  • Graceful stop with force-kill fallback"
    echo ""
    echo "Environment Examples:"
    echo "  ./server.sh start          # Production (default)"
    echo "  ./server.sh start dev      # Development"
    echo "  ./server.sh restart prod   # Restart production"
    echo "  NODE_ENV=staging ./server.sh start  # Custom environment"
    echo ""
    echo "Troubleshooting:"
    echo "  Server won't start:"
    echo "    1. Check status: ./server.sh status"
    echo "    2. Force unlock: ./server.sh unlock"
    echo "    3. Then start:   ./server.sh start"
    echo ""
    echo "  Multiple processes running:"
    echo "    ./server.sh unlock  # Clears all locks and processes"
    echo ""
    echo "Config Files (two-tier system):"
    echo "  1. config/app-default-config.json                    - Base defaults (read-only)"
    echo "  2. \${FAST_STORAGE}/config/app-custom-config.json      - Instance overrides"
    echo ""
    echo "Storage:"
    echo "  FAST_STORAGE - Operational data: sessions, logs, users, search-index, config"
    echo "  SLOW_STORAGE - Bulk content: pages, attachments, backups"
    echo "  Both default to ./data (single-drive setup)"
    echo ""
    echo "Environment:"
    echo "  .env files loaded in order: \$SCRIPT_DIR/.env, then \${FAST_STORAGE}/.env"
    echo "  Shell exports and CLI args override .env values"
    exit 1
    ;;
esac
