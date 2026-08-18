# TypeScript Style Guide

This guide documents TypeScript conventions and patterns used in ngdpbase. For general coding standards (formatting, linting, naming conventions, git commits), see __[CODE_STANDARDS.md](../CODE_STANDARDS.md)__.

## Overview

ngdpbase uses TypeScript with strict mode enabled. The codebase follows CommonJS module conventions for Node.js compatibility.

### TypeScript Migration Rules

- NEVER remove .js file until server starts with .ts version
- After ANY .ts change: run `./server.sh start` and verify
- After ANY migration: run `npm test` AND manual server test
- One file at a time, fully working, before next file

## Configuration

```json
// tsconfig.json highlights
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

## Type Patterns

### Manager Classes

```typescript
import BaseManager from './BaseManager';
import type { WikiEngine } from '../types/WikiEngine';

class ExampleManager extends BaseManager {
  private provider: SomeProvider | null = null;
  private cache: Map<string, unknown> = new Map();

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);
    // Use type assertions for getManager
    const configManager = this.engine.getManager('ConfigurationManager') as ConfigurationManager | undefined;
  }
}

export default ExampleManager;
```

### Interface Definitions

```typescript
// Define interfaces for complex types
export interface PageMetadata {
  title: string;
  category: string;
  uuid: string;
  lastModified: string;
  author?: string;
  'user-keywords'?: string[];
}

// Use index signatures for flexible objects
export interface ConfigOptions {
  [key: string]: unknown;
}
```

### DOM Types (linkedom)

The `linkedom` library doesn't have TypeScript definitions. We define minimal types in `WikiDocument.ts`:

```typescript
export interface LinkedomElement {
  innerHTML: string;
  textContent: string;
  className: string;
  nodeType: number;
  tagName: string;
  childNodes: LinkedomNodeList;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  // ... other DOM methods
}

// Usage
import type { LinkedomElement, LinkedomNode } from '../parsers/dom/WikiDocument';

// LinkedomNodeList doesn't support iterators - use index-based loops
for (let i = 0; i < elements.length; i++) {
  const element = elements[i] as LinkedomElement;
}
```

## Common Patterns

### Type Assertions

```typescript
// Prefer post-call assertions over generic parameters
// ✅ Good
const manager = engine.getManager('PageManager') as PageManager | undefined;

// ❌ Avoid
const manager = engine.getManager<PageManager>('PageManager');
```

### Unknown vs Any

```typescript
// Prefer unknown for type safety
function processData(data: unknown): string {
  if (typeof data === 'string') {
    return data.toUpperCase();
  }
  return String(data);
}

// Use any only when interfacing with untyped libraries
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const result = legacyFunction() as any;
```

### Optional Chaining

```typescript
// Use optional chaining for potentially undefined values
const username = context.userContext?.username ?? 'anonymous';
const category = metadata?.category || 'General';
```

### Export Patterns

```typescript
// Named exports for types and interfaces
export interface SomeInterface { ... }
export type SomeType = string | number;

// Default export for classes
export default SomeClass;

// CommonJS compatibility (for Jest)
module.exports = SomeClass;
module.exports.default = SomeClass;
```

## ESLint Rules

Key TypeScript ESLint rules:

| Rule                                               | Description                       |
| -------------------------------------------------- | --------------------------------- |
| `@typescript-eslint/explicit-function-return-type` | Require return type annotations   |
| `@typescript-eslint/no-explicit-any`               | Discourage `any`, prefer `unknown`|
| `@typescript-eslint/no-unused-vars`                | Error on unused variables         |
| `@typescript-eslint/no-unsafe-assignment`          | Warn on unsafe any assignments    |

Disable rules per-file when needed:

```typescript
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
```

## Testing

Jest is configured with `ts-jest` to support TypeScript tests:

```typescript
// example.test.ts
import ExampleManager from '../ExampleManager';

describe('ExampleManager', () => {
  let manager: ExampleManager;
  let mockEngine: jest.Mocked<WikiEngine>;

  beforeEach(() => {
    mockEngine = createMockEngine();
    manager = new ExampleManager(mockEngine);
  });

  test('should initialize', async () => {
    await manager.initialize();
    expect(manager.initialized).toBe(true);
  });
});
```

## TSDoc Comments

Use TSDoc for documenting public APIs. TSDoc is the TypeScript-native documentation format that works with TypeDoc for generating API documentation.

### Basic TSDoc Syntax

```typescript
/**
 * Retrieves a page by its title.
 *
 * @param title - The page title to look up
 * @param options - Optional retrieval options
 * @returns The page data or null if not found
 * @throws {@link PageNotFoundError} When page doesn't exist and strict mode enabled
 *
 * @example
 * ```typescript
 * const page = await pageManager.getPage('Main');
 * if (page) {
 *   console.log(page.content);
 * }
 * ```
 */
async getPage(title: string, options?: PageOptions): Promise<PageData | null> {
  // implementation
}
```

### Common TSDoc Tags

| Tag | Purpose |
| --- | ------- |
| `@param` | Document function parameters |
| `@returns` | Document return value |
| `@throws` | Document exceptions |
| `@example` | Provide usage examples |
| `@see` | Reference related items |
| `@deprecated` | Mark deprecated APIs |
| `@remarks` | Additional details |
| `@internal` | Mark as internal (excluded from docs) |

### Class Documentation

```typescript
/**
 * Manages page storage and retrieval operations.
 *
 * @remarks
 * This manager handles all CRUD operations for wiki pages,
 * including caching and version control integration.
 *
 * @see {@link VersioningFileProvider} for storage implementation
 */
class PageManager extends BaseManager {
  /**
   * The underlying storage provider.
   * @internal
   */
  private provider: PageProvider | null = null;
}
```

### Generating Documentation

```bash
# Generate API documentation with TypeDoc (when configured)
npm run docs:api
```

## Migration Notes

When converting JavaScript to TypeScript:

1. __Add file extension__ - Rename `.js` to `.ts`
2. __Add type annotations__ - Start with function parameters and returns
3. __Define interfaces__ - Create types for complex objects
4. __Fix type errors__ - Address TypeScript compiler errors
5. __Add ESLint disables__ - Temporarily disable rules if needed during migration
6. __Run tests__ - Ensure all tests pass

## Commands

```bash
npm run typecheck       # Type check without emitting
npm run build           # Build to dist/
npm run build:watch     # Watch mode
npm run lint:code       # Lint TypeScript/JavaScript
```

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)
- [TSDoc](https://tsdoc.org/) - TypeScript documentation comments
- [TypeDoc](https://typedoc.org/) - Documentation generator
- [typescript-eslint](https://typescript-eslint.io/)
- [ts-jest](https://kulshekhar.github.io/ts-jest/)
