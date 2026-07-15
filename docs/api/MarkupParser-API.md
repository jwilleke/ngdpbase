# MarkupParser API Documentation

**Version:** 1.3.2 (Phase 6 Complete)
**Last Updated:** 2025-10-13
**Related Issues:** #114-#120

## Overview

The `MarkupParser` is the core parsing engine for ngdpbase, responsible for converting wiki markup into HTML. As of Phase 6 (Issue #120), it supports two parsing pipelines:

1. **Primary Pipeline** (default): WikiDocument DOM extraction (Issues #115-#120)
2. **Legacy Pipeline**: 7-phase string-based parser (deprecated, fallback only)

## Quick Start

```javascript
const MarkupParser = require('./src/parsers/MarkupParser');

// Initialize parser
const parser = new MarkupParser(engine);
await parser.initialize();

// Parse content (automatically uses extraction pipeline)
const html = await parser.parse(content, {
  pageName: 'HomePage',
  userName: 'JohnDoe'
});
```

## Configuration

### Parser Selection

**config/app-default-config.json:**

```json
{
  "jspwiki.parser.useExtractionPipeline": true  // Default: use new pipeline
}
```

**Options:**

- `true` (default): Use WikiDocument DOM extraction pipeline
- `false`: Use legacy 7-phase pipeline

## Primary API Methods

### parse(content, context)

Main entry point for parsing. Automatically selects the appropriate pipeline based on configuration.

**Parameters:**

- `content` (string): Raw wiki markup to parse
- `context` (Object): Rendering context
  - `pageName` (string): Name of the page being rendered
  - `userName` (string): Current user name
  - Additional context properties as needed

**Returns:** `Promise<string>` - Rendered HTML

**Behavior:**

1. Checks configuration for `jspwiki.parser.useExtractionPipeline`
2. Routes to `parseWithDOMExtraction()` if enabled (default)
3. Falls back to legacy parser if disabled or on error
4. Integrates with cache for performance
5. Tracks metrics and performance

**Example:**

```javascript
const html = await parser.parse('## Welcome\n\nHello [{$username}]!', {
  pageName: 'Welcome',
  userName: 'Alice'
});
// Result: <h2 id="welcome">Welcome</h2><p>Hello <span>Alice</span>!</p>
```

---

## WikiDocument DOM Extraction Pipeline (New)

### parseWithDOMExtraction(content, context)

**New in:** Phase 3 (Issue #117)

Parses wiki markup using the WikiDocument DOM extraction pipeline. This is the primary parsing method that fixes the markdown heading bug and provides robust JSPWiki syntax processing.

**Parameters:**

- `content` (string): Wiki markup content to parse
- `context` (Object): Rendering context

**Returns:** `Promise<string>` - Rendered HTML

**Pipeline Steps:**

1. Extract JSPWiki syntax (`extractJSPWikiSyntax()`)
2. Create WikiDocument DOM nodes (`createDOMNode()`)
3. Parse markdown with Showdown
4. Merge DOM nodes into HTML (`mergeDOMNodes()`)

**Example:**

```javascript
const content = `
## Features

- Variables: [{$username}]
- Plugins: [{TOC}]
- Links: [HomePage]
`;

const html = await parser.parseWithDOMExtraction(content, {
  pageName: 'Features',
  userName: 'Bob'
});
```

**Features:**

- No markdown/JSPWiki conflicts
- Correct heading rendering
- Code block protection
- Escaped syntax support
- Nested syntax handling

**Performance:**

- Typical page: <50ms
- Large page (5KB): <100ms
- Cache integrated

---

### extractJSPWikiSyntax(content, context)

**New in:** Phase 1 (Issue #115)

Extracts JSPWiki syntax elements from content before markdown parsing. Replaces JSPWiki syntax with HTML comment placeholders to prevent markdown interference.

**Parameters:**

- `content` (string): Raw wiki markup
- `context` (Object): Rendering context (optional)

**Returns:** `Object`

- `sanitized` (string): Content with placeholders
- `jspwikiElements` (Array): Extracted elements with metadata
- `uuid` (string): Unique identifier for this extraction

**Extracted Elements:**

- **Variables**: `[{$varname}]`
- **Plugins**: `[{PluginName param="value"}]`
- **Wiki Links**: `[PageName]` or `[Text|PageName]`
- **Escaped Syntax**: `[[{$var}]` → literal `[{$var}]`

**Example:**

```javascript
const { sanitized, jspwikiElements, uuid } = parser.extractJSPWikiSyntax(
  'User: [{$username}] on [HomePage]',
  { userName: 'Charlie' }
);

// sanitized: "User: <!--JSPWIKI-abc12345-0--> on <!--JSPWIKI-abc12345-1-->"
// jspwikiElements: [
//   { type: 'variable', varName: '$username', id: 0, ... },
//   { type: 'link', target: 'HomePage', id: 1, ... }
// ]
// uuid: "abc12345"
```

**Features:**

- **Code Block Protection**: JSPWiki syntax in `` ` `` or ``` blocks not extracted
- **UUID-based Placeholders**: Prevents conflicts with user content
- **HTML Comment Format**: `<!--JSPWIKI-uuid-id-->` preserved by Showdown
- **Order-Independent**: Extraction order doesn't affect result

---

### createDOMNode(element, context, wikiDocument)

**New in:** Phase 2 (Issue #116)

Creates a WikiDocument DOM node from an extracted JSPWiki element. Routes to appropriate handler based on element type.

**Parameters:**

- `element` (Object): Extracted element from `extractJSPWikiSyntax()`
  - `type` (string): 'variable', 'plugin', 'link', or 'escaped'
  - `id` (number): Element ID for placeholder matching
  - Additional type-specific properties
- `context` (Object): Rendering context
- `wikiDocument` (WikiDocument): WikiDocument instance for node creation

**Returns:** `Promise<Element>` - WikiDocument DOM node

**Element Types:**

- **variable**: Routes to `DOMVariableHandler.createNodeFromExtract()`
- **plugin**: Routes to `DOMPluginHandler.createNodeFromExtract()`
- **link**: Routes to `DOMLinkHandler.createNodeFromExtract()`
- **escaped**: Creates text node with literal content

**Example:**

```javascript
const WikiDocument = require('./dom/WikiDocument');
const wikiDocument = new WikiDocument();

const element = {
  type: 'variable',
  varName: '$username',
  id: 0,
  syntax: '[{$username}]'
};

const node = await parser.createDOMNode(element, context, wikiDocument);
// Returns: <span data-variable="username" class="wiki-variable">Alice</span>
```

**Error Handling:**

- Returns error node on failure
- Logs error message
- Parsing continues for other elements

---

### mergeDOMNodes(html, nodes, uuid)

**New in:** Phase 3 (Issue #117)

Merges WikiDocument DOM nodes back into Showdown-generated HTML by replacing placeholders with rendered nodes.

**Parameters:**

- `html` (string): Showdown-generated HTML with placeholders
- `nodes` (`Array<Element>`): Array of WikiDocument DOM nodes
- `uuid` (string): UUID from extraction (for placeholder matching)

**Returns:** `string` - Final HTML with nodes merged

**Algorithm:**

1. Sort nodes by ID in descending order (handles nested syntax)
2. For each node, find its placeholder `<!--JSPWIKI-uuid-id-->`
3. Replace placeholder with `node.outerHTML` or `node.textContent`
4. Return final HTML

**Example:**

```javascript
const html = '<p>User: <!--JSPWIKI-abc12345-0--></p>';
const nodes = [/* WikiDocument nodes */];
const uuid = 'abc12345';

const final = parser.mergeDOMNodes(html, nodes, uuid);
// Result: '<p>User: <span class="wiki-variable">Alice</span></p>'
```

**Features:**

- **Descending ID Order**: Handles nested JSPWiki syntax correctly
- **Safe Replacement**: Regex escaping prevents injection
- **Preserves HTML**: Showdown-generated HTML structure maintained

---

## Helper Methods

### createTextNodeForEscaped(element, wikiDocument)

Creates a text node for escaped JSPWiki syntax.

**Parameters:**

- `element` (Object): Escaped element with `literal` property
- `wikiDocument` (WikiDocument): WikiDocument instance

**Returns:** `TextNode` - DOM text node

**Example:**

```javascript
const element = {
  type: 'escaped',
  literal: '[{$var}]',  // What should appear in output
  id: 0
};

const node = parser.createTextNodeForEscaped(element, wikiDocument);
// node.textContent === '[{$var}]'
```

---

## Legacy API Methods (Deprecated)

### initializePhases()

**@deprecated** Initializes the legacy 7-phase pipeline.

Use `parseWithDOMExtraction()` instead for new code.

### executePhase(phase, content, context)

**@deprecated** Executes a single phase of the legacy pipeline.

---

## Configuration Properties

### Parser Configuration

```json
{
  "_comment_parser": "Parser configuration",
  "jspwiki.parser.useExtractionPipeline": true,
  "ngdpbase.parser.enabled": true
}
```

**Properties:**

- `jspwiki.parser.useExtractionPipeline` (boolean): Use extraction pipeline (default: `true`)
- `ngdpbase.parser.enabled` (boolean): Enable MarkupParser (default: `true`)

### Cache Configuration

```json
{
  "ngdpbase.markup.cache.parse-results.enabled": true,
  "ngdpbase.markup.cache.parse-results.ttl": 300000,
  "ngdpbase.markup.cache.parse-results.max-size": 1000
}
```

### Performance Configuration

```json
{
  "ngdpbase.markup.performance.monitoring": true,
  "ngdpbase.markup.performance.alert-thresholds.parse-time": 1000
}
```

---

## Context Object Structure

The `context` object provides page and user information:

```javascript
{
  // Required
  pageName: 'HomePage',
  userName: 'JohnDoe',

  // Optional
  pageContext: {
    name: 'HomePage',
    version: 1,
    author: 'JohnDoe',
    lastModified: Date
  },

  userContext: {
    username: 'JohnDoe',
    email: 'john@example.com',
    roles: ['user', 'editor']
  },

  requestInfo: {
    method: 'GET',
    url: '/wiki/HomePage',
    headers: {}
  }
}
```

---

## Error Handling

### Extraction Pipeline Errors

The parser implements three-level fallback:

1. **Primary**: Extraction pipeline
2. **Fallback**: Legacy 7-phase parser
3. **Ultimate**: Return original content

**Example:**

```javascript
try {
  // Try extraction pipeline
  return await this.parseWithDOMExtraction(content, context);
} catch (error) {
  console.error('Extraction pipeline error:', error);
  // Falls through to legacy parser
}
```

### Error Nodes

When JSPWiki element processing fails, an error node is created:

```html
<span class="wiki-error" data-jspwiki-id="0">[Error: Plugin execution failed]</span>
```

---

## Performance Characteristics

### Extraction Pipeline

**Typical Performance:**

- Small page (<1KB): <10ms
- Medium page (1-5KB): <50ms
- Large page (5-10KB): <100ms
- Very large page (10KB+): <500ms

**Scaling:**

- Extraction: O(n) where n = content length
- DOM Creation: O(m) where m = number of JSPWiki elements
- Merge: O(m log m) due to sorting

### Cache Integration

The parser integrates with ngdpbase's cache system:

- **Parse Results Cache**: Caches final HTML output
- **TTL**: 5 minutes (configurable)
- **Max Size**: 1000 entries (configurable)
- **Hit Ratio**: Typically 70-90% on production sites

---

## Examples

### Basic Usage

```javascript
// Simple page
const html = await parser.parse('## Hello World', {});
```

### Variables

```javascript
const html = await parser.parse('User: [{$username}]', {
  userName: 'Alice'
});
// Result includes: <span class="wiki-variable">Alice</span>
```

### Plugins

```javascript
const html = await parser.parse('[{TableOfContents}]', {
  pageName: 'Features'
});
// Result includes: <div class="toc">...</div>
```

### Wiki Links

```javascript
const html = await parser.parse('See [HomePage] for details', {});
// Result includes: <a href="/wiki/HomePage">HomePage</a>
```

### Complex Page

```javascript
const content = `
# Welcome to ngdpbase

Current user: [{$username}]

## Contents

[{TOC}]

## Features

- Variables: [{$applicationname}]
- Links: [HomePage]
- Escaped: [[{$literal}]
`;

const html = await parser.parse(content, {
  pageName: 'Welcome',
  userName: 'Bob'
});
```

---

## Migration Guide

### From Legacy Parser

**Before (Manual Phase Management):**

```javascript
// Don't do this anymore
const phases = parser.phases;
let content = originalContent;
for (const phase of phases) {
  content = await phase.process(content, context);
}
```

**After (Use Primary Method):**

```javascript
// Do this instead
const html = await parser.parse(content, context);
// Automatically uses extraction pipeline
```

### Custom Handlers

If you have custom syntax handlers, see the [Migration Guide](../migration/WikiDocument-DOM-Migration.md) for details on adapting them to the new pipeline.

---

## Troubleshooting

### Issue: Placeholders visible in output

**Symptom:** `<!--JSPWIKI-abc12345-0-->` appears in rendered page

**Cause:** DOM node not created or merge failed

**Solution:**

1. Check handler initialization: `await parser.initialize()`
2. Check error logs for handler failures
3. Verify WikiDocument is created correctly

### Issue: Markdown not rendering

**Symptom:** Markdown syntax (`##`, `**`, etc.) appears literally

**Cause:** Showdown not configured or extraction conflict

**Solution:**

1. Verify RenderingManager has Showdown converter
2. Check that JSPWiki syntax is extracted before Showdown runs
3. Verify `jspwiki.parser.useExtractionPipeline = true`

### Issue: Variables not expanding

**Symptom:** `[{$username}]` appears literally instead of expanding

**Cause:** VariableManager not initialized or handler error

**Solution:**

1. Ensure `await parser.initialize()` is called
2. Check VariableManager is available: `engine.getManager('VariableManager')`
3. Check error logs for handler failures
4. Verify variable exists in VariableManager

### Issue: Slow parsing

**Symptom:** Page loads take >1 second

**Cause:** Large page, many elements, or cache disabled

**Solution:**

1. Enable parse results cache: `ngdpbase.markup.cache.parse-results.enabled = true`
2. Check page size (consider breaking up large pages)
3. Monitor logs for slow parse warnings
4. Check for plugin performance issues

---

## Testing

### Unit Tests

**Extraction Tests:**

```bash
npm test -- src/parsers/__tests__/MarkupParser-Extraction.test.js
```

**Merge Pipeline Tests:**

```bash
npm test -- src/parsers/__tests__/MarkupParser-MergePipeline.test.js
```

**Comprehensive Tests:**

```bash
npm test -- src/parsers/__tests__/MarkupParser-Comprehensive.test.js
```

### Integration Testing

See [Phase 5 Manual QA Plan](../testing/Phase5-Manual-QA-Plan.md) for comprehensive testing procedures.

---

## References

### Related Documentation

- [WikiDocument DOM Architecture](../architecture/WikiDocument-DOM-Architecture.md)
- [Current Rendering Pipeline](../architecture/Current-Rendering-Pipeline.md)
- [Migration Guide](../migration/WikiDocument-DOM-Migration.md)
- [Phase 5 QA Plan](../testing/Phase5-Manual-QA-Plan.md)

### Related Issues

- #114 - WikiDocument DOM Solution (Epic)
- #115 - Phase 1: Extraction
- #116 - Phase 2: DOM Node Creation
- #117 - Phase 3: Merge Pipeline
- #118 - Phase 4: Documentation
- #119 - Phase 5: Comprehensive Testing
- #120 - Phase 6: Production Integration
- #121 - Phase 7: Cleanup & Documentation
- #110 - Markdown heading bug (fixed)
- #93 - Original DOM migration

### External References

- [Showdown Documentation](https://github.com/showdownjs/showdown)
- [JSPWiki MarkupParser](https://github.com/apache/jspwiki)
- [linkedom Documentation](https://github.com/WebReflection/linkedom)

---

## Changelog

### Phase 6 (Issue #120) - Production Integration

- ✅ Integrated extraction pipeline into `parse()` method
- ✅ Added configuration property `jspwiki.parser.useExtractionPipeline`
- ✅ Implemented automatic fallback to legacy parser
- ✅ Added performance monitoring and logging
- ✅ Default changed to use extraction pipeline

### Phase 3 (Issue #117) - Merge Pipeline

- ✅ Added `parseWithDOMExtraction()` method
- ✅ Added `mergeDOMNodes()` method
- ✅ Integrated with Showdown for markdown parsing

### Phase 2 (Issue #116) - DOM Node Creation

- ✅ Added `createDOMNode()` method
- ✅ Integrated DOM handlers for variables, plugins, links

### Phase 1 (Issue #115) - Extraction

- ✅ Added `extractJSPWikiSyntax()` method
- ✅ Implemented code block protection
- ✅ Added UUID-based placeholder system

---

**Last Updated:** 2025-10-13
**Maintainer:** ngdpbase Team
**Status:** Production Ready
