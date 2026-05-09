# Setup & Installation

Quick setup instructions for getting ngdpbase running locally or in production.

## Prerequisites

- **Node.js v18+** - [Download](https://nodejs.org/)
- **npm** - Included with Node.js
- **PM2** (for production) - `npm install -g pm2`
- **Git** - For version control

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/jwilleke/ngdpbase.git
cd ngdpbase
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Server

```bash
# Development mode
./server.sh start dev

# Production mode (default)
./server.sh start prod
```

### 4. Open in Browser

Visit <http://localhost:3000>

The installation wizard will guide you through first-time setup.

## Installation Wizard

On first visit, the Installation Wizard will:

1. **Configure Application**
   - Set application name
   - Set base URL

2. **Create Admin Account**
   - Set admin password (username and email are fixed)
   - Ensure password is 8+ characters

3. **Organization Information**
   - Organization name and description
   - Contact email
   - Optional: Legal name, founding date, address

4. **Startup Pages** (optional)
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

- Copies required startup pages to `data/pages/`
- Copies example configs to `data/config/`
- Creates `.install-complete` marker
- Uses default admin credentials (`admin` / `admin123`)
- App is immediately ready - no wizard required

### Security Note

Change the default admin password (`admin123`) immediately after first login. The wiki displays a security warning until you do.

### Pre-configuring via Environment Variables

```bash
HEADLESS_INSTALL=true \
NGDPBASE_APP_NAME="My Wiki" \
NGDPBASE_BASE_URL="https://wiki.example.com" \
NGDPBASE_SESSION_SECRET="your-secure-secret" \
npm start
```

See [docker/DOCKER.md](./docker/DOCKER.md) for complete Docker headless deployment guide.

## Configuration

### Environment Variables

```bash
NODE_ENV=development  # or production, test, staging
PORT=3000            # Server port (default: 3000)
```

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

- **Pages**: `pages/` directory (UUID-named .md files)
- **Users**: `users/` directory (users.json, organizations.json)
- **Config**: `config/` directory (.json files)
- **Versions**: Delta-based storage (80-95% space savings)

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

1. **Read CONTRIBUTING.md** for development guidelines
2. **Review ARCHITECTURE.md** for system design
3. **Check docs/planning/TODO.md** for current tasks
4. **See DOCUMENTATION.md** for all available guides

## Getting Help

- **Installation issues**: See [docs/INSTALLATION/INSTALLATION-SYSTEM.md](./docs/INSTALLATION/INSTALLATION-SYSTEM.md)
- **Server problems**: See [docs/SERVER.md](./docs/SERVER.md)
- **Development help**: See [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Security concerns**: See [SECURITY.md](./SECURITY.md)

## Related Documentation

- [README.md](./README.md) - Project overview
- [docs/INSTALLATION/INSTALLATION-SYSTEM.md](./docs/INSTALLATION/INSTALLATION-SYSTEM.md) - Installation wizard details
- [docs/SERVER.md](./docs/SERVER.md) - Server management
- [DOCUMENTATION.md](./DOCUMENTATION.md) - All documentation index
