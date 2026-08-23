# Contributing to ngdpbase

Welcome! We appreciate your interest in contributing to ngdpbase, a JSPWiki-inspired file-based wiki built with Node.js.

📖 __First time here?__ Read [README.md](README.md) for project overview, features, and structure.

## 🚀 Quick Start

1. __Fork__ the repository
2. __Clone__ your fork: `git clone https://github.com/your-username/ngdpbase.git`
3. __Install__ dependencies: `npm install`
4. __Start__ development server: `./server.sh start dev`
5. __Test__ your changes: `npm test`

## Server Management

ngdpbase uses `server.sh` for all server operations. See [SERVER.md](SERVER.md) for detailed documentation.

__Common Commands:__

```bash
./server.sh start [dev|prod]   # Start server (default: production)
./server.sh stop               # Stop server
./server.sh restart [dev|prod] # Restart server
./server.sh status             # Show server status
./server.sh logs [50]          # Show logs (default: 50 lines)
./server.sh env                # Show environment config
./server.sh unlock             # Remove PID lock (if server crashed)
```

__Note:__ Always use `./server.sh` instead of direct `npm start` or `pm2` commands for proper environment configuration and PID lock management.

### Log Locations Summary

  | Type        | Location                      | Purpose                             |
  |-------------|-------------------------------|-------------------------------------|
  | PM2 Output  | ~/.pm2/logs/ngdpbase-out.log   | Real-time stdout, startup messages  |
  | PM2 Errors  | ~/.pm2/logs/ngdpbase-error.log | Real-time stderr, plugin errors     |
  | Application | ./data/logs/app.log           | Winston logger, detailed operations |
  | Audit       | ./data/logs/audit.log         | Security/audit events               |

## ⚙️ Configuration System

ngdpbase uses a __hierarchical configuration system__ with three layers that merge in priority order:

1. `config/app-default-config.json` - Base defaults (required, ~1150 properties)
2. `data/config/app-{environment}-config.json` - Environment-specific settings (optional)
   - Environment determined by `NODE_ENV` (development, production, test)
   - Loaded via `./server.sh start [dev|prod]`
3. `data/config/app-custom-config.json` - Local overrides (optional, persisted by admin UI)

### Configuration Workflow for Contributors

__During Development:__

- Edit `data/config/app-custom-config.json` for local testing
- Never commit instance configs in `data/config/` (in .gitignore)
- Test with both dev and prod configs

__Adding New Configuration Properties:__

1. Add to `config/app-default-config.json` with sensible defaults
2. Document in manager's JSDoc comments
3. Add getter method in ConfigurationManager (if needed)
4. Update relevant documentation

__Applying Configuration Changes:__

```bash
# After editing any config file
./server.sh restart [dev|prod]
```

__Via Admin UI:__

- Navigate to `/admin/configuration`
- Changes automatically saved to `data/config/app-custom-config.json`
- Restart required: `/admin/restart` or `./server.sh restart`

### Configuration Property Naming

Follow JSPWiki-style naming conventions:

```javascript
"ngdpbase.{category}.{property}": value
"ngdpbase.page.provider": "filesystemprovider"
"ngdpbase.backup.auto-backup": true
"jspwiki.parser.useExtractionPipeline": true
```

__Note:__ Properties starting with `_` are treated as comments and ignored during loading (see ConfigurationManager.ts).

## 🏗️ Architecture Overview

ngdpbase follows a __manager-based architecture__ inspired by JSPWiki:

- __WikiEngine__ - Central orchestrator (`src/WikiEngine.ts`)
- __Managers__ - Modular functionality (`src/managers/`)
- __MarkupParser__ - WikiDocument DOM extraction pipeline (`src/parsers/MarkupParser.ts`)
- __WikiDocument__ - DOM-based JSPWiki element representation (`src/parsers/dom/WikiDocument.ts`)
- __DOM Handlers__ - Variable, plugin, and link processing (`src/parsers/dom/handlers/`)
- __Plugins__ - Extensible features (`plugins/`)
- __File-based storage__ - Pages as Markdown files (`data/pages/`)
- __Additional technical guides in [docs/](docs/) folder__, such as testing and manager development.

📖 __Read [ARCHITECTURE-PAGE-CLASSIFICATION.md](ARCHITECTURE-PAGE-CLASSIFICATION.md)__ for detailed architecture patterns.

