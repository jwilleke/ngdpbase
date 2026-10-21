# Setup & Installation

Quick setup instructions for getting ngdpbase running locally or in production.

This page is the __direct install__ — a clone of the repository, built and run on the host. It is one of four implementation methods; [docs/installation/Implementation.md](docs/installation/Implementation.md) is the lead document and names the others (container, Kubernetes, downstream image) and what each inherits.

## Prerequisites

- __Node.js v24+__ - [Download](https://nodejs.org/) (Node 18 EOL April 2025; Node 20 EOL April 2026)
- __npm__ - Included with Node.js
- __PM2__ - installed by `npm install` as a dependency; `./server.sh` runs it through `npx`, so no global install is needed. It is only needed for `./server.sh`; see [Start the server](#5-start-the-server) for running without it
- __`lsof`, `pgrep`, `perl`__ - used by `./server.sh` (Debian: `apt install lsof procps perl`)
- __Git__ - For version control

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/jwilleke/ngdpbase.git
cd ngdpbase
```

### 2. Install Dependencies and Build

```bash
npm install
npm run build
```

The server runs from `dist/`; `./server.sh start` stops with "dist/ not found" until it is built.

### 3. Create `.env`

[`.env.example`](.env.example) is the one list of every variable the server reads, with what each does. Copy it and edit:

```bash
cp .env.example .env
```

A minimal `.env` for a direct install needs only these. Every one is explained in [Required settings](#required-settings):

```bash
PUID=1000                      # your user id:  id -u   (macOS: typically 501)
PGID=1000                      # your group id: id -g   (macOS: typically 20)
NGDPBASE_SYSTEM_USER=system    # a name for the server itself, not an account
FAST_STORAGE=/srv/ngdpbase/data
SLOW_STORAGE=/srv/ngdpbase/data   # may be the same folder as FAST_STORAGE
PORT=3000
```

Both storage folders must be writable by `PUID`:`PGID`. The session secret, credentials key and backup key are generated into `<FAST_STORAGE>/.env` on the first start; save the backup key somewhere off the server.

### 4. Headless only: the admin password

Skip this for an interactive install (the wizard). For a headless install, add to `.env`:

```bash
HEADLESS_INSTALL=true
NGDPBASE_ADMIN_PASSWORD=<a strong password>
```

and create `<FAST_STORAGE>/config/app-custom-config.json` pointing the admin password at that variable:

```json
{
  "ngdpbase.user.security.defaultpassword": "$NGDPBASE_ADMIN_PASSWORD"
}
```

Both are needed: the server reads `NGDPBASE_ADMIN_PASSWORD` only through that config key. See [What Headless Install Does](#what-headless-install-does).

### 5. Start the Server

With PM2 (a long-running instance):

```bash
./server.sh start        # production (default)
./server.sh start dev    # development
```

Without PM2, in the foreground, from the checkout (it reads the same `.env` files; stop it with Ctrl-C):

```bash
npm start                # NODE_ENV=production node dist/src/app.js
```

### 6. Open in Browser

Visit <http://localhost:3000> (or your `PORT`).

An interactive install shows the installation wizard. A headless install is ready: sign in as `admin` with the password from step 4.

### Required settings

The server refuses to start without these. Each refusal names the setting and links here; fix them all before the next start. A refused first start writes nothing but the generated secrets above, its log and empty folders, so you can fix the setting and start again without clearing the data folder.

- `PUID` / `PGID` — the user and group the server runs as. Refused when unset, not a number, `0`, or not the user actually starting it: the server never runs as root, and must own its data folder ([#1693](https://github.com/jwilleke/ngdpbase/issues/1693)). `SLOW_STORAGE` must be writable by that user.
- `NGDPBASE_SYSTEM_USER` — the name the server acts under for its own work (startup, scheduled jobs) and records in the audit log. Refused when unset, because there is no safe default identity ([#631](https://github.com/jwilleke/ngdpbase/issues/631)). The Docker image sets it to `system`; a direct install sets it in `.env`.
- The admin password, headless only — with `HEADLESS_INSTALL=true` and no `admin` account yet, `ngdpbase.user.security.defaultpassword` must be set to something other than the shipped `admin123`, because nobody is there to change a well-known password ([#1087](https://github.com/jwilleke/ngdpbase/issues/1087)). Step 4 sets it from `NGDPBASE_ADMIN_PASSWORD`; setting the key to a password directly in `app-custom-config.json` also works.
- `NGDPBASE_ADMIN_PASSWORD` — when the config key is `"$NGDPBASE_ADMIN_PASSWORD"` and the `admin` account is about to be created, the variable must be set: an unset `$VAR` reference stops the start rather than falling back to a default.
- `NGDPBASE_SESSION_SECRET`, `NGDPBASE_CREDENTIALS_KEY`, `NGDPBASE_BACKUP_KEY` — not required, generated on the first start. Refused only when `<FAST_STORAGE>/.env` cannot be written to save a generated one, or when the session secret is set to a known placeholder value.

## Installation Wizard

On first visit, the Installation Wizard will:

1. __Configure Application__
   - Set application name
   - Set base URL

2. __Create Admin Account__
   - Set admin password (username and email are fixed)
   - Ensure password is 8+ characters

3. __Organization Information__
   - Organization name and description
   - Contact email
   - Optional: Legal name, founding date, address

4. __Startup Pages__ (optional)
   - Copy 42 default wiki pages
   - Provides starter content

Complete the form and the system will:

- Create configuration file
- Create admin user with hashed password
- Copy startup pages (if selected)
- Initialize wiki

See [docs/INSTALLATION/INSTALLATION-SYSTEM.md](./docs/INSTALLATION/INSTALLATION-SYSTEM.md) for detailed installation documentation.

## Automated Installation (Headless Mode)

For CI/CD, Docker, or Kubernetes deployments that need to skip the interactive wizard:

### Enable Headless Mode

Set the `HEADLESS_INSTALL=true` environment variable:

```bash
# Docker
HEADLESS_INSTALL=true docker-compose up -d

# Node.js direct
HEADLESS_INSTALL=true npm start
```

### What Headless Install Does

When `HEADLESS_INSTALL=true`:

- The wizard is skipped; the first request writes the `.install-complete` marker
- On the first start, the `admin` account is created with the password from `ngdpbase.user.security.defaultpassword`, as on any new instance. Headless, that password must not be the shipped `admin123`, or the start is refused before the account is written. `NGDPBASE_ADMIN_PASSWORD` is used only when that key is set to `"$NGDPBASE_ADMIN_PASSWORD"` (Quick Start step 4)
- Required pages are seeded at start, as on every install
- No configuration file is created: supply `<FAST_STORAGE>/config/app-custom-config.json` yourself, or use the environment variables below

### Security Note

An __interactive__ install creates `admin` with the shipped password `admin123`, so the wizard is reachable; the startup banner warns until it is changed. A __headless__ install refuses that password, because nobody is there to change it: set the admin password as in [Quick Start step 4](#4-headless-only-the-admin-password) (or set `ngdpbase.user.security.defaultpassword` directly in `app-custom-config.json`). A bare `$VAR` reference is strict, so an unset variable stops the start rather than silently using the default. Either way, change the password after the first sign-in.

### Pre-configuring via Environment Variables

Settings owned by the environment (application name, base URL and the others listed in `.env.example`) can be passed this way, on top of the [required settings](#required-settings):

```bash
HEADLESS_INSTALL=true \
NGDPBASE_APP_NAME="My Site" \
NGDPBASE_BASE_URL="https://site.example.com" \
npm start
```

See [docker/DOCKER.md](./docker/DOCKER.md) for complete Docker headless deployment guide.

## Configuration

### Environment Variables

[`.env.example`](.env.example) lists every variable the server reads and what each does; [Required settings](#required-settings) lists the ones a start refuses without.

### Configuration Files

- `config/app-default-config.json` - Default settings (1150+ properties)
- `config/app-development-config.json` - Dev overrides
- `config/app-production-config.json` - Prod overrides
- `config/app-custom-config.json` - Custom overrides (created by installation)

See [docs/architecture/](./docs/architecture/) for configuration system details.

### Common operator topics

- [docs/admin/Self-Registration.md](./docs/admin/Self-Registration.md) — disable the public `/register` form and route visitors to a "Request access" page (any deploy mode)
- [docs/admin/email-setup.md](./docs/admin/email-setup.md) — outbound mail (magic-link login, contact form)
- [docs/admin/Backups.md](./docs/admin/Backups.md) — backup configuration
- [docs/admin/Telemetry.md](./docs/admin/Telemetry.md) — metrics and observability
- [docs/admin/Versioning-Deployment-Guide.md](./docs/admin/Versioning-Deployment-Guide.md) — page-versioning storage layout

## Server Management

### Start Server

```bash
# Development mode
./server.sh start dev

# Production mode
./server.sh start prod
```

### Stop Server

```bash
./server.sh stop
```

### Restart Server

```bash
./server.sh restart dev    # Restart in dev mode
./server.sh restart prod   # Restart in prod mode
```

### Check Status

```bash
./server.sh status
```

### View Logs

```bash
./server.sh logs          # View latest logs
./server.sh logs 50       # View last 50 lines
```

### Emergency Cleanup

```bash
./server.sh unlock        # Kill all processes and clear locks
```

See [docs/SERVER.md](./docs/SERVER.md) for complete server management guide.

## Project Structure

```
ngdpbase/
├── src/                   # Source code
│   ├── managers/          # Business logic managers
│   ├── routes/            # Express routes
│   ├── services/          # Services
│   ├── plugins/           # Plugin system
│   └── utils/             # Utilities
├── config/                # Configuration files
├── pages/                 # Wiki pages (generated)
├── users/                 # User data (generated)
├── docs/                  # Documentation
├── views/                 # EJS templates
├── public/                # Static files
├── required-pages/        # Default startup pages
└── scripts/               # Utility scripts
```

## Development Workflow

### Run Tests

```bash
npm test                   # Run all tests
npm run test:coverage      # With coverage report
npm run test:watch        # Watch mode
```

### Type Checking

```bash
npm run typecheck         # TypeScript checking
```

### Build Project

```bash
npm run build             # Build project
```

### Code Formatting

```bash
npm run format            # Format code with Prettier
npm run lint              # Run linter
```

## File-Based Storage

ngdpbase uses file-based storage:

- __Pages__: `pages/` directory (UUID-named .md files)
- __Users__: `users/` directory (users.json, organizations.json)
- __Config__: `config/` directory (.json files)
- __Versions__: Delta-based storage (80-95% space savings)

No database required - fully local-first capable.

## Running Behind Proxy

If running behind a reverse proxy (nginx, Apache, etc.):

1. Set `ngdpbase.base-url` to your public URL
2. Ensure proxy passes X-Forwarded-For headers
3. Configure PM2 for your reverse proxy

See [docs/SERVER-MANAGEMENT.md](./docs/SERVER-MANAGEMENT.md) for proxy configuration.

## Docker Support

See [docs/SERVER-MANAGEMENT.md](./docs/SERVER-MANAGEMENT.md) for Docker deployment information.

## Troubleshooting

### Port Already in Use

```bash
./server.sh unlock        # Clear locks and try again
./server.sh start         # Restart
```

### Installation Loop

If form keeps looping:

1. Check server logs: `./server.sh logs`
2. Verify all required fields filled
3. Try again or reset: `POST /install/reset`

### Lost Admin Password

Admin password cannot be recovered. Reset via code modification:

```javascript
// In src/services/InstallService.js
// Modify the password hash and restart
```

## Performance Tuning

### For Production

1. Set `NODE_ENV=production`
2. Use PM2 clustering: `ecosystem.config.js`
3. Configure caching in ConfigurationManager
4. Monitor logs for errors

### Cache Configuration

- Page caching via NodeCache
- Configuration caching hierarchical
- Delta storage for versions
- Bootstrap 5 for responsive UI

## Security Setup

For production:

1. Read [SECURITY.md](./SECURITY.md)
2. Generate strong admin password
3. Use reverse proxy with HTTPS
4. Configure CORS properly
5. Set appropriate file permissions

## Monitoring

### PM2 Monitoring

```bash
pm2 status              # Process status
pm2 logs               # View logs
pm2 stop all           # Stop all processes
pm2 delete all         # Remove from PM2
```

### Health Checks

Check server health:

```bash
curl http://localhost:3000/
```

## Next Steps

1. __Read CONTRIBUTING.md__ for development guidelines
2. __Review ARCHITECTURE.md__ for system design
3. __Check docs/planning/TODO.md__ for current tasks
4. __See DOCUMENTATION.md__ for all available guides

## Getting Help

- __Installation issues__: See [docs/INSTALLATION/INSTALLATION-SYSTEM.md](./docs/INSTALLATION/INSTALLATION-SYSTEM.md)
- __Server problems__: See [docs/SERVER.md](./docs/SERVER.md)
- __Development help__: See [CONTRIBUTING.md](./CONTRIBUTING.md)
- __Security concerns__: See [SECURITY.md](./SECURITY.md)

## Related Documentation

- [README.md](./README.md) - Project overview
- [docs/INSTALLATION/INSTALLATION-SYSTEM.md](./docs/INSTALLATION/INSTALLATION-SYSTEM.md) - Installation wizard details
- [docs/SERVER.md](./docs/SERVER.md) - Server management
- [DOCUMENTATION.md](./DOCUMENTATION.md) - All documentation index
