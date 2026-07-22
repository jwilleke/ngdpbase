# WikiDocument Complete Guide

**Version:** 2.0.0
**Last Updated:** 2025-12-10
**Status:** Production Ready

This comprehensive guide covers everything about WikiDocument in the ngdpbase project, including its purpose, implementation, usage, and the DOM extraction pipeline that uses it.

---

## Table of Contents

1. [Overview](#overview)
2. [What is WikiDocument?](#what-is-wikidocument)
3. [Why WikiDocument Exists](#why-wikidocument-exists)
4. [WikiDocument Class API](#wikidocument-class-api)
5. [The DOM Extraction Pipeline](#the-dom-extraction-pipeline)
6. [Architecture](#architecture)
7. [Usage Examples](#usage-examples)
8. [Testing](#testing)
9. [Performance](#performance)
10. [Migration Guide for Custom Handlers](#migration-guide-for-custom-handlers)
11. [Troubleshooting](#troubleshooting)
12. [Related Documentation](#related-documentation)

---

## Overview

`WikiDocument` is a DOM-based representation of a wiki page, inspired by JSPWiki's `WikiDocument` class. It solves the fundamental problem of order-dependent string-based parsing by providing a structured DOM tree for JSPWiki syntax elements.

### Key Features

- **DOM-based structure** using `linkedom` (a lightweight, W3C-compliant DOM API).
- **Cacheable representation** via JSON serialization (`toJSON` and `fromJSON`).
- **Metadata storage** for processing flags and custom data.
- **WeakRef context** for memory-efficient garbage collection of the rendering context.
- **Standard W3C DOM API** (e.g., `createElement`, `querySelector`, `appendChild`).
- **High performance**, with sub-millisecond operations for most common tasks.

### Implementation Status

- **WikiDocument Class:** Fully implemented and tested, with 100% test coverage. It is considered production-ready.
- **DOM Extraction Pipeline:** The pipeline that uses `WikiDocument` is also fully implemented and is the default rendering method in the application.

---

## What is WikiDocument?

`WikiDocument` is a JavaScript class that provides an in-memory, mutable representation of wiki content. Instead of processing content as a single large string, it allows the parser to treat different parts of the content—like text, plugins, variables, and links—as distinct nodes in a tree structure.

### Core Concept

Instead of manipulating content as strings through multiple, sequential phases (which causes order-dependency issues), `WikiDocument` enables a more robust process:

1. JSPWiki-specific syntax is **extracted** from the raw markup.
2. These extracted elements are converted into **DOM nodes** within a `WikiDocument` instance.
3. The remaining "safe" markdown is processed by a standard markdown parser (Showdown).
4. The rendered DOM nodes are **merged** back into the final HTML.

This separation of concerns ensures that the markdown parser and the JSPWiki syntax handlers do not interfere with each other.

### JSPWiki Inspiration

The design is modeled after JSPWiki's `WikiDocument`, which extends a JDOM2 `Document` in Java.

- **JSPWiki:** Uses `org.jdom2.Document` and the JDOM2 API.
- **ngdpbase:** Uses `linkedom` to provide a W3C-compliant DOM API, which is more familiar to JavaScript developers.

---

## Why WikiDocument Exists

### The Problem: String-Based Parsing

The original ngdpbase parser processed content as strings through 7 sequential phases. This was fragile and prone to errors. For example, an "escape" syntax like `[[` to prevent a link from being rendered could be broken by a later phase that processed variables.

**The core problem was order-dependency.** The output would change drastically if you re-ordered the parsing phases, and it was impossible to find an order that worked for all edge cases.

### The Solution: A DOM-Based Pipeline

The `WikiDocument` class enables a modern, robust parsing architecture that separates concerns, inspired by the discovery that JSPWiki itself doesn't parse markdown but delegates it to a specialized library (FlexMark).

**ngdpbase now follows the same pattern:**

- **Markdown Syntax** (`##`, `*`, etc.) is handled exclusively by the **Showdown parser**.
- **JSPWiki Syntax** (`[{$var}]`, `[{Plugin}]`, `[Link]`) is handled by the **DOM Extraction Pipeline**, which uses `WikiDocument`.

This architecture permanently fixes the escaping and order-dependency issues.

---

## WikiDocument Class API

### Constructor

#### `new WikiDocument(pageData, context)`

Creates a new `WikiDocument` instance.

- **`pageData`** (string): The original, raw wiki markup.
- **`context`** (Object | null): The rendering context, stored as a `WeakRef` to prevent memory leaks.

```javascript
const WikiDocument = require('./src/parsers/dom/WikiDocument');
const doc = new WikiDocument('!My Page\nSome content.', { pageName: 'MyPage' });
```

### Page Data and Context

#### `getPageData()` / `setPageData(data)`

Gets or sets the original raw wiki markup associated with the document.

#### `getContext()` / `setContext(context)`

Gets the rendering context (if it hasn't been garbage-collected) or sets a new one. The context is stored in a `WeakRef`.

### Metadata

#### `getMetadata()`

Returns a *copy* of all metadata associated with the document.

#### `setMetadata(key, value)`

Sets a value in the document's metadata.

#### `getMetadataValue(key, defaultValue)`

Retrieves a single metadata value, returning `defaultValue` if the key does not exist.

```javascript
doc.setMetadata('author', 'John Doe');
const author = doc.getMetadataValue('author', 'Unknown'); // 'John Doe'
```

### DOM Creation

#### `createElement(tag, attributes)`

Creates a new HTML element.

```javascript
const heading = doc.createElement('h1', { id: 'title', class: 'wiki-heading' });
```

#### `createTextNode(text)`

Creates a text node.

#### `createCommentNode(text)`

Creates an HTML comment node.

### DOM Manipulation

The class proxies standard DOM manipulation methods to the root element:

- **`appendChild(node)`**: Appends a child to the document's root.
- **`insertBefore(newNode, referenceNode)`**
- **`removeChild(node)`**
- **`replaceChild(newNode, oldNode)`**

### DOM Query

The class proxies standard DOM query methods:

- **`querySelector(selector)`**: Finds the first element matching a CSS selector.
- **`querySelectorAll(selector)`**: Finds all elements matching a CSS selector.
- **`getElementById(id)`**
- **`getElementsByClassName(className)`**
- **`getElementsByTagName(tagName)`**

### Serialization

#### `toHTML()`

Serializes the document's DOM tree back into an HTML string.

#### `toString()`

Returns a debug-friendly string representation (e.g., `"WikiDocument[5 nodes, 123 chars]"`).

#### `toJSON()`

Serializes the entire `WikiDocument` state (including `pageData`, `html`, and `metadata`) to a plain JavaScript object suitable for caching.

#### `static fromJSON(json, context)`

A static method that reconstructs a `WikiDocument` instance from a JSON object (retrieved from a cache).

### Utility Methods

- **`getRootElement()`**: Returns the root `<body>` element of the internal DOM.
- **`clear()`**: Removes all content from the document.
- **`getChildCount()`**: Returns the number of top-level nodes.
- **`isEmpty()`**: Returns `true` if the document has no content.
- **`getStatistics()`**: Returns an object with statistics like node count, content length, etc.

---

## The DOM Extraction Pipeline

`WikiDocument` is used by the main `MarkupParser` as part of a multi-stage pipeline that correctly handles both Markdown and JSPWiki syntax.

### Pipeline Overview

```
┌─────────────────────────────────────┐
│   INPUT: Wiki Markup                │
│   "## Welcome\n[{$username}]"       │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   PHASE 1: Extract JSPWiki Syntax   │
│   MarkupParser.extractJSPWikiSyntax()│
│                                     │
│   Scan for [{$var}], [{Plugin}], etc.│
│   Replace them with placeholders.     │
│                                     │
│   Result: "## Welcome\n<span       │
│           data-jspwiki-placeholder...>│
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   PHASE 2: Create DOM Nodes         │
│   MarkupParser.createDOMNode()      │
│                                     │
│   For each extracted element, use a │
│   handler (e.g., DOMVariableHandler)│
│   to create a WikiDocument DOM node.│
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   PHASE 3: Showdown + Merge         │
│   MarkupParser.parseWithDOMExtraction()│
│                                     │
│   A: Showdown parses the sanitized  │
│      markdown into HTML.            │
│      → "<h2>Welcome</h2><p>...</p>" │
│                                     │
│   B: Merge the rendered DOM nodes   │
│      back by replacing placeholders.│
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   OUTPUT: Final HTML                │
│   "<h2>Welcome</h2>                 │
│    <p><span>JohnDoe</span></p>"    │
└─────────────────────────────────────┘
```

This architecture ensures that Showdown only ever sees "safe" markdown, and the JSPWiki handlers only operate on the specific syntax they are designed for, preventing conflicts.

### Style syntax (`%%…/%`) is DOM-native too (#907)

Every `%%…/%` style construct is a first-class citizen of Phase 1 — it extracts to a typed `ExtractedElement`, resolves to a real `WikiDocument` node in Phase 2, and merges back in Phase 3. There are **no post-Showdown string passes** rewriting `%%` markup into HTML. Historically these were patched with regex string-replace steps (the removed "Step 0.55" and `convertInlineCssStyles()`); each new case meant another regex, and the passes fought each other and the markdown converter. The unified extraction replaces all of that.

Two families of style markup, both handled in the extraction phase:

| Form | Example | Extracted as | Resolves to |
|---|---|---|---|
| Block class | `%%information … /%` | `type: 'style-block'` | `<div class="information">` (or `<span>` when inline) |
| Block inline-CSS | `%%(font-size:.9;) … /%` | `type: 'style-block'` + `cssRaw` | `<div style="…">` |
| Inline CSS | `%%(color:red) X /%` | `type: 'inline-style'`, `inlineVariant:'css'` | `<span style="color: red">` |
| Superscript | `%%sup 2 /%` | `type: 'inline-style'`, `inlineVariant:'sup'` | `<sup>2</sup>` |
| Subscript | `%%sub 2 /%` | `type: 'inline-style'`, `inlineVariant:'sub'` | `<sub>2</sub>` |
| Strikethrough | `%%strike gone /%` | `type: 'inline-style'`, `inlineVariant:'strike'` | `<del>gone</del>` |

Ordering and nesting rules that make this robust:

- **Inline extraction runs before block extraction.** Inline swatches like `%%(background:#0FF;) Aqua /%` become inert placeholders first, so their `/%` closers can't be mis-paired with an enclosing block (`%%sortable … /%`). This was the fix for the Color page, where hundreds of swatch closers were confusing the block matcher.
- **Innermost-first for nesting.** The inline matcher treats `/%` and a bare `%%` as closers, but a `%%` that is itself an opener (`%%(`, `%%sup`, `%%sub`, `%%strike`) is **not** a valid closer. That disambiguation means the inner run of `%%(color:red) A %%(font-weight:bold) B /% C /%` matches first, leaving the outer run to resolve around its placeholder — nesting resolves bottom-up.
- **Both `/%` and `%%` close** an inline run (`%%sup 2 %%` and `%%sup 2 /%` are equivalent, per #592).
- **Placeholders are opaque to every downstream stage.** Table-cell population (`populateCell`) and inline-content walking (`appendWikiNodes`) both recognise `data-jspwiki-placeholder` spans, so a styled swatch inside a `|table cell|` merges correctly.

Inline CSS is security-gated. `sanitizeInlineCss()` returns an empty style unless `ngdpbase.style.security.allow-inline-css` is `true` (default **false**); when enabled, only properties in `ngdpbase.style.security.allowed-properties` survive, and values matching `javascript:`, `url(`, `expression(`, or angle brackets are dropped.

> **Deprecated:** `src/parsers/handlers/WikiStyleHandler.ts` was the pre-DOM string-based style processor. It is **unregistered** and retained only for reference/unit coverage — the live path is `MarkupParser` extraction described here. Do not add new style behaviour to `WikiStyleHandler`.

---

## Architecture

### File Structure

```
src/parsers/
├── MarkupParser.js                    # Main parser with the extraction pipeline
└── dom/
    ├── WikiDocument.js                # The WikiDocument class itself
    ├── handlers/
    │   ├── DOMVariableHandler.js      # Creates nodes for [{$vars}]
    │   ├── DOMPluginHandler.js        # Creates nodes for [{Plugins}]
    │   └── DOMLinkHandler.js          # Creates nodes for [Links]
    └── __tests__/
        └── WikiDocument.test.js       # Unit tests for the class
```

### Relationship with WikiContext

`WikiContext` and `WikiDocument` work together but have distinct roles:

- **`WikiContext` (High-Level Orchestrator):** Manages the entire request-to-render lifecycle. It *initiates* the parsing process and holds references to the managers.
- **`WikiDocument` (Low-Level Data Structure):** Represents the content *during* the parsing process. It is created and used internally by `MarkupParser` and its handlers.

```
Request → WikiContext created
              ↓
          Calls RenderingManager
              ↓
          Calls MarkupParser.parse()
              ↓
          MarkupParser uses WikiDocument internally
          in its extraction pipeline
              ↓
          Returns final HTML
```

---

## Usage Examples

### Caching a Parsed Document

`WikiDocument` is designed for efficient caching. Instead of caching the final HTML string, you can cache the serialized `WikiDocument` object.

```javascript
// Check cache first
const cachedJSON = await cache.get(cacheKey);
if (cachedJSON) {
  // Restore from cache, providing a new context
  return WikiDocument.fromJSON(JSON.parse(cachedJSON), newContext);
}

// If not in cache, parse and store
const doc = await parser.parseToDocument(content, context);
await cache.set(cacheKey, JSON.stringify(doc.toJSON()));
return doc;
```

---

## Testing

The `WikiDocument` class and its associated pipeline are thoroughly tested.

- **`src/parsers/dom/__tests__/WikiDocument.test.js`**: Contains **49 tests** covering every method of the `WikiDocument` class, achieving 100% test coverage.
- **Extraction & Merge Tests**: Over 70 additional tests validate the extraction and merge pipeline in `MarkupParser`.

To run the core `WikiDocument` tests:
`npm test -- src/parsers/dom/__tests__/WikiDocument.test.js`

---

## Performance

`WikiDocument` is built on `linkedom`, a high-performance DOM library for Node.js, chosen over heavier alternatives like `jsdom`.

- **Throughput**: Benchmarks show a throughput of over **2,500 pages/second**.
- **Memory Usage**: A cached `WikiDocument` instance for a complex page is only around **21 KB**.
- **Operation Speed**: Most individual DOM operations are sub-millisecond.

The entire DOM extraction pipeline is approximately **20% faster** and uses **10% less memory** than the legacy 7-phase string-based parser it replaced.

---

## Migration Guide for Custom Handlers

If you have written custom parser handlers for the legacy 7-phase system, you will need to migrate them to the new DOM-based approach. A detailed guide with patterns and examples is available at: **[docs/migration/WikiDocument-DOM-Migration.md](./migration/WikiDocument-DOM-Migration.md)**.

---

## Troubleshooting

- **Placeholders visible in output**: This means the merge phase failed. Ensure your custom DOM nodes are being created correctly and have the `data-jspwiki-id` attribute.
- **JSPWiki syntax not processed**: This points to a failure in the extraction phase. Check that your syntax is not inside a code block and that the extraction regex in `MarkupParser.js` is correct.

---

## Related Documentation

This guide consolidates information from many original planning and architecture documents. For historical context or deeper details, see:

- **Summary**: [WikiDocument.md](../../WikiDocument.md)
- **Original Architecture Doc**: [docs/architecture/WikiDocument-DOM-Architecture.md](architecture/WikiDocument-DOM-Architecture.md)
- **Migration Guide**: [docs/migration/WikiDocument-DOM-Migration.md](migration/WikiDocument-DOM-Migration.md)
- **API Reference**: [docs/architecture/WikiDocument-API.md](architecture/WikiDocument-API.md)
- **Initial Research**:
  - [docs/planning/WikiDocument-DOM-Solution.md](planning/WikiDocument-DOM-Solution.md)
  - [docs/architecture/WikiDocument-DOM-Library-Evaluation.md](architecture/WikiDocument-DOM-Library-Evaluation.md)