### WikiDocument DOM Parsing Architecture

ngdpbase uses a __three-phase extraction pipeline__ that separates JSPWiki syntax processing from Markdown parsing:

```text
Content → Extract JSPWiki → Create DOM Nodes → Showdown → Merge → HTML
```

__Key Components:__

- __MarkupParser__ - Main parser orchestrator
- __extractJSPWikiSyntax()__ - Phase 1: Extract JSPWiki syntax with placeholders
- __createDOMNode()__ - Phase 2: Create WikiDocument DOM nodes via handlers
- __mergeDOMNodes()__ - Phase 3: Replace placeholders with rendered nodes
- __DOMVariableHandler__ - Handles `[{$variable}]` syntax
- __DOMPluginHandler__ - Handles `[{Plugin param="value"}]` syntax
- __DOMLinkHandler__ - Handles `[PageName]` and `[Text|Target]` syntax

__Benefits:__

- No parsing conflicts between JSPWiki and Markdown
- Correct heading rendering (fixes #110, #93)
- Natural escaping via DOM text nodes
- 376+ tests with 100% success rate

📖 __Read [docs/architecture/WikiDocument-DOM-Architecture.md](docs/architecture/WikiDocument-DOM-Architecture.md)__ for complete architecture details.

### Session Management Architecture

ngdpbase uses __express-session__ for session management (standard Express middleware):

__Session Setup (app.js):__

```javascript
const session = require('express-session');

app.use(session({
  secret: configManager.getProperty('ngdpbase.session.secret', 'change-in-production'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,        // Set to true in production with HTTPS
    httpOnly: true,       // Prevent XSS
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
}));
```

__User Context Middleware (app.js):__

```javascript
app.use(async (req, res, next) => {
  const userManager = engine.getManager('UserManager');

  if (req.session && req.session.username && req.session.isAuthenticated) {
    // Load full user from UserManager (via provider)
    const user = await userManager.getUser(req.session.username);

    if (user && user.isActive) {
      req.userContext = {
        ...user,
        roles: [...user.roles, 'Authenticated', 'All'],
        isAuthenticated: true
      };
    } else {
      req.userContext = userManager.getAnonymousUser();
    }
  } else {
    req.userContext = userManager.getAnonymousUser();
  }

  next();
});
```

__Key Points:__

- ✅ __Standard express-session__ - No custom session middleware
- ✅ __UserManager Provider Pattern__ - Session loads user via FileUserProvider
- ✅ __req.userContext__ - Available on all routes with full user data
- ✅ __Async User Loading__ - Always `await userManager.getUser()`
- ❌ __No src/middleware/session.js__ - Removed (legacy)

__Login Flow:__

1. User submits credentials to `/login`
2. `userManager.authenticateUser()` validates credentials
3. `req.session.username` and `req.session.isAuthenticated` set
4. On next request, middleware loads full user via `userManager.getUser()`
5. `req.userContext` populated for route handlers

__UserManager Methods (Async):__

```javascript
// All these methods are async and require await
await userManager.getUser(username)
await userManager.authenticateUser(username, password)
await userManager.hasRole(username, roleName)
await userManager.getSession(sessionId)
```

### WikiContext - Single Source of Truth

📖 __Full reference: [docs/WikiContext-Complete-Guide.md](docs/WikiContext-Complete-Guide.md)__

__`WikiContext`__ (`src/context/WikiContext.ts`) is the request-scoped container for all page, user, and engine context. All rendering and access-control flows through it.

__The two rules:__

```typescript
// 1. Always create via the factory in route handlers
const wikiContext = this.createWikiContext(req, {
  context: WikiContext.CONTEXT.VIEW,  // VIEW | EDIT | PREVIEW | DIFF | INFO | NONE
  pageName,
  content,   // optional
});

// 2. Always get template data via the extractor
const templateData = this.getTemplateDataFromContext(wikiContext);
res.render('template-name', { ...templateData, content: html });
```

__Key properties__ (all `readonly`):

| Property | Type | Description |
|---|---|---|
| `pageName` | `string \| null` | Current page |
| `userContext` | `UserContext \| null` | User — use `.authenticated`, not `.isAuthenticated` |
| `request` / `response` | `Request \| null` | Express objects |
| `engine` | `WikiEngine` | Engine instance |
| `pageManager`, `renderingManager`, `pluginManager`, `variableManager`, `aclManager` | managers | Direct manager shortcuts |

__DO:__

- ✅ Use `createWikiContext()` in every route handler
- ✅ Use `getTemplateDataFromContext()` for all template rendering
- ✅ Pass `WikiContext` to managers and access-control helpers
- ✅ Use `userContext.authenticated` (typed field) not `userContext.isAuthenticated`

__DO NOT:__

- ❌ Pass `req.userContext` directly to templates
- ❌ Construct template data objects manually
- ❌ Create a new `WikiContext` per sub-operation in the same request — reuse the one you have

## 📦 Key Dependencies

### Versioning & Storage Libraries

__fast-diff__ - Text diffing for delta storage

- __Purpose__: Efficiently store page versions as diffs instead of full copies
- __Algorithm__: Myers diff algorithm (similar to git)
- __Usage__: `src/utils/DeltaStorage.js`
- __Why chosen__: Lightweight (no dependencies), fast, battle-tested algorithm
- __Space savings__: 80-95% reduction for text-heavy content
- __Documentation__: [fast-diff on npm](https://www.npmjs.com/package/fast-diff)

__pako__ - gzip compression/decompression

- __Purpose__: Compress old version files to save disk space
- __Implementation__: Pure JavaScript gzip (RFC 1952)
- __Usage__: `src/utils/VersionCompression.js`
- __Why chosen__: Pure JavaScript (no native bindings), works in Node.js and browsers
- __Compression__: 60-80% size reduction typical for text
- __Documentation__: [pako on npm](https://www.npmjs.com/package/pako)

### Versioning Implementation

The VersioningFileProvider uses delta storage + compression for efficient version management:

```text
v1: full_content.md                    (100 KB)
v2: diff_from_v1.diff.gz               (2 KB)
v3: diff_from_v2.diff.gz               (1.5 KB)
v4: diff_from_v3.diff.gz               (2.2 KB)
```

__Storage efficiency__:

- Without versioning: 400 KB (4 versions × 100 KB each)
- With delta storage: 105.7 KB (74% space savings)
- Reconstruction: Load v1, apply diffs sequentially

__See also__:

- `src/utils/DeltaStorage.js` - Diff creation and application
- `src/utils/VersionCompression.js` - Compression utilities
- `src/providers/BasePageProvider.js` - Versioning methods interface
- [Phase 1 Implementation](https://github.com/jwilleke/ngdpbase/issues/125)

## 🔧 Development Guidelines

### Critical requirements

- [CHANGELOG.md](./CHANGELOG.md) ALL notable changes to are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) [CHANGELOG.md]
- [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- Markdownlint Configuration using (.markdownlint.json)
- Use of Open Standards
  - [Schema.org](https://schema.org/) when possible.
- 📖 __Read [ARCHITECTURE-PAGE-CLASSIFICATION.md](ARCHITECTURE-PAGE-CLASSIFICATION.md)__ for detailed architecture patterns.

### Code Style

- Use __CommonJS__ modules (`require/module.exports`) with TypeScript
- Follow __existing patterns__ in manager creation and route handling
- __ESLint__ and __Prettier__ compliance (if configured)
- Use __meaningful variable names__ and JSDoc/TSDoc comments
- __Required__: Comprehensive JSDoc documentation for all classes, methods, and functions (see below)

## 🔷 TypeScript Guidelines

ngdpbase is migrating to TypeScript with strict mode enabled. All new code should be written in TypeScript.

### TypeScript Setup

The project uses TypeScript with the following configuration:

- __Strict mode enabled__ (`strict: true`)
- __CommonJS output__ for Node.js compatibility
- __ES2022 target__ for modern JavaScript features
- __Vitest__ for testing TypeScript files (native TS, no transform step)

### Writing TypeScript Code

#### File Extensions

- Use `.ts` for new source files
- Use `.test.ts` for new test files (legacy `.test.js` files work alongside)
- Type definition files use `.d.ts`

#### Type Annotations

```typescript
// Always type function parameters and return values
async function getPage(pageName: string): Promise<PageData | null> {
  // ...
}

// Use interfaces for complex types
interface PageData {
  title: string;
  content: string;
  metadata: PageMetadata;
}

// Type class properties
class ExampleManager extends BaseManager {
  private cache: Map<string, PageData>;
  private initialized: boolean = false;

  constructor(engine: WikiEngine) {
    super(engine);
    this.cache = new Map();
  }
}
```

#### Manager Pattern (TypeScript)

```typescript
import BaseManager from './BaseManager';
import type { WikiEngine } from '../types/WikiEngine';
import type ConfigurationManager from './ConfigurationManager';

class NewManager extends BaseManager {
  private provider: SomeProvider | null = null;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    // Use type assertion for getManager calls
    const configManager = this.engine.getManager('ConfigurationManager') as ConfigurationManager | undefined;
    if (!configManager) {
      throw new Error('NewManager requires ConfigurationManager');
    }

    // Manager initialization...
  }
}

export default NewManager;
```

#### DOM Types (linkedom)

When working with WikiDocument DOM elements, use the exported types:

```typescript
import type { LinkedomElement, LinkedomNode } from '../parsers/dom/WikiDocument';

function processElement(element: LinkedomElement): void {
  const className = element.className;
  const tagName = element.tagName;
  element.setAttribute('data-processed', 'true');
}

// LinkedomNodeList doesn't support for...of - use index-based loops
const elements = wikiDocument.querySelectorAll('.wiki-plugin');
for (let i = 0; i < elements.length; i++) {
  const element = elements[i] as LinkedomElement;
  // Process element...
}
```

#### Type Safety Patterns

```typescript
// Both forms work — generics are supported by getManager<T>():
// ✅ Generic form (used internally in WikiContext.ts)
const manager = engine.getManager<PageManager>('PageManager');

// ✅ Type assertion form — equivalent, use consistently within a file
const manager = engine.getManager('PageManager') as PageManager | undefined;

// Use unknown instead of any where possible
function processData(data: unknown): void {
  if (typeof data === 'string') {
    // TypeScript now knows data is string
  }
}

// Export types for reuse
export interface PluginContext {
  pageName: string;
  userName: string;
  engine: WikiEngine;
  // ...
}
```

### Running TypeScript

```bash
# Type checking (no output)
npm run typecheck

# Build TypeScript to JavaScript
npm run build

# Watch mode for development
npm run build:watch
```

### ESLint for TypeScript

The project uses `typescript-eslint` for linting. Key rules:

- `@typescript-eslint/explicit-function-return-type` - Require return types
- `@typescript-eslint/no-explicit-any` - Prefer `unknown` over `any`
- `@typescript-eslint/no-unused-vars` - No unused variables

See `eslint.config.js` for full configuration.

## 📚 JSDoc Documentation Standards

__All code MUST include comprehensive JSDoc documentation.__ The entire codebase (~95% of core architecture) is fully documented with JSDoc, and all new contributions must maintain this standard.

### JSDoc Requirements

#### 1. __Class Documentation__

Every class must have a JSDoc block with:

- Class description explaining purpose and functionality
- `@class` tag
- `@extends` tag (if applicable)
- `@abstract` tag (for abstract classes)
- `@property` tags documenting all class properties
- `@see` references to related classes
- `@example` showing real-world usage

```javascript
/**
 * ExampleManager - Brief description of manager purpose
 *
 * Detailed description explaining what this manager does, its role in the
 * architecture, and any important implementation details or patterns used.
 *
 * Key features:
 * - Feature 1 description
 * - Feature 2 description
 * - Feature 3 description
 *
 * @class ExampleManager
 * @extends BaseManager
 *
 * @property {WikiEngine} engine - Reference to the wiki engine
 * @property {boolean} initialized - Whether manager has been initialized
 * @property {Map<string, Object>} dataCache - Cache of processed data
 *
 * @see {@link BaseManager} for base functionality
 * @see {@link RelatedManager} for related operations
 *
 * @example
 * const exampleManager = engine.getManager('ExampleManager');
 * const result = await exampleManager.performOperation('input');
 */
class ExampleManager extends BaseManager {
  // ...
}
```

#### 2. __Constructor Documentation__

```javascript
/**
 * Creates a new ExampleManager instance
 *
 * @constructor
 * @param {WikiEngine} engine - The wiki engine instance
 * @throws {Error} If engine is not provided
 */
constructor(engine) {
  super(engine);
  this.dataCache = new Map();
}
```

#### 3. __Method Documentation__

Every method must document:

- Purpose and behavior
- All parameters with types
- Return value with type
- Exceptions/errors thrown
- Async/promise handling
- Examples for complex methods

```javascript
/**
 * Process data with optional filtering
 *
 * Performs data processing with configurable options and returns
 * the processed result. Supports filtering by various criteria.
 *
 * @async
 * @param {string} input - Input data to process
 * @param {Object} [options={}] - Processing options
 * @param {boolean} [options.filter=false] - Enable filtering
 * @param {string[]} [options.categories] - Filter by categories
 * @returns {Promise<Object>} Processed data
 * @returns {string} result.output - Processed output
 * @returns {Object} result.metadata - Processing metadata
 * @throws {Error} If input is invalid
 * @throws {ValidationError} If options fail validation
 *
 * @example
 * const result = await manager.processData('input', {
 *   filter: true,
 *   categories: ['General']
 * });
 * console.log(result.output);
 */
async processData(input, options = {}) {
  // Implementation
}
```

#### 4. __Private/Protected Methods__

```javascript
/**
 * Internal helper method for data validation
 *
 * @private
 * @param {Object} data - Data to validate
 * @returns {boolean} True if valid
 */
#validateData(data) {
  // Implementation
}
```

#### 5. __Type Definitions__

For complex data structures:

```javascript
/**
 * Search result structure
 * @typedef {Object} SearchResult
 * @property {string} name - Page name/identifier
 * @property {string} title - Page title
 * @property {number} score - Relevance score (0-1)
 * @property {string} snippet - Content snippet with highlights
 * @property {Object} metadata - Additional metadata
 */
```

#### 6. __Provider Interface Documentation__

```javascript
/**
 * BaseExampleProvider - Abstract interface for example providers
 *
 * All example providers must extend this class and implement its methods.
 * Providers handle storage/retrieval from different backends.
 *
 * @class BaseExampleProvider
 * @abstract
 *
 * @property {WikiEngine} engine - Reference to the wiki engine
 * @property {boolean} initialized - Whether provider has been initialized
 *
 * @see {@link ConcreteProvider} for filesystem implementation
 * @see {@link ExampleManager} for usage
 */
```

### JSDoc Best Practices

#### DO

- ✅ Document ALL public classes, methods, and functions
- ✅ Include detailed descriptions explaining "why" not just "what"
- ✅ Provide type information for all parameters and returns
- ✅ Add examples for complex APIs
- ✅ Cross-reference related classes with `@see`
- ✅ Document exceptions with `@throws`
- ✅ Use `@async` for async methods
- ✅ Include configuration keys in comments
- ✅ Document JSPWiki patterns and architecture

#### DON'T

- ❌ Skip documentation for "simple" methods
- ❌ Use vague descriptions like "does something"
- ❌ Omit parameter types or return types
- ❌ Leave complex methods without examples
- ❌ Document implementation details that change frequently
- ❌ Use inconsistent formatting

### Generating Documentation

Generate HTML documentation from JSDoc comments:

```bash
# Install JSDoc globally (if needed)
npm install -g jsdoc

# Generate documentation
npx jsdoc -c jsdoc.json

# View generated docs
open ./jsdocs/index.html
```

The `jsdoc.json` configuration is already set up in the project root.

### IDE Integration

JSDoc provides excellent IDE support:

__VS Code / IntelliSense:__

- Hover over classes/methods to see documentation
- Autocomplete with parameter hints
- Type checking in JavaScript files
- Click to navigate to definitions

__Enable type checking in VS Code:__
Add to your file or workspace settings:

```javascript
// @ts-check
```

Or enable globally in `.vscode/settings.json`:

```json
{
  "js/ts.implicitProjectConfig.checkJs": true
}
```

### Documentation Coverage

Current documentation coverage:

- __Core Engine__: 100% ✅
- __Managers__ (23 files): 100% ✅
- __Providers__ (18 files): 100% ✅
- __Parsers__ (2 files): 100% ✅
- __Utilities__: ~85% ✅
- __Overall__: ~95% ✅

__All new code must maintain 100% JSDoc coverage.__

### Manager Development Pattern

```javascript
/**
 * NewManager - Brief description of manager purpose
 *
 * Detailed description of what this manager does and its role
 * in the ngdpbase architecture.
 *
 * @class NewManager
 * @extends BaseManager
 *
 * @property {WikiEngine} engine - Reference to the wiki engine
 * @property {boolean} initialized - Whether manager has been initialized
 *
 * @see {@link BaseManager} for base functionality
 *
 * @example
 * const newManager = engine.getManager('NewManager');
 * await newManager.performOperation();
 */
class NewManager extends BaseManager {
  /**
   * Creates a new NewManager instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine) {
    super(engine);
  }

  /**
   * Initialize the manager with configuration
   *
   * @async
   * @param {Object} [config={}] - Configuration object
   * @returns {Promise<void>}
   */
  async initialize(config = {}) {
    await super.initialize(config);
    // Manager-specific initialization
  }

  /**
   * Perform a context-aware operation
   *
   * Managers can receive WikiContext for user-aware operations.
   *
   * @async
   * @param {WikiContext} wikiContext - The wiki context
   * @param {...*} params - Additional parameters
   * @returns {Promise<*>} Operation result
   * @throws {Error} If authentication is required but user is not authenticated
   *
   * @example
   * const context = new WikiContext(engine, { pageName: 'Main' });
   * const result = await manager.performOperation(context, 'param1');
   */
  async performOperation(wikiContext, ...params) {
    const userContext = wikiContext.userContext;
    const pageName = wikiContext.pageName;

    // Access other managers via engine
    const aclManager = this.engine.getManager('ACLManager');

    // Perform operation with context awareness
    if (!userContext.isAuthenticated) {
      throw new Error('Authentication required');
    }

    // ... operation logic
  }
}
```

### Plugin Development Pattern

```javascript
const PluginName = {
  name: 'PluginName',
  execute(context, params) {
    const engine = context.engine;
    const manager = engine.getManager('ManagerName');
    return 'HTML output';
  }
};
```

### Parser Development Pattern

__Adding Custom JSPWiki Syntax:__

#### 1. __Add extraction pattern__ in `MarkupParser.extractJSPWikiSyntax()`

```javascript
// Extract custom syntax
sanitized = sanitized.replace(/\[\{CUSTOM:(.*?)\}\]/g, (match, content) => {
  jspwikiElements.push({
    type: 'custom',
    content: content.trim(),
    id: id++,
    syntax: match
  });
  return `<!--JSPWIKI-${uuid}-${id - 1}-->`;
});
```

#### 2. __Create DOM handler__ in `src/parsers/dom/handlers/`

```javascript
class CustomHandler {
  async createNodeFromExtract(element, context, wikiDocument) {
    const node = wikiDocument.createElement('div', {
      'class': 'custom-element',
      'data-jspwiki-id': element.id.toString()
    });
    node.textContent = element.content;
    return node;
  }
}
```

#### 3. __Integrate handler__ in `MarkupParser.createDOMNode()`

```javascript
case 'custom':
  return await this.customHandler.createNodeFromExtract(element, context, wikiDocument);
```

#### 4. __Add tests__ in `src/parsers/__tests__/`

```javascript
test('custom syntax extraction', () => {
  const { jspwikiElements } = parser.extractJSPWikiSyntax('[{CUSTOM:test}]');
  expect(jspwikiElements[0].type).toBe('custom');
  expect(jspwikiElements[0].content).toBe('test');
});
```

📖 __Read [docs/migration/WikiDocument-DOM-Migration.md](docs/migration/WikiDocument-DOM-Migration.md)__ for detailed migration patterns and integration guide.

### Security Guidelines

Use __ACLManager__ for content filtering based on user permissions.
See [Policies-Roles-Permissions](docs/architecture/Policies-Roles-Permissions.md)

### UI/UX Standards

- Use __Bootstrap 5__ components and styling for consistency.
- Follow __JSPWiki-style navigation and layout patterns__ as seen in existing templates.
- Ensure __responsive design__ for mobile compatibility.
- Implement professional styling with cards, shadows, and hover effects.

### Performance & Reliability

- Implement __caching__ for page lookups where applicable (e.g., titleToUuidMap, slugToUuidMap).
- Ensure __cache rebuilding__ after page modifications.
- Handle __file system errors__ gracefully to prevent crashes.
- Use proper __cleanup__ in finally blocks for resource management.

## 📋 Markdown Formatting Standards

All markdown files are linted with `markdownlint`. Run `npm run lint:md` to check.

### Table Formatting (MD060)

Tables MUST use consistent spacing. Choose ONE style per table:

__Padded style (recommended):__

```markdown
| Column 1 | Column 2 | Column 3 |
| -------- | -------- | -------- |
| Value 1  | Value 2  | Value 3  |
```

__Compact style:__

```markdown
|Column 1|Column 2|Column 3|
|--------|--------|--------|
|Value 1|Value 2|Value 3|
```

__DO NOT mix styles__ - this causes MD060 errors:

```markdown
| Column 1|Column 2 | Column 3|   ❌ WRONG
```

### Pre-commit Validation

The pre-commit hook runs `markdownlint --fix` on staged `.md` files. Fix any errors before committing.

## 🧪 Testing

📖 __See [docs/testing/PageManager-Testing-Guide.md](docs/testing/PageManager-Testing-Guide.md) for detailed mocking strategies.__

### Running Tests

- __Run all tests__: `npm test`
- __Coverage report__: `npm run test:coverage`
- __Watch mode__: `npm run test:watch`
- __Run specific test__: `npm test -- path/to/test.test.js`
- __CI mode__: `npm run test:ci`

### Test Organization

All tests follow the __`__tests__` pattern__ co-located with source code:

```text
src/
├── managers/
│   ├── PageManager.ts
│   └── __tests__/
│       ├── PageManager.test.js
│       └── PageManager-Storage.test.js
├── parsers/
│   ├── MarkupParser.ts
│   └── __tests__/
│       ├── MarkupParser.test.js
│       └── MarkupParser-Integration.test.js
├── routes/
│   ├── WikiRoutes.ts
│   └── __tests__/
│       ├── routes.test.js
│       └── maintenance-mode.test.js
└── utils/
    ├── SchemaGenerator.ts
    └── __tests__/
        └── SchemaGenerator.test.js
```

__Why this pattern:__

- ✅ Tests co-located with code they test
- ✅ Easy to find and maintain
- ✅ Vitest automatically discovers all tests
- ✅ Conventional and familiar layout
- ✅ Clear separation from source code

### Test Requirements

- __Unit tests for new managers__ (extending BaseManager pattern)
- __Integration tests__ for route handlers and cross-component functionality
- __Plugin functionality tests__ for JSPWiki-style plugin syntax
- __Parser tests__ for extraction, DOM creation, and merge pipeline
- __Use mocks instead of real file operations__ - critical requirement (see CHANGELOG.md)
- __Mock fs-extra completely__ using in-memory Map-based file systems
- __Mock gray-matter__ for YAML frontmatter parsing
- __Maintain >80% coverage__ for critical managers (>90% for PageManager, UserManager, ACLManager)
- __Maintain >90% coverage__ for parser components
- __Use testUtils.js__ for common mock objects and test utilities

### Writing Tests

__1. Create test file in `__tests__` directory:__

```bash
# For a new manager
touch src/managers/__tests__/NewManager.test.ts

# For a new utility
touch src/utils/__tests__/NewUtil.test.ts
```

__2. Use the Vitest testing framework:__

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import NewManager from '../NewManager.js';

describe('NewManager', () => {
  let manager;
  let mockEngine;

  beforeEach(() => {
    mockEngine = { /* mock setup */ };
    manager = new NewManager(mockEngine);
  });

  test('should initialize correctly', async () => {
    await manager.initialize();
    expect(manager.initialized).toBe(true);
  });
});
```

__3. Mock file operations:__

```typescript
import { vi } from 'vitest';

vi.mock('fs-extra');
const fs = await import('fs-extra');

// Setup mocks
fs.readFile.mockResolvedValue('file content');
fs.writeFile.mockResolvedValue();
```

### Test Types

__Unit Tests__ - Test individual functions/methods

- Located: `src/**/__tests__/*.test.js`
- Focus: Single component in isolation
- Example: `PageManager.test.js`

__Integration Tests__ - Test multiple components together

- Located: `src/**/__tests__/*-Integration.test.js`
- Focus: Component interactions
- Example: `MarkupParser-Integration.test.js`

__Route Tests__ - Test HTTP endpoints

- Located: `src/routes/__tests__/*.test.js`
- Use: supertest for HTTP testing
- Example: `routes.test.js`

### Test Coverage

Coverage configuration excludes test files:

```json
{
  "collectCoverageFrom": [
    "src/**/*.js",
    "!src/**/__tests__/**",
    "!src/legacy/**"
  ]
}
```

View coverage report:

```bash
npm run test:coverage
# Open: coverage/lcov-report/index.html
```

### Parser Test Suites

The WikiDocument DOM parser has comprehensive test coverage:

- __MarkupParser-Extraction.test.js__ (41 tests) - Phase 1: JSPWiki syntax extraction
- __MarkupParser-MergePipeline.test.js__ (31 tests) - Phase 3: DOM merge pipeline
- __MarkupParser-Comprehensive.test.js__ (55 tests) - Integration tests covering:
  - Markdown preservation
  - JSPWiki syntax processing
  - Mixed content scenarios
  - Edge cases and error handling
  - Performance validation
  - Regression tests for #110, #93

__Handler Tests:__

- `DOMVariableHandler.test.js` - Variable node creation
- `DOMPluginHandler.test.js` - Plugin node creation
- `DOMLinkHandler.test.js` - Link node creation

Total: 376+ tests with 100% success rate

## 📝 Page Development

### Frontmatter Structure

All pages require YAML frontmatter:

```yaml
---
title: Page Name
category: General
user-keywords: []
uuid: auto-generated-uuid
lastModified: ISO-date-string
---
```

### JSPWiki Syntax Support

- __Links__: `[PageName]` or `[Link Text|PageName]`
- __User variables__: `[{$username}]`, `[{$loginstatus}]`
- __Plugins__: `[{PluginName param='value'}]`

## 🔀 Pull Request Process

### Before Submitting

1. __Create feature branch__: `git checkout -b feature/your-feature-name`
2. __Follow coding patterns__ from existing codebase
3. __Add tests__ for new functionality
4. __Update documentation__ if needed
5. __Run full test suite__: `npm test`
6. __Test with server__: Test your changes in both development and production modes

   ```bash
   ./server.sh start dev    # Test in development
   ./server.sh restart prod # Test in production
   ```

### PR Requirements

- __Descriptive title__ and detailed description
- __Reference issues__ using `#issue-number`
- __Include tests__ for new features
- __Update CHANGELOG.md__ for user-facing changes
- __Follow semantic commit messages__: `feat:`, `fix:`, `chore:`

### Review Criteria

- Follows manager-based architecture patterns
- Includes appropriate tests
- Maintains backward compatibility
- Follows JSPWiki conventions where applicable

## 🏷️ Version Management

We use __Semantic Versioning__ (SemVer) via `src/utils/version.ts`:

```bash
npx tsx src/utils/version.ts          # Show current version
npx tsx src/utils/version.ts patch    # Bug fixes (1.2.0 → 1.2.1)
npx tsx src/utils/version.ts minor    # New features (1.2.0 → 1.3.0)
npx tsx src/utils/version.ts major    # Breaking changes (1.2.0 → 2.0.0)
npx tsx src/utils/version.ts set 1.2.3  # Set specific version
```

The version script automatically updates:

- `package.json` — `version` field
- `config/app-default-config.json` — `ngdpbase.version` field
- `CHANGELOG.md` — Adds new version section (if [Unreleased] exists)

__Important:__ Always use `src/utils/version.ts` for version changes to keep all files in sync.

## 🐛 Issue Reporting

### Bug Reports

- Use clear, descriptive titles
- Include steps to reproduce
- Specify Node.js version and OS
- Include error messages and logs

### Feature Requests

- Explain the use case and benefit
- Consider JSPWiki compatibility
- Discuss impact on existing functionality

## 🎯 Areas for Contribution

### High Priority

- __User Authentication__ improvements
- __Page History & Versioning__ features
- __Advanced Search__ enhancements
- __Plugin Development__
- __Parser Extensions__ - Custom JSPWiki syntax handlers

### Good First Issues

- Documentation improvements
- New wiki plugins
- UI/UX enhancements
- Test coverage expansion
- Parser handler improvements

### Parser-Specific Contributions

- __Custom Syntax Handlers__ - Add new JSPWiki-style syntax
- __Performance Optimizations__ - Improve extraction/merge speed
- __Handler Enhancements__ - Improve existing DOM handlers
- __Test Coverage__ - Add edge case tests
- __Documentation__ - Improve API docs and examples

## 💬 Getting Help

- __GitHub Issues__ - Bug reports and feature requests
- __GitHub Discussions__ - Questions and general discussion
- __Code Review__ - Submit draft PRs for early feedback

## 📜 License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to ngdpbase! 🚀
