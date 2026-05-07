# ngdpbase Startup Process

How ngdpbase starts, loads configuration, and begins serving requests.

Related: [installation-system.md](./installation-system.md) | [install-complete.md](./install-complete.md) | [Issue #253](https://github.com/jwilleke/ngdpbase/issues/253)

## Startup Sequence Overview

```text
server.sh start [env]
    │
    ├── 1. Ensure single PM2 daemon
    ├── 2. Check PID lock (.ngdpbase.pid)
    ├── 3. Check port 3000 availability
    ├── 4. Clean orphaned Node processes
    ├── 5. Clean stale PID files
    ├── 6. Delete existing PM2 app entry
    ├── 7. Start via PM2: ecosystem.config.js
    │       └── Sets NODE_ENV, launches app.js
    ├── 8. Wait for server (up to 30s)
    ├── 9. Verify PID and write .ngdpbase.pid
    └── 10. Clean PM2-generated PID files
              │
              ▼
         app.js
            │
            ├── 1. PID lock check (process-level)
            ├── 2. Express setup (view engine, static files)
            ├── 3. Initialization gate middleware (serves 503 maintenance page)
            ├── 4. app.listen(port) ← SERVER ACCEPTS CONNECTIONS
            │        (users see maintenance page while engine initializes)
            ├── 5. WikiEngine initialization (may take 1-2 min on large wikis)
            │     ├── new WikiEngine()
            │     └── engine.initialize()
            │           └── ConfigurationManager.initialize()
            │                 ├── Load config/app-default-config.json (required)
            │                 └── Load INSTANCE_DATA_FOLDER/config/{INSTANCE_CONFIG_FILE}
            ├── 6. Post-init middleware setup
            │     ├── Installation check middleware
            │     ├── Session setup (using ConfigurationManager paths)
            │     ├── User context middleware
            │     └── Admin maintenance mode middleware
            ├── 7. Route registration (InstallRoutes, WikiRoutes)
            └── 8. engineReady = true ← maintenance page stops, normal routes serve
```

## Configuration Loading

### What Actually Happens

The `ConfigurationManager` (`src/managers/ConfigurationManager.ts`) loads exactly **two** config files:

1. **`config/app-default-config.json`** — Base defaults, required, read-only, checked into the codebase
2. **`INSTANCE_DATA_FOLDER/config/{INSTANCE_CONFIG_FILE}`** — Instance-specific overrides, optional

The custom config file defaults to `app-custom-config.json` unless overridden by the `INSTANCE_CONFIG_FILE` environment variable.

### Configuration Priority (highest wins)

```text
1. Environment variables       (e.g., NGDPBASE_BASE_URL, NGDPBASE_PORT)
2. Instance custom config      (INSTANCE_DATA_FOLDER/config/app-custom-config.json)
3. Default config              (config/app-default-config.json)
4. Hard-coded fallback values  (in ConfigurationManager.ts)
```

### Environment Variable Overrides

These environment variables override the corresponding config file properties at runtime:

| Environment Variable       | Config Property              | Default     |
| -------------------------- | ---------------------------- | ----------- |
| `NGDPBASE_BASE_URL`         | `ngdpbase.application.base-url`            | (from config) |
| `NGDPBASE_HOSTNAME`         | `ngdpbase.hostname`           | (from config) |
| `NGDPBASE_HOST`             | `ngdpbase.server.host`        | `localhost` |
| `NGDPBASE_PORT`             | `ngdpbase.server.port`        | `3000`      |
| `NGDPBASE_SESSION_SECRET`   | `ngdpbase.session.secret`     | (from config) |
| `NGDPBASE_APP_NAME`         | `ngdpbase.application-name`    | `ngdpbase`   |

### Instance Management Variables

| Environment Variable     | Description                                              | Default                  |
| ------------------------ | -------------------------------------------------------- | ------------------------ |
| `INSTANCE_DATA_FOLDER`   | Base path for all instance data                          | `./data`                 |
| `INSTANCE_CONFIG_FILE`   | Config filename to load from `INSTANCE_DATA_FOLDER/config/` | `app-custom-config.json` |
| `NODE_ENV`               | Application environment (`production`, `development`, `test`) | `development`          |
| `PORT`                   | HTTP port (overrides config value)                       | `3000`                   |
| `PM2_MAX_MEMORY`         | PM2 max memory before restart (e.g., `4G`, `2G`)        | `4G`                     |

### What NODE_ENV Does (and Does Not Do)

`NODE_ENV` controls:

- PM2 environment selection in `ecosystem.config.js` (sets env vars for the process)
- Display messages in `server.sh`
- `development` mode defaults logging level to `debug` (unless `ngdpbase.logging.level` is set in custom config)

`NODE_ENV` does **not**:

- Select which config file to load (there is no `app-production-config.json` or `app-development-config.json` in the loading chain)
- Change the two-tier config loading behavior

The app always loads `app-default-config.json` + the instance custom config, regardless of `NODE_ENV`.

## server.sh

### What It Does

`server.sh` is a process management wrapper around PM2. It handles:

- Starting/stopping/restarting the ngdpbase Node.js process via PM2
- PID file locking to prevent multiple instances
- Port conflict detection
- Orphaned process cleanup
- Server status reporting

### How It Starts the App

```bash
npx --no pm2 start ecosystem.config.js --env $ENV_NAME
```

The `--env` flag selects which PM2 environment block to use from `ecosystem.config.js`, which sets `NODE_ENV`:

```javascript
// ecosystem.config.js
env: { NODE_ENV: 'production' },          // default
env_development: { NODE_ENV: 'development' },
env_production: { NODE_ENV: 'production' }
```

### Environment Argument Mapping

| server.sh argument | NPM script   | NODE_ENV      |
| ------------------ | ------------ | ------------- |
| _(none)_           | `start`      | `production`  |
| `dev`              | `start:dev`  | `development` |
| `prod`             | `start:prod` | `production`  |
| `test`             | `test`       | `test`        |

### .env File

`server.sh` automatically sources a `.env` file if present in the project root. Variables defined in `.env` are exported into the shell environment before any other processing occurs.

```bash
# .env file (sourced automatically by server.sh)
INSTANCE_DATA_FOLDER=/var/lib/ngdpbase/data
NODE_ENV=production
PM2_MAX_MEMORY=4G

# Shell exports and CLI args still override .env values:
INSTANCE_DATA_FOLDER=/override ./server.sh start   # overrides .env
```

The `.env` file is gitignored. The app does not use `dotenv` at runtime — only `server.sh` sources it.

## app.js Bootstrap

`app.js` is the Node.js entry point launched by PM2. It performs these steps in order:

### Step 1: PID Lock

Creates `.ngdpbase.pid` with the current process ID. If a PID file already exists and the process is running, the app exits with an error.

### Step 2: Express Setup (Pre-Engine)

Sets up the minimum Express configuration needed to serve the maintenance page:

- View engine (EJS)
- Static file serving (`public/`)

### Step 3: Initialization Gate Middleware (Maintenance Mode During Startup)

An `engineReady` flag (initially `false`) gates all incoming requests. While the engine is initializing, all non-static requests receive a **503** response with the `maintenance.ejs` page:

```javascript
app.use((req, res, next) => {
  if (engineReady) return next();
  // Allow static assets (CSS/JS/images/favicon) through
  // All other requests → 503 maintenance page
  return res.status(503).render('maintenance', { ... });
});
```

The maintenance page includes `<meta http-equiv="refresh" content="10">` so browsers automatically retry every 10 seconds.

### Step 4: Listen Immediately

```javascript
const port = parseInt(process.env.PORT || '3000', 10);
app.listen(port);
```

The server begins accepting connections **before** the engine initializes. Users see the maintenance page instead of "connection refused." This is especially important for large wikis (14K+ pages) where initialization can take 1-2 minutes.

### Step 5: WikiEngine Initialization

```javascript
engine = new WikiEngine();
await engine.initialize();
```

`WikiEngine.initialize()` creates and initializes all managers in dependency order, starting with `ConfigurationManager`. The ConfigurationManager:

1. Reads `INSTANCE_DATA_FOLDER` from env (default: `./data`)
2. Reads `INSTANCE_CONFIG_FILE` from env (default: `app-custom-config.json`)
3. Loads `config/app-default-config.json` (required — throws if missing)
4. Loads `INSTANCE_DATA_FOLDER/config/app-custom-config.json` (optional)
5. Deep-merges custom over default
6. Initializes remaining managers (24+ managers) using merged config

During this step, the server continues accepting connections and serving the maintenance page.

### Step 6: Post-Engine Middleware Setup

After the engine is ready, the remaining middleware is registered:

- JSON/URL-encoded body parsing, cookie parser
- **Installation check middleware**: If `INSTANCE_DATA_FOLDER/.install-complete` is missing → redirect to `/install`. If `HEADLESS_INSTALL=true` → auto-configure without the wizard.
- **Session setup**: Storage path and options from ConfigurationManager (`ngdpbase.session.storagedir`, `ngdpbase.session.secret`, `ngdpbase.session.max-age`)
- **User context middleware**: Attaches user info from session to each request
- **Admin maintenance mode middleware**: When `engine.config.features.maintenance.enabled` is true, returns 503 to non-admin users (allows admin/login/logout routes through so admins can disable it)

### Step 7: Route Registration

1. `InstallRoutes` mounted at `/install`
2. `WikiRoutes` handles all other routes (pages, auth, API, etc.)

### Step 8: Engine Ready

```javascript
engineReady = true;
```

The initialization gate middleware now passes all requests through to the normal middleware stack. Users see the wiki instead of the maintenance page.

### Admin-Triggered Maintenance Mode

Separate from the startup maintenance gate, admins can enable maintenance mode at runtime via the admin dashboard. When enabled:

- All non-admin users receive a 503 maintenance page
- Admin routes (`/admin/*`), login, and logout are allowed through
- Admins with the `admin` role bypass the maintenance page
- The maintenance message is configurable via `engine.config.features.maintenance.message`

## Configuration Files on Disk

### In the Codebase (read-only)

| File | Purpose |
| ---- | ------- |
| `config/app-default-config.json` | Base defaults with all properties. Never modify directly. |
| `.env.example` | Template showing available environment variables |

### In the Instance Data Folder

| File | Purpose |
| ---- | ------- |
| `INSTANCE_DATA_FOLDER/config/app-custom-config.json` | Instance-specific overrides. Created during installation or manually. |
| `INSTANCE_DATA_FOLDER/.install-complete` | Marker file indicating installation is done |

### Instance Data Folder Structure

```text
data/                              # INSTANCE_DATA_FOLDER (default: ./data)
├── .install-complete              # Installation completion marker
├── config/
│   └── app-custom-config.json     # Instance-specific configuration
├── pages/                         # Wiki content
├── users/                         # User accounts
├── logs/                          # Application and PM2 logs
├── search-index/                  # Lunr search index
├── sessions/                      # Session storage (high I/O)
├── backups/                       # Backup files
├── schemas/                       # Data schemas
└── notifications/                 # Notification data
```

## Startup Examples

### Development (local)

```bash
./server.sh start dev
```

### Production (local)

```bash
./server.sh start
# or explicitly:
./server.sh start prod
```

### Custom Instance Data Folder

```bash
INSTANCE_DATA_FOLDER=/var/lib/ngdpbase/data ./server.sh start
```

### Custom Config File

```bash
INSTANCE_DATA_FOLDER=/var/lib/ngdpbase/data \
INSTANCE_CONFIG_FILE=my-wiki-config.json \
./server.sh start
```

### Docker

```bash
docker run -d \
  -p 3000:3000 \
  -e NGDPBASE_BASE_URL="https://wiki.example.com" \
  -e NGDPBASE_SESSION_SECRET="your-secret" \
  -v $(pwd)/data:/app/data \
  ghcr.io/jwilleke/ngdpbase:latest
```

In Docker, `INSTANCE_DATA_FOLDER` defaults to `/app/data` (set in the Dockerfile).

### Direct Node.js (without PM2)

```bash
NODE_ENV=production node app.js
```

## Troubleshooting

### Server won't start

```bash
./server.sh status    # Check what's running
./server.sh unlock    # Force cleanup of all processes and locks
./server.sh start     # Start fresh
```

### Config changes not taking effect

1. Verify you are editing the correct file: `INSTANCE_DATA_FOLDER/config/app-custom-config.json`
2. Not `config/app-default-config.json` (that's the read-only base)
3. Restart the server after config changes
4. Check logs for `Loaded custom config:` message to confirm the custom config path

### Environment variables not working

- `server.sh` sources `.env` automatically — check that your `.env` file is in the project root
- Shell exports and CLI args override `.env` values
- The app does not use `dotenv` at runtime — environment variables must be set before the process starts
- PM2 passes env vars through `ecosystem.config.js` env blocks

### Port already in use

```bash
./server.sh status    # Shows what's on port 3000
./server.sh stop      # Stop the existing server
./server.sh start     # Restart
```
