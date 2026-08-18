# ngdpbase

A file-based wiki application built with __Node.js__, __Express__, __TypeScript__, and __Markdown__, inspired by [JSPWiki](https://github.com/apache/jspwiki).

📋 __See [docs/planning/ROADMAP.md](docs/planning/ROADMAP.md) for project vision, technical specifications, and feature priorities.__

## Features

- Create, view, and edit wiki pages
- Advanced search with multi-criteria filtering
- JSPWiki-style link syntax with pipe notation
- Category and keyword-based organization
- Red link detection for non-existent pages
- Three-state authentication system
- Professional UI with Bootstrap styling
- Pages are stored as Markdown files
- __Inline image support with upload functionality__
- __Plugin system for extensible functionality__
- __Policy-Based Access Control__: Advanced permission system with JSON configuration
- __Comprehensive Audit Trail__: Complete security monitoring and access logging
- __Time-Based Permissions__: Context-aware permissions with scheduling and maintenance mode
- __Admin Dashboard__: Full administrative interface for user management and system monitoring
- __WikiDocument DOM Architecture__: Robust, JSPWiki-inspired parsing engine with DOM-based processing
- __Conflict-Free Parsing__: JSPWiki syntax and Markdown coexist without interference
- __📚 Page Version History__: Complete version control with diff comparison and restore capabilities
  - View all previous versions of any page
  - Compare versions side-by-side or unified diff
  - Restore to any previous version
  - Automatic delta storage for efficiency
  - Full version metadata tracking
- __🤖 Model Context Protocol (MCP) Server__: AI assistant integration for enhanced productivity
  - Direct AI access to wiki content and metadata
  - Full-text search with advanced filtering
  - Metadata validation and generation
  - 12 specialized tools for wiki operations
  - Integration with Claude Desktop and Claude Code CLI

📖 __Detailed technical documentation available in [docs/](docs/) folder.__

## Getting Started

### For Users

1. Install dependencies:

    ```bash
    npm install
    ```

2. Start the server:

    ```bash
    ./server.sh start          # Production mode (default)
    # or
    ./server.sh start dev      # Development mode
    ```

3. Open your browser and navigate to `http://localhost:3000`

__Server Management:__

```bash
./server.sh start [dev|prod]   # Start server (default: production)
./server.sh stop               # Stop server
./server.sh restart [dev|prod] # Restart server
./server.sh status             # Show server status
./server.sh logs [50]          # Show logs (default: 50 lines)
./server.sh env                # Show environment config
./server.sh unlock             # Remove PID lock (if server crashed)
```

### For Developers

- Follow the setup steps above
- The codebase uses __TypeScript with strict mode__ enabled
- Read [CONTRIBUTING.md](CONTRIBUTING.md) for coding standards, TypeScript guidelines, and contribution guidelines
- Check [CHANGELOG.md](CHANGELOG.md) for version history and migration notes

__TypeScript Commands:__

```bash
npm run typecheck       # Type checking (no output)
npm run build           # Build TypeScript to JavaScript
npm run build:watch     # Watch mode for development
npm test                # Run all tests (supports .ts and .js)
```

### For AI Integration (MCP Server)

ngdpbase includes a Model Context Protocol (MCP) server for AI assistant integration:

```bash
# Build TypeScript
npm run build

# Start MCP server
npm run mcp
```

__Integration with Claude Desktop:__
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ngdpbase": {
      "command": "node",
      "args": ["/path/to/ngdpbase/dist/mcp-server.js"],
      "cwd": "/path/to/ngdpbase"
    }
  }
}
```

📖 __See [docs/MCP-SERVER.md](docs/MCP-SERVER.md) for complete documentation.__

## Configuration

ngdpbase uses a __hierarchical configuration system__ with three layers (later overrides earlier):

1. `config/app-default-config.json` - Base defaults (required, ~1150 properties)
2. `config/app-{environment}-config.json` - Environment-specific settings (optional)
   - Environment determined by `NODE_ENV` (development, production, test)
3. `config/app-custom-config.json` - Local overrides (optional, persisted by admin UI)

### Making Configuration Changes

__Via Admin UI:__

- Navigate to [/admin/configuration](/admin/configuration)
- Changes saved to `app-custom-config.json`
- Restart required: [/admin/restart](/admin/restart)

__Manual Editing:__

- Edit `config/app-custom-config.json` directly
- Restart server to apply changes:

  ```bash
  ./server.sh restart
  ```

### Key Configuration Properties

```json
{
  "ngdpbase.application-name": "ngdpbase",
  "ngdpbase.server.port": 3000,
  "ngdpbase.base-url": "http://localhost:3000",
  "ngdpbase.front-page": "Welcome",
  "ngdpbase.page.provider": "filesystemprovider",
  "ngdpbase.backup.auto-backup": true
}
```

__Note:__ Properties starting with `_` are treated as comments and ignored.

### Operator Guides

For deploy-time and runtime operator topics see `docs/admin/`:

- [Self-Registration](./docs/admin/Self-Registration.md) — disable the public `/register` form
- [Email Setup](./docs/admin/email-setup.md) — outbound mail (magic-link login, contact form)
- [Backups](./docs/admin/Backups.md) — backup configuration
- [Telemetry](./docs/admin/Telemetry.md) — metrics and observability
- [Versioning Deployment Guide](./docs/admin/Versioning-Deployment-Guide.md) — page-versioning storage layout

## Project Structure

```bash
ngdpbase/
├── src/                    # Source code
│   ├── core/              # Core engine components
│   ├── managers/          # 30 domain-specific managers
│   ├── plugins/           # Auto-discovered plugin modules
│   ├── providers/         # Storage provider implementations
│   ├── parsers/           # WikiDocument DOM parser
│   │   ├── dom/          # DOM handlers and WikiDocument
│   │   └── __tests__/    # Parser test suites
│   ├── routes/            # HTTP route handlers
│   ├── types/             # Shared TypeScript interfaces
│   └── utils/             # Utility functions
├── addons/                # Domain addon packages (calendar, forms, journal, elasticsearch)
├── config/                # Application configuration
│   ├── app-default-config.json        # Base defaults (~1150 properties)
│   ├── app-{env}-config.json          # Environment-specific
│   └── app-custom-config.json         # Local overrides
├── public/                # Static assets (CSS, JS, images)
├── views/                 # EJS templates
├── docs/                  # Documentation
│   ├── architecture/      # System architecture docs
│   ├── development/       # Development guides
│   ├── planning/          # Project planning docs
│   ├── api/              # API documentation
│   ├── migration/        # Migration guides
│   ├── testing/          # Testing documentation
│   └── managers/         # Manager documentation
├── scripts/               # Utility scripts
├── templates/             # Wiki page templates
├── themes/                # UI themes
├── required-pages/        # System pages seeded on first boot
├── data/                  # All instance-specific runtime data
│   ├── pages/            # User-created wiki pages
│   ├── users/            # User accounts and profiles
│   ├── attachments/      # Uploaded file storage
│   ├── backups/          # System backups (BackupManager)
│   ├── logs/             # Application logs
│   ├── sessions/         # Express session store
│   └── search-index/     # Search index files
├── exports/               # Exported content
├── reports/               # Test coverage reports
└── coverage/              # Istanbul coverage data
```

📖 __Detailed project structure documentation available in [docs/architecture/PROJECT-STRUCTURE.md](docs/architecture/PROJECT-STRUCTURE.md)__

## Examples

__Creating a Wiki Page Link (JSPWiki Syntax):__

```markdown
[Link Text|PageName]  # Links to PageName with custom text
[PageName]           # Simple link to PageName
```

__Inserting Images (JSPWiki Plugin Syntax):__

```markdown
[{Image src='image.jpg' alt='Description' width='300'}]  # Basic image
[{Image src='/images/photo.jpg' alt='Photo' height='200'}]  # With height
[{Image src='https://example.com/image.png' class='responsive'}]  # External image
```

__Image Upload:__

- Use the image upload section in the page editor
- Select an image file and click "Upload Image"
- Click "Insert at Cursor" to add the image to your content
- Supported formats: JPEG, PNG, GIF, WebP (max 5MB)

## Parser Architecture

ngdpbase uses a __WikiDocument DOM extraction pipeline__ that provides robust, conflict-free parsing of JSPWiki syntax and Markdown:

### How It Works

1. __Extract__ - JSPWiki syntax (`[{$var}]`, `[{Plugin}]`, `[Link]`) extracted before Markdown parsing
2. __Create DOM Nodes__ - WikiDocument DOM nodes created for each JSPWiki element
3. __Parse Markdown__ - Showdown processes ALL Markdown without JSPWiki interference
4. __Merge__ - DOM nodes merged back into final HTML

### Benefits

- ✅ __No parsing conflicts__ - JSPWiki and Markdown processed independently
- ✅ __Correct heading rendering__ - All Markdown headings (`##`, `###`) render properly
- ✅ __Natural escaping__ - `[[{$var}]]` creates literal text via DOM nodes
- ✅ __Extensible__ - Easy to add custom syntax via DOM handlers
- ✅ __Production-ready__ - 376+ tests with 100% success rate

