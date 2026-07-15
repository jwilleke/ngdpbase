# RenderingManager Complete Guide

**Module:** `src/managers/RenderingManager.js`
**Quick Reference:** [RenderingManager.md](RenderingManager.md)
**Version:** 1.3.2
**Last Updated:** 2025-12-20
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Markdown Features](#markdown-features)
4. [Footnotes Support](#footnotes-support)
5. [Configuration Reference](#configuration-reference)
6. [Parser System](#parser-system)
7. [API Reference](#api-reference)
8. [Usage Examples](#usage-examples)
9. [Integration with Other Managers](#integration-with-other-managers)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The **RenderingManager** is the central coordinator for markdown rendering and wiki markup processing in ngdpbase. It orchestrates the conversion of markdown/wiki markup to HTML, supporting both a modern MarkupParser system and a legacy Showdown-based renderer.

### Key Responsibilities

- **Markdown Rendering**: Convert markdown content to HTML using Showdown with GFM extensions
- **Parser Coordination**: Manage the advanced MarkupParser system and legacy fallback
- **Wiki Link Processing**: Parse and render wiki-style links `[PageName]` and `[Text|Target]`
- **Plugin Expansion**: Integrate with PluginManager for `[{Plugin}]` syntax
- **Variable Expansion**: Process `[{$variable}]` syntax with VariableManager
- **Link Graph Management**: Build and maintain page link relationships for backlinks
- **JSPWiki Table Processing**: Convert JSPWiki-style tables to HTML with styling

### Design Philosophy

The RenderingManager implements a **dual-parser architecture**:

1. **Advanced Parser (Primary)**: Uses MarkupParser with WikiDocument DOM extraction pipeline
2. **Legacy Parser (Fallback)**: Direct Showdown conversion with basic JSPWiki syntax support

This approach provides:

- **Backward Compatibility**: Existing pages render correctly
- **Progressive Enhancement**: New features via MarkupParser
- **Reliability**: Automatic fallback on parser errors
- **Performance Monitoring**: Optional benchmarking between parsers

---

## Architecture

### Component Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                       ngdpbase Engine                               │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  RenderingManager                             │ │
│  │                                                                │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  Showdown Converter (Core Markdown Engine)              │ │ │
│  │  │  ┌───────────────────────────────────────────────────┐  │ │ │
│  │  │  │  Extensions:                                       │  │ │ │
│  │  │  │  • tables                    - GFM tables          │  │ │ │
│  │  │  │  • strikethrough            - ~~text~~            │  │ │ │
│  │  │  │  • tasklists                - [x] checkboxes      │  │ │ │
│  │  │  │  • ghCodeBlocks             - ``` fenced blocks   │  │ │ │
│  │  │  │  • showdown-footnotes       - [^1] footnotes      │  │ │ │
│  │  │  └───────────────────────────────────────────────────┘  │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                                │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  Parser Selection Logic                                  │ │ │
│  │  │  • useAdvancedParser: MarkupParser (DOM extraction)     │ │ │
│  │  │  • fallbackToLegacy: Automatic error recovery           │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                                │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  LinkParser (Centralized link processing)               │ │ │
│  │  │  • Wiki links: [PageName], [Text|Target]                │ │ │
│  │  │  • External links: [Text|http://...]                    │ │ │
│  │  │  • InterWiki links: [Text|Wikipedia:Article]            │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                                │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  Link Graph                                              │ │ │
│  │  │  • Page relationships for backlinks                      │ │ │
│  │  │  • Orphaned page detection                               │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│            ▼                                      ▼                │
│  ┌─────────────────────┐              ┌──────────────────────┐    │
│  │  MarkupParser       │              │  Legacy Pipeline     │    │
│  │  (Advanced)         │              │  (Fallback)          │    │
│  │                     │              │                      │    │
│  │  • DOM Extraction   │              │  • Macro Expansion   │    │
│  │  • Plugin Handling  │              │  • Table Processing  │    │
│  │  • Variable Subst.  │              │  • Link Processing   │    │
│  │  • Showdown Conv.   │              │  • Showdown Conv.    │    │
│  │  • DOM Merging      │              │  • Post-processing   │    │
│  └─────────────────────┘              └──────────────────────┘    │
│                                                                    │
└───────────────────────────────────────────────────────────────────┘
```

### Rendering Pipeline

#### Advanced Parser Pipeline (Primary)

```
User Request: GET /wiki/PageName
    │
    ▼
┌───────────────────────────────────────────┐
│  RenderingManager.renderMarkdown()        │
│  - Checks useAdvancedParser flag          │
│  - Validates MarkupParser availability    │
└───────────┬───────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────┐
│  MarkupParser.parseWithDOMExtraction()    │
│                                            │
│  Phase 1: Extract JSPWiki Syntax          │
│    - Protect code blocks                  │
│    - Extract [{$variables}]               │
│    - Extract [{Plugins}]                  │
│    - Extract [WikiLinks]                  │
│    - Preserve [^footnotes] for Showdown   │
│                                            │
│  Phase 2: Create DOM Nodes                │
│    - Build WikiDocument structure         │
│    - Process variables, plugins, links    │
│                                            │
│  Phase 3: Showdown Markdown Conversion    │
│    - Process markdown syntax              │
│    - Apply footnote extension             │
│    - Generate footnote references         │
│    - Create footnotes section             │
│                                            │
│  Phase 4: Merge DOM Nodes                 │
│    - Replace placeholders with HTML       │
│    - Preserve footnote links              │
└───────────┬───────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────┐
│  Final HTML with:                          │
│  • Rendered markdown                       │
│  • Processed wiki syntax                   │
│  • Clickable footnote references           │
│  • Footnotes section at bottom             │
└───────────────────────────────────────────┘
```

#### Legacy Parser Pipeline (Fallback)

```
Content → Macro Expansion → Table Processing →
Link Processing → Showdown Conversion →
Post-processing → HTML Output
```

---

## Markdown Features

The RenderingManager uses **Showdown 2.1.0** with the following GitHub Flavored Markdown (GFM) features:

### Core Features

| Feature | Syntax | Configuration | Status |
| --------- | -------- | --------------- | -------- |
| **Tables** | `\| Header \| Header \|` | `tables: true` | ✅ Enabled |
| **Strikethrough** | `~~text~~` | `strikethrough: true` | ✅ Enabled |
| **Task Lists** | `- [x] Task` | `tasklists: true` | ✅ Enabled |
| **Fenced Code** | ` ``` code ``` ` | `ghCodeBlocks: true` | ✅ Enabled |
| **Footnotes** | `[^1]` reference | `extensions: [showdownFootnotes]` | ✅ Enabled |
| **Line Breaks** | Double space or `\n` | `simpleLineBreaks: true` | ✅ Enabled |
| **Underscore** | `literal_underscore_handling` | `literalMidWordUnderscores: true` | ✅ Enabled |
| **HTML Escaping** | `\<tag\>` | `backslashEscapesHTMLTags: true` | ✅ Enabled |
| **Sublists** | 2-space indentation | `disableForced4SpacesIndentedSublists: true` | ✅ Enabled |

### Showdown Configuration

The Showdown converter is initialized with these settings in `RenderingManager.js:81-92`:

```javascript
this.converter = new showdown.Converter({
  tables: true,                                // GFM tables support
  strikethrough: true,                         // ~~strikethrough~~ text
  tasklists: true,                             // [x] checkbox lists
  simpleLineBreaks: true,                      // Single newline = <br>
  openLinksInNewWindow: false,                 // Links open in same window
  backslashEscapesHTMLTags: true,              // Escape HTML with backslash
  disableForced4SpacesIndentedSublists: true,  // Allow 2-space sublists
  literalMidWordUnderscores: true,             // Better underscore handling
  ghCodeBlocks: true,                          // GitHub fenced code blocks
  extensions: [showdownFootnotes]              // Footnote extension
});
```

---

## Footnotes Support

### Overview

Footnotes allow you to add notes and references at the bottom of your page without cluttering the main text. ngdpbase implements **GitHub Flavored Markdown (GFM) compatible footnote syntax** using the `showdown-footnotes` extension.

**Added:** Version 1.3.2 (2025-10-16)
**Implementation:** `src/managers/RenderingManager.js:5, 92`
**Extension:** `src/extensions/showdown-footnotes-fixed.js` (patched version with bug fixes)

### Syntax

#### Basic Footnote

**Reference in text:**

```markdown
This is a sentence with a footnote[^1].
```

**Definition at bottom:**

```markdown
[^1]: This is the footnote text.
```

**Rendered output:**

- In text: `This is a sentence with a footnote<sup><a href="#footnote-1">[1]</a></sup>.`
- At bottom: `<small class="footnote" id="footnote-1"><a href="#footnote-1"><sup>[1]</sup></a>: This is the footnote text.</small>`

#### Multiple Footnotes

Footnotes are automatically numbered sequentially based on first appearance:

```markdown
First footnote[^1]. Second footnote[^2]. Third footnote[^3].

[^1]: First note.
[^2]: Second note.
[^3]: Third note.
```

#### Text Identifiers

You can use descriptive identifiers, but output is still numbered:

```markdown
This uses a descriptive identifier[^my-note].

[^my-note]: This will display as [1] in the output.
```

#### Multi-Paragraph Footnotes

Indent continuation lines with **4 spaces** or **1 tab**:

```markdown
This has a longer footnote[^long].

[^long]: This is the first paragraph.

    This is the second paragraph, indented with 4 spaces.

    You can include code blocks, lists, and other markdown:

    - Item 1
    - Item 2

    ```javascript
    const example = "code in footnotes";
    ```
```

### HTML Output

Footnotes generate clean, semantic HTML:

**Footnote Reference:**

```html
<a href="#footnote-1"><sup>[1]</sup></a>
```

**Footnote Definition:**

```html
<small class="footnote" id="footnote-1">
  <a href="#footnote-1"><sup>[1]</sup></a>:
  This is the footnote text.
</small>
```

### Features

✅ **Automatic Numbering** - Sequential numbering regardless of identifier
✅ **Bidirectional Links** - Click to jump to footnote, click to return
✅ **Multi-Paragraph Support** - Rich formatting within footnotes
✅ **Code Block Support** - Syntax highlighting in footnotes
✅ **List Support** - Bullet and numbered lists in footnotes
✅ **GFM Compatible** - Standard GitHub Flavored Markdown syntax

### Implementation Details

#### Custom Extension Patch

ngdpbase uses a **patched version** of `showdown-footnotes` located at `src/extensions/showdown-footnotes-fixed.js` to fix two critical bugs in the original extension:

Bug #1: Missing Global Flag

- **Original:** `/\[\^([\d\w]+)\]/m` - only matches first occurrence
- **Fixed:** `/\[\^([\d\w-]+)\]/mg` - matches all occurrences
- **Impact:** Without this fix, only the first footnote reference on the page would be converted

Bug #2: Missing Hyphen Support

- **Original:** `[\d\w]+` - only matches digits and word characters
- **Fixed:** `[\d\w-]+` - also matches hyphens
- **Impact:** Without this fix, identifiers like `[^my-note]` and `[^long-note]` wouldn't work

These fixes are applied to all three filter functions in the extension (multi-paragraph definitions, single-line definitions, and references).

#### Integration with MarkupParser

Footnote syntax `[^id]` must be **excluded from wiki link processing** to prevent interference:

**MarkupParser.js:1512** - Wiki link extraction excludes footnotes:

```javascript
// Does NOT match: [^id] - markdown footnote references
sanitized = sanitized.replace(/\[([^\]\[\{\^][^\]]*)\](?!\()/g, (match, target) => {
  // Extract wiki links but preserve footnotes for Showdown
});
```

**LinkParserHandler.js:27** - Link handler pattern excludes footnotes:

```javascript
// Excludes markdown footnote syntax [^id] by using negative lookahead (?!\^)
/\[(?!\^)([^\|\]]+)(?:\|([^\|\]]+))?(?:\|([^\]]+))?\](?!\()/g
```

#### Processing Pipeline

1. **Extraction Phase** (MarkupParser)
   - Code blocks protected
   - Wiki syntax extracted: `[{$var}]`, `[{Plugin}]`, `[PageLink]`
   - Footnotes preserved: `[^1]`, `[^my-note]` passed through

2. **Markdown Conversion** (Showdown + showdown-footnotes)
   - Footnote references converted to superscript links
   - Footnote definitions collected and processed
   - Footnotes section generated at end

3. **DOM Merge Phase**
   - Wiki syntax placeholders replaced with HTML
   - Footnote HTML preserved and integrated

### Configuration

Enable/disable footnotes in `config/app-default-config.json`:

```json
{
  "_comment_footnotes": "Markdown footnote configuration",
  "ngdpbase.markdown.footnotes.enabled": true
}
```

### Styling

Footnotes use these HTML elements for styling:

```css
/* Footnote references (superscript in text) */
a sup {
  /* Style the [1] superscript link */
}

/* Footnote definitions (bottom of page) */
small.footnote {
  font-size: 0.875em;
  display: block;
  margin-top: 0.5em;
}

small.footnote a[href^="#footnote-"] {
  /* Style the backlink icon */
}
```

### Examples

See the comprehensive examples page: **[FootnoteExample](/wiki/FootnoteExample)**

#### Academic Citation

```markdown
The study demonstrated significant results[^smith2024].

[^smith2024]: Smith, J. (2024). "Markdown Best Practices."
Journal of Documentation, 15(3), 234-256.
```

#### Technical Note

```markdown
The implementation uses WikiDocument DOM extraction[^implementation].

[^implementation]: The footnote feature is implemented using the
`showdown-footnotes` extension, integrated into RenderingManager
at initialization time. See `src/managers/RenderingManager.js:91`.
```

#### Multiple References

```markdown
Both sources agree[^1][^2] on this point.

[^1]: First Source, 2024.
[^2]: Second Source, 2024.
```

### Best Practices

1. **Place definitions at end** - Keep all `[^id]:` definitions together at the bottom
2. **Use descriptive IDs** - `[^smith2024]` is clearer than `[^1]` in source
3. **Consistent formatting** - Indent continuation lines with exactly 4 spaces
4. **Avoid overuse** - Too many footnotes can be distracting
5. **Test rendering** - Preview to ensure proper formatting

### Troubleshooting

| Issue | Cause | Solution |
| ------- | ------- | ---------- |
| Footnotes render as red links | LinkParser treating `[^1]` as wiki link | Ensure MarkupParser.js:1512 excludes `^` character |
| Definition shows as literal text | Missing colon `:` after identifier | Use `[^1]:` not `[^1]` |
| Multi-paragraph not working | Insufficient indentation | Use exactly 4 spaces or 1 tab |
| Backlink not working | Footnote defined but not referenced | Ensure reference `[^1]` appears in text |

---

## Configuration Reference

### Rendering Configuration

Located in `config/app-default-config.json`:

```json
{
  "_comment_parser": "Parser configuration",
  "jspwiki.parser.useExtractionPipeline": true,

  "_comment_footnotes": "Markdown footnote configuration",
  "ngdpbase.markdown.footnotes.enabled": true,

  "_comment_markup": "MarkupParser configuration",
  "ngdpbase.markup.enabled": true,
  "ngdpbase.markup.use-advanced-parser": true,
  "ngdpbase.markup.fallback-to-legacy": true,
  "ngdpbase.markup.log-parsing-method": true,
  "ngdpbase.markup.performance-comparison": false
}
```

### Parser Selection

The RenderingManager selects a parser based on configuration and availability:

| Condition | Parser Used | Fallback |
| ----------- | ------------- | ---------- |
| `useAdvancedParser: true` + MarkupParser available | MarkupParser | Legacy if error |
| `useAdvancedParser: true` + MarkupParser unavailable | Legacy | None |
| `useAdvancedParser: false` | Legacy | None |
| `fallbackToLegacy: false` | MarkupParser only | Error thrown |

---

## Parser System

### MarkupParser Integration

The RenderingManager integrates with MarkupParser for advanced wiki syntax processing:

```javascript
async renderMarkdown(content, pageName, userContext, requestInfo) {
  const markupParser = this.engine.getManager('MarkupParser');

  if (this.renderingConfig.useAdvancedParser && markupParser) {
    return await markupParser.parse(content, {
      pageName,
      userContext,
      requestInfo,
      renderingManager: this
    });
  }

  // Fallback to legacy
  return await this.renderWithLegacyParser(content, pageName, userContext, requestInfo);
}
```

### Legacy Parser

The legacy parser provides backward compatibility:

1. **Macro Expansion** - Process `[{$variables}]` via VariableManager
2. **Table Processing** - Convert JSPWiki table syntax
3. **Link Processing** - Parse wiki links via LinkParser
4. **Showdown Conversion** - Apply markdown-to-HTML conversion
5. **Post-Processing** - Add table styling and cleanup

---

## API Reference

### RenderingManager Class

#### Constructor

```javascript
constructor(engine)
```

Creates a new RenderingManager instance.

**Parameters:**

- `engine` (WikiEngine): The wiki engine instance

#### Core Methods

##### `initialize(config)`

Initializes the RenderingManager, loads configuration, and sets up Showdown converter.

**Parameters:**

- `config` (Object): Optional configuration object

**Returns:** `Promise<void>`

**Example:**

```javascript
await renderingManager.initialize();
```

##### `renderMarkdown(content, pageName, userContext, requestInfo)`

Renders markdown content to HTML using the configured parser.

**Parameters:**

- `content` (string): Markdown content to render
- `pageName` (string): Name of the current page
- `userContext` (Object): User context for variable expansion
- `requestInfo` (Object): Request information for context

**Returns:** `Promise<string>` - Rendered HTML

**Example:**

```javascript
const html = await renderingManager.renderMarkdown(
  '# Hello\n\nThis is a footnote[^1].\n\n[^1]: Footnote text.',
  'MyPage',
  { username: 'john' },
  { ip: '127.0.0.1' }
);
```

##### `getParser()`

Gets the MarkupParser instance if available and enabled.

**Returns:** `MarkupParser|null`

**Example:**

```javascript
const parser = renderingManager.getParser();
if (parser) {
  console.log('Using advanced MarkupParser');
}
```

#### Legacy Methods

##### `expandMacros(content, pageName, userContext, requestInfo)`

Expands wiki macros and variables (legacy pipeline only).

**Parameters:**

- `content` (string): Content with macros
- `pageName` (string): Page name
- `userContext` (Object): User context
- `requestInfo` (Object): Request info

**Returns:** `Promise<string>` - Content with expanded macros

##### `processJSPWikiTables(content)`

Converts JSPWiki table syntax to HTML (legacy pipeline only).

**Parameters:**

- `content` (string): Content with JSPWiki tables

**Returns:** `string` - Content with HTML tables

##### `processWikiLinks(content)`

Processes wiki-style links `[PageName]` (legacy pipeline only).

**Parameters:**

- `content` (string): Content with wiki links

**Returns:** `Promise<string>` - Content with processed links

#### Link Graph Methods

##### `buildLinkGraph()`

Builds a graph of page links for backlink support.

**Returns:** `Promise<void>`

##### `updateLinkGraph(pageName, links)`

Updates the link graph when a page is saved.

**Parameters:**

- `pageName` (string): Name of the page
- `links` (`Array<string>`): Array of linked page names

**Returns:** `void`

##### `getBacklinks(pageName)`

Gets all pages that link to the specified page.

**Parameters:**

- `pageName` (string): Target page name

**Returns:** `Array<string>` - Array of page names linking to target

##### `getOrphanedPages()`

Finds pages with no incoming links.

**Returns:** `Array<string>` - Array of orphaned page names

---

## Usage Examples

### Basic Page Rendering

```javascript
const renderingManager = engine.getManager('RenderingManager');

const markdown = `
# Welcome

This is a wiki page with a footnote[^1].

[^1]: This is the footnote text.
`;

const html = await renderingManager.renderMarkdown(
  markdown,
  'Welcome',
  { username: 'admin' },
  { ip: '127.0.0.1' }
);

console.log(html);
// Output includes <sup><a href="#footnote-1">[1]</a></sup>
```

### Advanced Features

```javascript
const content = `
# Research Paper

## Introduction

Recent studies show interesting results[^smith2024][^jones2024].

## Methodology

The approach uses WikiDocument extraction[^implementation].

## Footnotes

[^smith2024]: Smith, J. (2024). "Markdown in Academia."
Journal of Documentation, 15(3), 234-256.

[^jones2024]: Jones, A. (2024). "Wiki Systems Analysis."
Tech Review, 8(2), 112-134.

[^implementation]: The system uses DOM extraction to preserve
JSPWiki syntax while allowing Showdown to process markdown features.

    This multi-paragraph footnote includes additional context and
    implementation details for developers.
`;

const html = await renderingManager.renderMarkdown(
  content,
  'ResearchPaper'
);
```

### Link Graph Usage

```javascript
// Build initial link graph
await renderingManager.buildLinkGraph();

// Get backlinks for a page
const backlinks = renderingManager.getBacklinks('HomePage');
console.log('Pages linking to HomePage:', backlinks);

// Find orphaned pages
const orphaned = renderingManager.getOrphanedPages();
console.log('Orphaned pages:', orphaned);

// Update graph when saving a page
renderingManager.updateLinkGraph('NewPage', ['HomePage', 'About']);
```

### Parser Selection

```javascript
// Check which parser is being used
const parser = renderingManager.getParser();

if (parser) {
  console.log('Using MarkupParser with DOM extraction');
  const metrics = parser.getMetrics();
  console.log('Parse count:', metrics.parseCount);
  console.log('Cache hit ratio:', metrics.cacheHits / metrics.parseCount);
} else {
  console.log('Using legacy Showdown parser');
}
```

---

## Integration with Other Managers

### MarkupParser

The RenderingManager delegates to MarkupParser for advanced parsing:

```javascript
// RenderingManager provides context
const parseContext = {
  pageName: 'CurrentPage',
  userContext: { username: 'john' },
  requestInfo: { ip: '127.0.0.1' },
  renderingManager: this
};

// MarkupParser processes with full context
const html = await markupParser.parse(content, parseContext);
```

### VariableManager

Variable expansion is integrated for both parsers:

```javascript
// Variables in content: [{$username}], [{$pagename}]
const html = await renderingManager.renderMarkdown(
  'Welcome, [{$username}]!',
  'Home',
  { username: 'Alice' }
);
// Output: Welcome, Alice!
```

### PluginManager

Plugin syntax is processed by MarkupParser:

```javascript
// Plugins in content: [{TableOfContents}], [{Search}]
const html = await renderingManager.renderMarkdown(
  '[{TableOfContents}]',
  'Home'
);
// Output: Rendered table of contents
```

### PageManager

Link graph integration with page operations:

```javascript
// Update links when saving
const pageManager = engine.getManager('PageManager');

await pageManager.savePage('NewPage', content, metadata);

// RenderingManager automatically updates link graph
const links = extractLinks(content);
renderingManager.updateLinkGraph('NewPage', links);
```

### ConfigurationManager

Configuration is loaded at initialization:

```javascript
const configManager = engine.getManager('ConfigurationManager');

// RenderingManager reads these properties
const useAdvanced = configManager.getProperty('ngdpbase.markup.use-advanced-parser');
const footnotes = configManager.getProperty('ngdpbase.markdown.footnotes.enabled');
```

---

## Best Practices

### 1. Use Advanced Parser

Enable MarkupParser for best features:

```json
{
  "ngdpbase.markup.use-advanced-parser": true,
  "ngdpbase.markup.fallback-to-legacy": true
}
```

### 2. Leverage Footnotes

Use footnotes for citations and technical details:

```markdown
Main text flows naturally[^1] without interruption[^2].

[^1]: Citation or reference.
[^2]: Technical implementation note.
```

### 3. Optimize Link Graph

Build link graph at startup, update incrementally:

```javascript
// At startup
await renderingManager.buildLinkGraph();

// On page save
renderingManager.updateLinkGraph(pageName, extractedLinks);
```

### 4. Monitor Performance

Enable performance comparison during development:

```json
{
  "ngdpbase.markup.performance-comparison": true,
  "ngdpbase.markup.log-parsing-method": true
}
```

### 5. Handle Errors Gracefully

Use fallback for reliability:

```javascript
try {
  return await renderingManager.renderMarkdown(content, pageName);
} catch (error) {
  console.error('Rendering failed:', error);
  // Fallback to plain text or cached version
  return `<pre>${escapeHtml(content)}</pre>`;
}
```

---

## Troubleshooting

### Footnotes Not Rendering

**Symptoms:**

- `[^1]` appears as red wiki link
- Footnote definitions show as literal text

**Diagnosis:**

```bash
# Check if showdown-footnotes is installed
npm list showdown-footnotes

# Check MarkupParser patterns
grep "\\[\\^" src/parsers/MarkupParser.js
grep "\\[\\^" src/parsers/handlers/LinkParserHandler.js
```

**Solution:**

1. Ensure `showdown-footnotes` is installed:

   ```bash
   npm install showdown-footnotes --save
   ```

2. Verify RenderingManager.js:4 imports extension:

   ```javascript
   const showdownFootnotes = require('showdown-footnotes');
   ```

3. Check MarkupParser.js:1512 excludes `^`:

   ```javascript
   /\[([^\]\[\{\^][^\]]*)\](?!\()/g
   ```

4. Check LinkParserHandler.js:27 excludes `^`:

   ```javascript
   /\[(?!\^)([^\|\]]+)(?:\|([^\|\]]+))?(?:\|([^\]]+))?\](?!\()/g
   ```

### Parser Not Selected

**Symptoms:**

- Always using legacy parser
- MarkupParser features not working

**Diagnosis:**

```javascript
const parser = renderingManager.getParser();
console.log('Parser:', parser ? 'MarkupParser' : 'Legacy');

const markupParser = engine.getManager('MarkupParser');
console.log('MarkupParser available:', !!markupParser);
console.log('MarkupParser initialized:', markupParser?.isInitialized());
```

**Solution:**

1. Enable in configuration:

   ```json
   {
     "ngdpbase.markup.enabled": true,
     "ngdpbase.markup.use-advanced-parser": true
   }
   ```

2. Ensure MarkupParser initializes before RenderingManager
3. Check for initialization errors in logs

### Link Graph Stale

**Symptoms:**

- Backlinks not updating
- Orphaned pages incorrect

**Solution:**

```javascript
// Rebuild link graph
await renderingManager.buildLinkGraph();

// Verify
const backlinks = renderingManager.getBacklinks('TestPage');
console.log('Backlinks:', backlinks);
```

### Performance Issues

**Symptoms:**

- Slow page rendering
- High CPU usage

**Diagnosis:**

```javascript
// Enable performance logging
{
  "ngdpbase.markup.performance-comparison": true,
  "ngdpbase.markup.log-parsing-method": true
}
```

**Solution:**

1. Check cache hit ratio:

   ```javascript
   const parser = renderingManager.getParser();
   const metrics = parser?.getMetrics();
   console.log('Cache hit ratio:',
     metrics.cacheHits / metrics.parseCount);
   ```

2. Enable caching:

   ```json
   {
     "ngdpbase.markup.caching": true,
     "ngdpbase.markup.cache-ttl": 300
   }
   ```

3. Optimize content:
   - Reduce plugin usage
   - Minimize complex tables
   - Split large pages

---

## Related Documentation

- [MarkupParser Documentation](./MarkupParser.md)
- [FootnoteExample Page](/wiki/FootnoteExample)
- [LinkParser Documentation](../parsers/LinkParser.md)
- [Showdown Documentation](https://github.com/showdownjs/showdown)
- [showdown-footnotes Extension](https://github.com/Kriegslustig/showdown-footnotes)

---

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 1.3.2 | 2025-10-16 | Added footnotes support via showdown-footnotes extension |
| 1.3.1 | 2025-10-12 | Integrated MarkupParser with DOM extraction pipeline |
| 1.3.0 | 2025-10-01 | Added dual-parser architecture with fallback |
| 1.2.0 | 2025-09-15 | Implemented LinkParser integration |
| 1.1.0 | 2025-09-01 | Added link graph for backlinks support |
| 1.0.0 | 2025-08-01 | Initial RenderingManager implementation |

---

**Last Updated:** 2025-10-16
**Maintained By:** ngdpbase Development Team
**Status:** Production Ready ✅
