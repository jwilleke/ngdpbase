# WikiContext Complete Guide

__Version:__ 2.0.0
__Last Updated:__ 2026-05-03 (post-v3.6.0)
__Status:__ Production Ready
__Source:__ `src/context/WikiContext.ts`

This guide covers everything about WikiContext in ngdpbase — its purpose, TypeScript API, usage patterns, and role as the central rendering orchestrator. v2.0 captures the access-control consolidation from #625 (v3.6.0): four canonical access methods on WikiContext + a static helper, lazy theme resolution, and an ESLint guard against reintroduction of the inline role-check boilerplate.

---

## Table of Contents

1. [Overview](#overview)
2. [What is WikiContext?](#what-is-wikicontext)
3. [Why WikiContext Exists](#why-wikicontext-exists)
4. [WikiContext Class API](#wikicontext-class-api)
5. [Architecture](#architecture)
6. [Usage Examples](#usage-examples)
7. [Integration with Managers](#integration-with-managers)
8. [Testing](#testing)
9. [Performance](#performance)
10. [Migration Guide](#migration-guide)
11. [Troubleshooting](#troubleshooting)
12. [Related Documentation](#related-documentation)

---

## Overview

__`WikiContext` is the central orchestrator for content rendering in ngdpbase.__ For each page request, a `WikiContext` instance is created to act as a request-scoped container, bundling all information related to the request — page details, user info, HTTP request, and manager references.

Inspired by JSPWiki's architectural patterns, `WikiContext` solves "parameter explosion" by providing a single, consistent object to the upper levels of the application, while keeping lower-level components decoupled and reusable.

### Key Features

- __Request-scoped container__ for all contextual information
- __Orchestration__: manages the rendering pipeline (variable expansion, plugin execution, Markdown → HTML)
- __Decoupling__: passes a plain `pageContext` data object to lower-level systems via `toParseOptions()` — parsers and plugins do not depend on `WikiContext` itself
- __Manager access__: holds direct references to all core engine managers
- __Single source of truth__: all user and page context flows through one object
- __Fallback handling__: graceful degradation when managers are unavailable
- __JSPWiki compatibility__: follows JSPWiki's proven architectural patterns

### Implementation Status

| Component | Status | Tests |
|---|---|---|
| __WikiContext class__ (`src/context/WikiContext.ts`) | ✅ Production | 35 in `WikiContext.test.ts` |
| __Route integration__ (`src/routes/WikiRoutes.ts`) | ✅ Active | All routes |
| __Access-method consolidation__ (#625, v3.6.0) | ✅ Production | `hasRole`, `hasPermission`, `canAccess`, `getPrincipals`, static `userHasRole` |
| __`ParseContext` mirror__ | ✅ Production | `hasRole(...names)` rest-args, `getPrincipals` (#625); `hasPermission` async, `canAccess` (#633) |
| __`ApiContext` parity__ | ✅ Production | `hasRole`/`requireRole` sync; `hasPermission`/`requirePermission` async (#630) |
| __Lazy theme resolution__ | ✅ Production | `activeTheme` / `themeInfo` are lazy getters; permission-only callers don't trigger ConfigurationManager.getProperty |
| __ESLint guard__ | ✅ Production | `no-restricted-syntax` flags `.isAdmin` and `.roles.includes(...)` reads outside test files |
| __Manager method migration__ | 🔄 In Progress | `savePageWithContext()` done; new managers start with WikiContext |

---

## What is WikiContext?

WikiContext is a request-scoped object that encapsulates everything needed for rendering a wiki page.

### Core Concept

Instead of passing multiple parameters through the rendering pipeline, WikiContext provides one object containing:

- __Page information__ (`pageName`, `content`)
- __User context__ (`userContext` — authentication, roles, session)
- __Request details__ (`request`, `response`)
- __Manager references__ (`pageManager`, `renderingManager`, `pluginManager`, `variableManager`, `aclManager`)
- __Rendering context type__ (`WikiContext.CONTEXT.VIEW`, `EDIT`, `PREVIEW`, etc.)

### JSPWiki Inspiration

```typescript
// JSPWiki (Java concept → ngdpbase TypeScript)
class WikiContext {
  constructor(engine: WikiEngine, options: WikiContextOptions) {
    this.engine = engine;
    this.context = options.context ?? WikiContext.CONTEXT.NONE;
    this.pageName = options.pageName ?? null;
    this.userContext = options.userContext ?? null;
    this.request = options.request ?? null;

    // Manager references resolved at construction time
    this.pageManager = engine.getManager<PageManager>('PageManager')!;
    this.renderingManager = engine.getManager<RenderingManager>('RenderingManager')!;
    this.pluginManager = engine.getManager<PluginManager>('PluginManager')!;
    this.variableManager = engine.getManager<VariableManager>('VariableManager')!;
    this.aclManager = engine.getManager<ACLManager>('ACLManager')!;
  }
}
```

---

## Why WikiContext Exists

### The Problem: Parameter Explosion

Before WikiContext, rendering required many parameters:

```typescript
// OLD: Parameter explosion
async function renderMarkdown(
  content: string,
  pageName: string,
  userName: string,
  userRoles: string[],
  requestIp: string,
  sessionId: string,
  // ... 10+ more parameters
): Promise<string> { ... }
```

### The Solution: Context Object Pattern

```typescript
// NEW: Single context object
const wikiContext = this.createWikiContext(req, {
  context: WikiContext.CONTEXT.VIEW,
  pageName,
  content,
});

const html = await wikiContext.renderMarkdown();
```

__Benefits:__

1. Cleaner APIs — single parameter instead of many
2. Easier testing — mock one object
3. Better maintainability — add new context without changing signatures
4. JSPWiki compatibility
5. Type safety — single typed object

### Architectural Role

```
HTTP Request
    ↓
WikiRoutes.createWikiContext(req, options)   ← ALWAYS use this helper
    ↓
WikiContext.renderMarkdown()                 ← ORCHESTRATOR
    ↓
├─ RenderingManager.getParser()
│  └─ MarkupParser.parse(content, toParseOptions())
│     └─ WikiDocument DOM operations
├─ VariableManager.expandVariables()
├─ PluginManager.execute()
└─ (returns HTML)
    ↓
WikiRoutes.getTemplateDataFromContext()      ← ALWAYS use for template data
    ↓
res.render(template, templateData)
```

---

## WikiContext Class API

### TypeScript Interfaces

```typescript
// src/context/WikiContext.ts

export interface UserContext {
  username?: string;
  displayName?: string;
  roles?: string[];
  authenticated?: boolean;        // Use this — NOT isAuthenticated
  preferences?: UserPreferences;
  locale?: string;
  timezone?: string;
  [key: string]: unknown;         // Allows extension
}

// Note: req.userContext set by session middleware also carries
// isAuthenticated: true as a runtime alias. Use userContext.authenticated
// when writing typed TypeScript against the UserContext interface.

export interface WikiContextOptions {
  context?: string;               // WikiContext.CONTEXT.VIEW etc.
  pageName?: string;
  content?: string;
  userContext?: UserContext;
  request?: Request;
  response?: Response;
}

export interface RequestInfo {
  acceptLanguage?: string;
  userAgent?: string;
  clientIp?: string;
  referer?: string;
  sessionId?: string;
  query?: Record<string, string>;
}

export interface PageContext {
  pageName: string | null;
  userContext: UserContext | null;
  requestInfo: RequestInfo;
}

export interface ParseOptions {
  pageContext: PageContext;
  engine: WikiEngine;
}
```

### Constructor

__In route handlers, always use `this.createWikiContext()` — not the constructor directly.__

```typescript
// ✅ Correct — always use the factory in WikiRoutes
const wikiContext = this.createWikiContext(req, {
  context: WikiContext.CONTEXT.VIEW,
  pageName,
  content,
});

// ✅ Also correct — direct construction for tests or non-route code
const wikiContext = new WikiContext(engine, {
  context: WikiContext.CONTEXT.VIEW,
  pageName: 'Main',
  userContext: { username: 'admin', authenticated: true, roles: ['admin'] },
  request: req,
  response: res,
});
```

`createWikiContext()` (`src/routes/WikiRoutes.ts:132`) populates `userContext` from `req.userContext` (set by session middleware) automatically.

__Throws:__ `Error` if `engine` is not provided.

### Context Type Constants

```typescript
WikiContext.CONTEXT = {
  VIEW:    'view',     // Viewing a page
  EDIT:    'edit',     // Editing a page
  PREVIEW: 'preview',  // Previewing changes
  DIFF:    'diff',     // Viewing diff
  INFO:    'info',     // Viewing page info/metadata
  NONE:    'none'      // No specific context
};
```

### Instance Properties

All properties are __`readonly`__ — `WikiContext` is immutable after construction.

```typescript
// Core
wikiContext.engine          // WikiEngine
wikiContext.context         // string — context type ('view', 'edit', ...)
wikiContext.pageName        // string | null
wikiContext.content         // string | null
wikiContext.userContext     // UserContext | null
wikiContext.request         // Request | null
wikiContext.response        // Response | null

// Manager shortcuts (resolved at construction)
wikiContext.pageManager         // PageManager
wikiContext.renderingManager    // RenderingManager
wikiContext.pluginManager       // PluginManager
wikiContext.variableManager     // VariableManager
wikiContext.aclManager          // ACLManager
```

> __Immutability note__: all properties are `readonly`. If you need a different `pageName` with the same user context (e.g. in MediaManager), construct a new instance:
>
> ```typescript
> const linkedPageContext = new WikiContext(this.engine, {
>   context: WikiContext.CONTEXT.VIEW,
>   pageName: linkedPageName,
>   userContext: wikiContext.userContext ?? undefined,
>   request: wikiContext.request ?? undefined,
> });
> ```

### Methods

#### `getContext(): string`

Returns the current rendering context type.

```typescript
if (wikiContext.getContext() === WikiContext.CONTEXT.EDIT) {
  // Show edit-specific UI
}
```

#### Access-control methods (#625, v3.6.0)

The four canonical methods for role/permission checks. Use these instead of inline `userContext.roles.includes(...)` or `userContext.isAdmin` reads — those are lint-blocked outside test files. See [Access-Control.md](architecture/Access-Control.md) for the full operational guide.

##### `hasRole(...names: string[]): boolean`

Pure roles-array check. Sync. Returns `true` if `userContext.roles` contains any of the given names. Does __not__ consult PolicyEvaluator. Backed by `WikiContext.userHasRole(this.userContext, ...names)`.

```typescript
if (wikiContext.hasRole('admin')) { ... }
if (wikiContext.hasRole('admin', 'editor', 'contributor')) { ... }   // multi-role OR
```

##### `async hasPermission(action: string): Promise<boolean>`

Global permission check. Delegates to `UserManager.hasPermission(username, action)` → `PolicyEvaluator`. Honors anonymous/authenticated role expansion (`'anonymous'`/`'All'`, `'Authenticated'`/`'All'`), inactive-user rejection, deny policies, and policy priority order.

```typescript
if (!(await wikiContext.hasPermission('admin-system'))) {
  return res.status(403).send('Access denied');
}
```

##### `async canAccess(action: string): Promise<boolean>`

Page-resource-aware permission check. Delegates to `ACLManager.checkPagePermissionWithContext(this, action)`, which runs the 3-tier evaluator: tier 0 (private user-keyword), tier 1 (frontmatter audience/access), tier 2 (global policies via PolicyEvaluator). Returns `false` if `pageName` is null or ACLManager is unavailable.

```typescript
if (!(await wikiContext.canAccess('edit'))) {
  return res.status(403).send('Cannot edit this page');
}
```

Action-name mapping inside ACLManager: `view` → `page-read`, `edit` → `page-edit`, `delete` → `page-delete`, `create` → `page-create`, `rename` → `page-rename`, `upload` → `asset-upload`.

##### `getPrincipals(): string[]`

Returns `[...roles, username]` if authenticated, `[...roles]` otherwise. Used by search providers to filter results without per-result ACL evaluation.

```typescript
const principals = wikiContext.getPrincipals();
// e.g. ['editor', 'reader', 'alice']
```

##### `static userHasRole(userContext, ...names): boolean`

Same semantics as instance `hasRole` but takes a userContext-like object directly. For hot-path callers that don't have a full WikiContext (maintenance middleware, `/metrics`, parser-pipeline plugins). Avoids the per-request WikiContext construction cost.

```typescript
import WikiContext from '../context/WikiContext.js';

app.use((req, res, next) => {
  const isAdmin = WikiContext.userHasRole(req.userContext, 'admin');
  if (allowAdmins && isAdmin) { next(); return; }
  // ...
});
```

#### `async renderMarkdown(content?): Promise<string>`

Renders markdown content through the full rendering pipeline.

```typescript
// Render stored content
const html = await wikiContext.renderMarkdown();

// Render explicit content
const html = await wikiContext.renderMarkdown('# Custom Content [{$pagename}]');
```

__Processing pipeline:__

1. __MarkupParser__ (primary) — WikiDocument DOM, variables, plugins, links
2. __Showdown fallback__ (if parser unavailable) — variables expanded, basic Markdown

#### `toParseOptions(): ParseOptions`

Creates the plain object passed to `MarkupParser.parse()`. Decouples the parser from `WikiContext` — the parser only sees `{ pageContext, engine }`.

```typescript
const options = wikiContext.toParseOptions();
// {
//   pageContext: { pageName, userContext, requestInfo: { ... }, themeContext, pageMetadata },
//   engine: WikiEngine
// }
const html = await parser.parse(content, options);
```

---

## Lazy theme resolution (v3.6.0)

Pre-v3.6.0, `createWikiContext()` eagerly resolved the active theme: it called `configManager.getProperty('ngdpbase.theme.active')` and constructed a `ThemeManager` (which did fs I/O for theme.json + asset paths) on __every__ request, even if the request never read theme info.

After v3.6.0, theme resolution is lazy:

- `wikiContext.activeTheme` and `wikiContext.themeInfo` are now getters that resolve on first access and cache on the instance.
- `createWikiContext()` is a thin constructor wrapper — no fs I/O, no ConfigurationManager.getProperty.
- `ThemeManager` is cached engine-wide via `getThemeManager(activeTheme, themesDir)` (`src/managers/ThemeManager.ts`) keyed by `${themesDir}::${activeTheme}`. Cache invalidates implicitly when the active-theme name changes.

Practical effect:

- Permission-only callers (route handlers that only call `hasRole` / `hasPermission` / `canAccess`) never trigger theme resolution.
- Template-rendering callers (`getCommonTemplateData`, `adminSettings`) trigger it on first read of `activeTheme` / `themeInfo`; subsequent calls within the same request hit the cached value.
- Tests using `mockConfigManager.getProperty.mockImplementationOnce(...)` no longer have their mock value consumed by theme lookup at construction time.

---

## Architecture

### File Structure

```
src/
├── context/
│   ├── WikiContext.ts                 # Main WikiContext class (~390 lines)
│   └── __tests__/
│       └── WikiContext.test.js        # Unit tests (12 tests)
│
├── routes/
│   └── WikiRoutes.ts                  # createWikiContext() factory + route handlers
│
└── managers/
    ├── RenderingManager.ts            # Accessed via WikiContext
    ├── VariableManager.ts             # Accessed via WikiContext
    └── PluginManager.ts               # Accessed via WikiContext
```

### Rendering Pipeline

```
┌─────────────────────────────────────────────────────┐
│  HTTP Request (GET /wiki/PageName)                  │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│  WikiRoutes handler                                  │
│  • Load page content from PageManager               │
│  • wikiContext = this.createWikiContext(req, opts)  │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│  WikiContext.renderMarkdown()                        │
│  • RenderingManager.getParser()                     │
│  • parser.parse(content, this.toParseOptions())     │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│  MarkupParser.parse(content, options)                │
│  • Phase 1: Extract JSPWiki syntax                  │
│  • Phase 2: Create WikiDocument DOM nodes           │
│  • Showdown markdown conversion                     │
│  • Phase 3: Merge DOM nodes → HTML                  │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│  WikiRoutes handler (continued)                      │
│  • templateData = this.getTemplateDataFromContext() │
│  • res.render('template', { ...templateData, ... }) │
└─────────────────────────────────────────────────────┘
```

### Architectural Note: Decoupling via toParseOptions()

`WikiContext` does __not__ pass itself to lower-level systems. It passes a plain object:

```
WikiContext → toParseOptions() → { pageContext, engine } → MarkupParser → plugins/variables
```

This means plugins and variable handlers depend only on the plain `pageContext` data structure, not on `WikiContext` — making them independently testable and reusable.

---

## Usage Examples

### Example 1: Standard Page View (route handler)

```typescript
// src/routes/WikiRoutes.ts — pattern used throughout
async viewPage(req: Request, res: Response): Promise<void> {
  const pageName = req.params.pageName as string;

  // ✅ Always use createWikiContext() in route handlers
  const wikiContext = this.createWikiContext(req, {
    context: WikiContext.CONTEXT.VIEW,
    pageName,
  });

  const page = await wikiContext.pageManager.getPage(pageName);
  const html = await wikiContext.renderMarkdown(page?.content ?? '');

  // ✅ Always use getTemplateDataFromContext() for template data
  const templateData = this.getTemplateDataFromContext(wikiContext);
  res.render('wiki-view', {
    ...templateData,
    content: html,
  });
}
```

### Example 2: Save Page (passing WikiContext to manager)

```typescript
async savePage(req: Request, res: Response): Promise<void> {
  const { pageName, content } = req.body as { pageName: string; content: string };

  const wikiContext = this.createWikiContext(req, {
    context: WikiContext.CONTEXT.EDIT,
    pageName,
    content,
  });

  const pageManager = this.engine.getManager<PageManager>('PageManager');
  // savePageWithContext() receives WikiContext — manager derives user from it
  await pageManager.savePageWithContext(wikiContext, { category: 'general' });

  res.redirect(`/wiki/${encodeURIComponent(pageName)}`);
}
```

### Example 3: Access control check (post-#625)

The canonical pattern is `wikiContext.hasRole(...)` for role checks, `wikiContext.hasPermission(action)` for global permission gates, and `wikiContext.canAccess(action)` for page-resource-aware gates. The ESLint guard (post-v3.6.0) blocks the old inline `userContext.roles.includes('admin')` and `userContext.isAdmin` patterns outside test files.

```typescript
// Admin-only route guard
const wikiContext = this.createWikiContext(req);
if (!(await wikiContext.hasPermission('admin-system'))) {
  return await this.renderError(req, res, 403, 'Access Denied', '...');
}

// Multi-role gate
if (!wikiContext.hasRole('admin', 'editor', 'contributor')) {
  return res.status(403).json({ success: false, error: 'Access denied' });
}

// Per-page edit gate (resource-aware — runs the 3-tier ACL evaluator)
const wikiContext = this.createWikiContext(req, { pageName });
if (!(await wikiContext.canAccess('edit'))) {
  return await this.renderError(req, res, 403, 'Access Denied', '...');
}

// Hot-path middleware (no full WikiContext) — use the static helper
import WikiContext from './context/WikiContext.js';
app.use((req, res, next) => {
  const isAdmin = WikiContext.userHasRole(req.userContext, 'admin');
  if (allowAdmins && isAdmin) { next(); return; }
  res.status(503).render('maintenance', { isAdmin });
});
```

For the private-page check pattern (admin-OR-creator on private pages), use `wikiContext.canAccess('view')` — ACLManager's tier 0 handles `private: true` frontmatter natively (canonical since #639 Slice E / v3.7.0).

See [Access-Control.md](architecture/Access-Control.md) for the full operational guide, including ParseContext / ApiContext patterns.

### Example 4: Page Preview

```typescript
async previewPage(req: Request, res: Response): Promise<void> {
  const { pageName, content } = req.body as { pageName: string; content: string };

  const wikiContext = this.createWikiContext(req, {
    context: WikiContext.CONTEXT.PREVIEW,
    pageName,
    content,
  });

  const html = await wikiContext.renderMarkdown(content);
  res.json({ success: true, html });
}
```

### Example 5: Testing with Mock Context

```typescript
// In tests — direct construction (no req available in tests)
const mockEngine = {
  getManager: jest.fn((name: string) => {
    if (name === 'RenderingManager') return mockRenderingManager;
    if (name === 'VariableManager') return mockVariableManager;
    if (name === 'PageManager') return mockPageManager;
    if (name === 'PluginManager') return mockPluginManager;
    if (name === 'ACLManager') return mockAclManager;
    return null;
  }),
};

const wikiContext = new WikiContext(mockEngine as unknown as WikiEngine, {
  pageName: 'TestPage',
  content: 'Welcome to [{$pagename}]',
  userContext: { username: 'testuser', authenticated: true, roles: ['user'] },
});

const html = await wikiContext.renderMarkdown();
expect(html).toContain('Welcome to TestPage');
```

### Example 6: toParseOptions() — custom parsing

```typescript
const wikiContext = new WikiContext(engine, {
  pageName: 'Main',
  userContext: { username: 'admin', authenticated: true },
  request: req,
});

const options = wikiContext.toParseOptions();
// {
//   pageContext: {
//     pageName: 'Main',
//     userContext: { username: 'admin', authenticated: true },
//     requestInfo: { clientIp: '...', sessionId: '...', ... }
//   },
//   engine: WikiEngine
// }

const parser = wikiContext.renderingManager.getParser();
if (parser) {
  const html = await parser.parse(content, options as unknown as Record<string, unknown>);
}
```

---

## Integration with Managers

### PageManager

```typescript
// Page access via WikiContext reference
const page = await wikiContext.pageManager.getPage(wikiContext.pageName!);

// Save with full context (manager derives author from wikiContext.userContext)
await wikiContext.pageManager.savePageWithContext(wikiContext, metadata);
```

### VariableManager

```typescript
// Manual variable expansion (renderMarkdown() does this automatically)
const expanded = wikiContext.variableManager.expandVariables(
  'User [{$username}] on [{$pagename}]',
  wikiContext.toParseOptions().pageContext
);
// "User john on Main"
```

### PluginManager

```typescript
if (wikiContext.pluginManager.hasPlugin('TableOfContents')) {
  // Plugin available
}
```

### RenderingManager

```typescript
const parser = wikiContext.renderingManager.getParser();
if (parser) {
  const html = await parser.parse(content, wikiContext.toParseOptions() as unknown as Record<string, unknown>);
}
```

### ACLManager

Prefer `wikiContext.canAccess(action)` (post-#625) — it delegates to `ACLManager.checkPagePermissionWithContext` and returns `false` cleanly if `pageName` or ACLManager is missing.

```typescript
// Canonical (post-v3.6.0)
if (!(await wikiContext.canAccess('edit'))) {
  return res.status(403).render('error', { code: 403 });
}
```

Direct calls still work for code that needs a non-current page name or wants to pass a synthesized context:

```typescript
const canEdit = await wikiContext.aclManager.checkPagePermissionWithContext(
  wikiContext,   // ← pass WikiContext, not separate (userContext, pageName)
  'edit'
);
```

The deprecated 4-arg `checkPagePermission(pageName, action, userContext, content)` has 3 remaining callers tracked in #632 (LeftMenu, Footer, adminDashboard) — do not add new callers.

---

## Testing

### Test Coverage

`src/context/__tests__/WikiContext.test.ts` — 35 tests as of v3.6.0.

| Category | Tests | Status |
|---|---|---|
| Constructor | 3 | ✅ |
| `getContext()` | 2 | ✅ |
| `renderMarkdown()` | 4 | ✅ |
| `toParseOptions()` | 2 | ✅ |
| Context constants | 1 | ✅ |
| `hasRole(...names)` (instance) | 6 | ✅ |
| `userHasRole(...)` (static) | 6 | ✅ |
| `hasPermission(action)` | 3 | ✅ |
| `canAccess(action)` | 3 | ✅ |
| `getPrincipals()` | 5 | ✅ |
| __Total__ | __35__ | __✅__ |

Plus 12 tests in `src/parsers/context/__tests__/ParseContext.test.ts` (hasRole rest-args + getPrincipals) and 31 tests in `src/context/__tests__/ApiContext.test.ts` (post-#630 contract-based tests).

### Running Tests

```bash
npx vitest run src/context/__tests__/WikiContext.test.ts
npx vitest run src/parsers/context/__tests__/ParseContext.test.ts
npx vitest run src/context/__tests__/ApiContext.test.ts
```

### Mock Setup

```typescript
const mockEngine = {
  getManager: jest.fn((name: string) => ({
    RenderingManager: { getParser: jest.fn(() => ({ parse: jest.fn().mockResolvedValue('<p>html</p>') })) },
    VariableManager: { expandVariables: jest.fn((s: string) => s) },
    PageManager: { getPage: jest.fn(), savePageWithContext: jest.fn() },
    PluginManager: { hasPlugin: jest.fn(() => false) },
    ACLManager: { checkPagePermissionWithContext: jest.fn().mockResolvedValue(true) },
  }[name] ?? null)),
};

const wikiContext = new WikiContext(mockEngine as unknown as WikiEngine, {
  pageName: 'TestPage',
  content: 'Test content',
  userContext: { username: 'testuser', authenticated: true },
});
```

---

## Performance

| Operation | Notes |
|---|---|
| Create WikiContext | Very fast — manager references are cheap pointer assignments. Lazy theme = no fs I/O at construction. |
| `getContext()` | Simple property access |
| `hasRole(...)` | Set lookup over `userContext.roles` — sub-microsecond |
| `hasPermission(...)` | Async — UserManager → PolicyEvaluator round-trip; cached at PolicyManager layer |
| `canAccess(...)` | Async — ACLManager 3-tier evaluation; cheap unless tier-0 metadata fetch fires |
| `getPrincipals()` | Array spread + push — sub-microsecond |
| `activeTheme` (first read) | ConfigurationManager.getProperty + cached ThemeManager lookup; subsequent reads are property access |
| `themeInfo` (first read) | Triggers `activeTheme` lookup; reads cached ThemeManager paths |
| `toParseOptions()` | Object construction (~0.1ms) |
| `renderMarkdown()` | Depends on parser and content (20–30ms typical) |

__Key:__ `WikiContext` is created once per request. Manager references are stored as pointers — no copying. Always create one instance per request and reuse it for multiple operations within that request. Permission-only callers (most route handlers post-#625) never trigger theme resolution.

```typescript
// ✅ One context, multiple operations
const wikiContext = this.createWikiContext(req, { pageName });
const html = await wikiContext.renderMarkdown(pageContent);
const leftMenuHtml = await wikiContext.renderMarkdown(leftMenuContent);
```

---

## Migration Guide

### From inline regex processing

```typescript
// Before
function renderMarkdown(content: string, pageName: string): string {
  let result = content.replace(/\[\{\$pagename\}\]/g, pageName);
  return converter.makeHtml(result);
}

// After
const wikiContext = this.createWikiContext(req, { pageName, content });
const html = await wikiContext.renderMarkdown();
```

### From legacy RenderingManager calls

```typescript
// Before
const html = await renderingManager.renderMarkdown(content, pageName, userContext, requestInfo);

// After
const wikiContext = this.createWikiContext(req, { pageName, content });
const html = await wikiContext.renderMarkdown();
```

### Passing context to managers (migration in progress)

```typescript
// Current hybrid approach (acceptable while migration is in progress)
const wikiContext = this.createWikiContext(req, { context: WikiContext.CONTEXT.EDIT, pageName, content });
const currentUser = wikiContext.userContext;
const metadata = { ...otherMetadata, author: currentUser?.username ?? 'anonymous' };
await pageManager.savePage(pageName, content, metadata);  // old signature

// Target pattern (use where manager supports it)
await pageManager.savePageWithContext(wikiContext, metadata);  // WikiContext-aware
```

When refactoring existing code, add a `// TODO: use savePageWithContext(wikiContext)` comment to mark legacy call sites.

---

## Troubleshooting

### "WikiContext requires a valid WikiEngine instance"

`engine` was `null` or `undefined`. Ensure WikiEngine is fully initialized before constructing.

### Fallback renderer always used ("Using fallback renderer" in logs)

MarkupParser not initialized. Check:

```typescript
const parser = engine.getManager('MarkupParser');
console.log('Parser available:', !!parser, 'initialized:', parser?.isInitialized());
```

### Variables not expanded (`[{$pagename}]` appears literally)

VariableManager not available:

```typescript
console.log('VariableManager:', !!wikiContext.variableManager);
```

### Request info missing from `toParseOptions()`

Must pass `request: req` in options:

```typescript
const wikiContext = this.createWikiContext(req, { pageName, request: req });
// or: new WikiContext(engine, { ..., request: req })
```

### `userContext.isAuthenticated` is `undefined` in typed code

The typed `UserContext` interface uses `authenticated?: boolean`. The `isAuthenticated` alias is set by the session middleware at runtime on `req.userContext`. In typed TypeScript, use:

```typescript
if (wikiContext.userContext?.authenticated) { ... }
```

---

## Related Documentation

- [WikiContext.md](WikiContext.md) — original shorter reference
- [docs/architecture/Access-Control.md](architecture/Access-Control.md) — operational guide for `hasRole` / `hasPermission` / `canAccess` / `getPrincipals` across WikiContext, ParseContext, ApiContext
- [docs/architecture/Current-Rendering-Pipeline.md](architecture/Current-Rendering-Pipeline.md) — rendering pipeline detail
- [docs/design/policy-based-access-control-design.md](design/policy-based-access-control-design.md) — JSON policy schema design (Issue #19)
- [CONTRIBUTING.md](../CONTRIBUTING.md#wikicontext---single-source-of-truth) — contributing guidelines for WikiContext usage
- [ARCHITECTURE.md](../ARCHITECTURE.md) — overall ngdpbase architecture
- [docs/WikiDocument-Complete-Guide.md](WikiDocument-Complete-Guide.md) — WikiDocument (used internally by MarkupParser)

### Relationship with WikiDocument

| | WikiContext | WikiDocument |
|---|---|---|
| File | `src/context/WikiContext.ts` | `src/parsers/dom/WikiDocument.ts` |
| Scope | Request-scoped | Created during parse phase only |
| Role | Orchestrator — holds all context | Internal DOM for parsed content |
| Lifetime | Full HTTP request | Within `MarkupParser.parse()` call |
| Created by | `WikiRoutes.createWikiContext()` | `MarkupParser` internally |

### Related Issues

- Issue #67 — Create WikiContext Class ✅
- Issue #66 — \[EPIC\] Implement WikiContext and Manager ✅
- Issue #132 — Refactor to use WikiContext as Single Source of Truth ✅
- Issue #68 — Integrate VariableManager.js into WikiContext ✅
- Issue #71 — Refactor Rendering Pipeline in app.js ✅
- Issue #625 — `WikiContext.hasRole/hasPermission/canAccess/getPrincipals` consolidation ✅ (shipped in v3.6.0)
- Issue #609 — Test-isolation flake fix tied to #625's mock-state semantics ✅ (shipped in v3.6.0)
- Issue #630 — `ApiContext.hasPermission` divergence ✅ (delegates to UserManager post-fix)
- Issue #633 — `ParseContext.hasPermission` divergence ✅ (delegates to UserManager post-fix)
- Issue #629 — Open: collapse ParseContext data redundancy by holding a WikiContext reference
- Issue #631 — Open: service-principal model (`WikiContext.system()` factory)
- Issue #632 — Open: migrate 3 deprecated 4-arg `aclManager.checkPagePermission` callers

---

__Last Updated:__ 2026-05-03 (post-v3.6.0)
__Maintained By:__ ngdpbase Development Team