### Parser Configuration

The WikiDocument DOM parser is enabled by default. To use the legacy parser, add to `config/app-custom-config.json`:

```json
{
  "jspwiki.parser.useExtractionPipeline": false
}
```

Then restart the server (see [Configuration](#configuration) section above).

### Documentation

- __API Reference:__ [docs/api/MarkupParser-API.md](docs/api/MarkupParser-API.md)
- __Migration Guide:__ [docs/migration/WikiDocument-DOM-Migration.md](docs/migration/WikiDocument-DOM-Migration.md)
- __Architecture:__ [docs/architecture/WikiDocument-DOM-Architecture.md](docs/architecture/WikiDocument-DOM-Architecture.md)

## Documentation

- [CHANGELOG.md](CHANGELOG.md) - Version history and detailed change notes.
- [RELEASES.md](RELEASES.md) - Publishing contract for downstream consumers (geohazardwatch, mj-infra-flux, etc.) — what ngdpbase publishes, when, and where.
- [CONTRIBUTING.md](CONTRIBUTING.md) - How to contribute to the project.
- [ROADMAP.md](ROADMAP.md) - Project vision and feature priorities.
- [docs/](docs/) - In-depth technical guides on architecture, plugins, and more.

## Version Management

This project follows [Semantic Versioning](https://semver.org/) (SemVer). Use the built-in version management tools:

### Check Current Version

```bash
npm run version:show
# or
node scripts/version.js
```

### Increment Version

```bash
npm run version:patch    # Bug fixes (1.2.0 → 1.2.1)
npm run version:minor    # New features (1.2.0 → 1.3.0)
npm run version:major    # Breaking changes (1.2.0 → 2.0.0)
```

### Set Specific Version

```bash
node scripts/version.js set 1.2.3
```

### Version Help

```bash
npm run version:help
```

The version management script automatically:

- Updates `package.json` version
- Updates `CHANGELOG.md` with release information
- Validates version format
- Provides semantic versioning guidance

## License

See [LICENSE](LICENSE) for details on usage and distribution.
