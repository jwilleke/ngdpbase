# RenderingManager Complete Guide

__Module:__ `src/managers/RenderingManager.js`
__Quick Reference:__ [RenderingManager.md](RenderingManager.md)
__Version:__ 1.4.0
__Last Updated:__ 2026-09-12
__Status:__ Production Ready

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

The __RenderingManager__ is the central coordinator for markdown rendering and wiki markup processing in ngdpbase. It orchestrates the conversion of markdown/wiki markup to HTML, supporting both a modern MarkupParser system and a legacy renderer that runs markdown-it directly.

### Key Responsibilities

- __Markdown Rendering__: Convert markdown content to HTML using markdown-it (the `page` profile of `src/rendering/markdownConverter.ts`)
- __Parser Coordination__: Manage the advanced MarkupParser system and legacy fallback
- __Wiki Link Processing__: Parse and render wiki-style links `[PageName]` and `[Text|Target]`
- __Plugin Expansion__: Integrate with PluginManager for `[{Plugin}]` syntax
- __Variable Expansion__: Process `[{$variable}]` syntax with VariableManager
- __Link Graph Management__: Build and maintain page link relationships for backlinks
- __JSPWiki Table Processing__: Convert JSPWiki-style tables to HTML with styling

### Design Philosophy

The RenderingManager implements a __dual-parser architecture__:

1. __Advanced Parser (Primary)__: Uses MarkupParser with WikiDocument DOM extraction pipeline
2. __Legacy Parser (Fallback)__: Direct markdown-it conversion with basic JSPWiki syntax support

This approach provides:

- __Backward Compatibility__: Existing pages render correctly
- __Progressive Enhancement__: New features via MarkupParser
- __Reliability__: Automatic fallback on parser errors
- __Performance Monitoring__: Optional benchmarking between parsers

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
│  │  │  markdown-it Converter (page profile)                   │ │ │
│  │  │  ┌───────────────────────────────────────────────────┐  │ │ │
│  │  │  │  src/rendering/markdownConverter.ts:              │  │ │ │
│  │  │  │  • breaks: true           - newline = <br>        │  │ │ │
│  │  │  │  • tables, fences, ~~x~~  - built in              │  │ │ │
│  │  │  │  • markdown-it-task-lists - [x] checkboxes        │  │ │ │
│  │  │  │  • markdown-it-sub / -sup - H~2~O, X^2^           │  │ │ │
│  │  │  │  • markdown-it-anchor     - heading ids           │  │ │ │
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
│  │  • markdown-it      │              │  • markdown-it       │    │
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
│    - Extract [^footnotes]                 │
│                                            │
│  Phase 2: Create DOM Nodes                │
│    - Build WikiDocument structure         │
│    - Process variables, plugins, links,   │
│      footnotes                            │
│                                            │
│  Phase 3: markdown-it Conversion          │
│    - Process markdown (page profile)      │
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
Link Processing → markdown-it Conversion →
Post-processing → HTML Output
```

---

## Markdown Features

The RenderingManager converts markdown with __markdown-it__, `page` profile. Every option is set in one place, `src/rendering/markdownConverter.ts`, and pinned by `src/rendering/__tests__/markdownConverter.test.ts`.

### Core Features

| Feature | Syntax | Configuration | Status |
| --------- | -------- | --------------- | -------- |
| __Tables__ | `\| Header \| Header \|` | markdown-it built in (GFM tables) | ✅ Enabled |
| __Strikethrough__ | `~~text~~` | markdown-it built in; renders `<del>` | ✅ Enabled |
| __Task Lists__ | `- [x] Task` | `markdown-it-task-lists` | ✅ Enabled |
| __Fenced Code__ | ` ``` code ``` ` | markdown-it built in; keeps `class="js language-js"` | ✅ Enabled |
| __Footnotes__ | `[^1]` reference | MarkupParser DOM pipeline, not the converter — see [Footnotes Support](#footnotes-support) | ✅ Enabled |
| __Line Breaks__ | single newline | `breaks: true` (a single newline is a line break) | ✅ Enabled |
| __Underscore__ | `foo_bar_baz` | CommonMark: mid-word underscores stay plain text | ✅ Enabled |
| __HTML Escaping__ | `\<tag\>` | CommonMark backslash escape: `\<div>` shows the letters | ✅ Enabled |
| __Sublists__ | 2-space indentation | CommonMark list nesting | ✅ Enabled |
| __Heading IDs__ | `## Title` | `markdown-it-anchor`, slug from `SectionUtils.headingSlug` | ✅ Enabled |
| __Sub/Superscript__ | `H~2~O`, `X^2^` | `markdown-it-sub` / `markdown-it-sup` (no spaces inside) | ✅ Enabled |
| __Ellipsis__ | `...` | becomes `…` in text, never in code (`typographer: false`) | ✅ Enabled |
| __Bare URLs__ | `https://example.com` | not auto-linked (`linkify: false`) | ❌ Off |

### markdown-it Configuration

RenderingManager asks for the page converter in `initialize()`:

```javascript
this.converter = createMarkdownConverter('page');
```

The `page` profile in `src/rendering/markdownConverter.ts`:

```javascript
const md = new MarkdownIt({ html: true, breaks: true, linkify: false, typographer: false });
// renderer rules: fence classes "js language-js", <del> for ~~x~~, "..." → "…" in text
md.use(anchor, { slugify: headingSlug, tabIndex: false }); // heading ids
md.use(sub);                                              // H~2~O
md.use(sup);                                              // X^2^
md.use(taskLists);                                        // - [x]
```

The same file builds two more profiles: `untrusted` for comments (no heading ids, task lists or sub/superscript) and `fallback` for degraded paths (plain CommonMark, no single-newline breaks).

markdown-it replaced showdown 2.1.0 in [#1273](https://github.com/jwilleke/ngdpbase/issues/1273), and showdown was removed in [#1274](https://github.com/jwilleke/ngdpbase/issues/1274). Each deliberate rendering difference is a decision (R1–R17) in the [#1271 decision log](https://github.com/jwilleke/ngdpbase/issues/1271#issuecomment-5617541677).

---

## Footnotes Support

### Overview

Footnotes allow you to add notes and references at the bottom of your page without cluttering the main text. ngdpbase implements __GitHub Flavored Markdown (GFM) compatible footnote syntax__ in MarkupParser's WikiDocument DOM pipeline, not in the markdown converter.

__Added:__ Version 1.3.2 (2025-10-16)
__Implementation:__ `src/parsers/MarkupParser.ts` — `extractJSPWikiSyntax()` extracts references and definitions, `createDOMNode()` renders them

### Syntax

#### Basic Footnote

__Reference in text:__

```markdown
This is a sentence with a footnote[^1].
```

__Definition at bottom:__

```markdown
[^1]: This is the footnote text.
```

__Rendered output:__

- In text: `This is a sentence with a footnote<a id="footnote-ref-1" href="#footnote-1" class="footnote-ref"><sup>[1]</sup></a>.`
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

Indent continuation lines with __4 spaces__ or __1 tab__:

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

__Footnote Reference:__

```html
<a id="footnote-ref-1" href="#footnote-1" class="footnote-ref"><sup>[1]</sup></a>
```

__Footnote Definition:__

```html
<small class="footnote" id="footnote-1">
  <a href="#footnote-1"><sup>[1]</sup></a>:
  This is the footnote text.
</small>
```

### Features

✅ __Automatic Numbering__ - Sequential numbering regardless of identifier
✅ __Bidirectional Links__ - Click to jump to footnote, click to return
✅ __Multi-Paragraph Support__ - Rich formatting within footnotes
✅ __Code Block Support__ - Syntax highlighting in footnotes
✅ __List Support__ - Bullet and numbered lists in footnotes
✅ __GFM Compatible__ - Standard GitHub Flavored Markdown syntax

### Implementation Details

#### Retired: showdown-footnotes patch

Footnotes were once rendered by a patched copy of the `showdown-footnotes` extension. The DOM pipeline below had already taken over, and the patch was removed with showdown in [#1274](https://github.com/jwilleke/ngdpbase/issues/1274).

#### Integration with MarkupParser

Footnote syntax is extracted before markdown conversion, so it never reaches the converter or the wiki-link handlers:

__`extractJSPWikiSyntax()` Steps 3.5 / 3.6__ — definitions (`[^id]: text`, and multi-line definitions with indented continuation lines) become `footnote-def` elements. They run before Step 4 so the `[^id]` on a definition line is not taken as a reference.

__`extractJSPWikiSyntax()` Step 4__ — the bracket scanner classifies `[^id]` as a `footnote-ref`, not a wiki link:

```javascript
} else if (inner.startsWith('^')) {
  // [^id] → footnote reference
  jspwikiElements.push({ type: 'footnote-ref', footnoteId: inner.slice(1), /* … */ });
}
```

__LinkParserHandler__ — the link pattern excludes footnote syntax:

```javascript
// Excludes markdown footnote syntax [^id] by using negative lookahead (?!\^)
/\[(?!\^)([^|\]]+)(?:\|([^|\]]+))?(?:\|([^\]]+))?\](?!\()/g
```

#### Processing Pipeline

1. __Extraction Phase__ (MarkupParser)
   - Code blocks protected
   - Wiki syntax extracted: `[{$var}]`, `[{Plugin}]`, `[PageLink]`
   - Footnotes extracted: `[^1]`, `[^my-note]` become `footnote-ref` / `footnote-def` elements
   - Each element becomes a WikiDocument DOM node (`createDOMNode()`)

2. __Markdown Conversion__ (markdown-it, `page` profile)
   - Footnote placeholders pass through untouched

3. __DOM Merge Phase__
   - Wiki syntax and footnote placeholders replaced with the rendered nodes

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

See the comprehensive examples page: __[FootnoteExample](/wiki/FootnoteExample)__

#### Academic Citation

```markdown
The study demonstrated significant results[^smith2024].

[^smith2024]: Smith, J. (2024). "Markdown Best Practices."
Journal of Documentation, 15(3), 234-256.
```

#### Technical Note

```markdown
The implementation uses WikiDocument DOM extraction[^implementation].

[^implementation]: The footnote feature is implemented in the
MarkupParser DOM pipeline. See `src/parsers/MarkupParser.ts`.
```

#### Multiple References

```markdown
Both sources agree[^1][^2] on this point.

[^1]: First Source, 2024.
[^2]: Second Source, 2024.
```

### Best Practices

1. __Place definitions at end__ - Keep all `[^id]:` definitions together at the bottom
2. __Use descriptive IDs__ - `[^smith2024]` is clearer than `[^1]` in source
3. __Consistent formatting__ - Indent continuation lines with exactly 4 spaces
4. __Avoid overuse__ - Too many footnotes can be distracting
5. __Test rendering__ - Preview to ensure proper formatting

### Troubleshooting

| Issue | Cause | Solution |
| ------- | ------- | ---------- |
| Footnotes render as red links | LinkParser treating `[^1]` as wiki link | Ensure the Step 4 bracket scanner in `extractJSPWikiSyntax()` classifies `^` as a footnote reference |
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

1. __Macro Expansion__ - Process `[{$variables}]` via VariableManager
2. __Table Processing__ - Convert JSPWiki table syntax
3. __Link Processing__ - Parse wiki links via LinkParser
4. __markdown-it Conversion__ - Apply markdown-to-HTML conversion (`page` profile)
5. __Post-Processing__ - Add table styling and cleanup

---

## API Reference

### RenderingManager Class

#### Constructor

```javascript
constructor(engine)
```

Creates a new RenderingManager instance.

__Parameters:__

- `engine` (WikiEngine): The wiki engine instance

#### Core Methods

##### `initialize(config)`

Initializes the RenderingManager, loads configuration, and sets up the markdown-it page converter (`createMarkdownConverter('page')`).

__Parameters:__

- `config` (Object): Optional configuration object

__Returns:__ `Promise<void>`

__Example:__

```javascript
await renderingManager.initialize();
```

##### `renderMarkdown(content, pageName, userContext, requestInfo)`

Renders markdown content to HTML using the configured parser.

__Parameters:__

- `content` (string): Markdown content to render
- `pageName` (string): Name of the current page
- `userContext` (Object): User context for variable expansion
- `requestInfo` (Object): Request information for context

__Returns:__ `Promise<string>` - Rendered HTML

__Example:__

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

__Returns:__ `MarkupParser|null`

__Example:__

```javascript
const parser = renderingManager.getParser();
if (parser) {
  console.log('Using advanced MarkupParser');
}
```

#### Legacy Methods

##### `expandMacros(content, pageName, userContext, requestInfo)`

Expands wiki macros and variables (legacy pipeline only).

__Parameters:__

- `content` (string): Content with macros
- `pageName` (string): Page name
- `userContext` (Object): User context
- `requestInfo` (Object): Request info

__Returns:__ `Promise<string>` - Content with expanded macros

##### `processJSPWikiTables(content)`

Converts JSPWiki table syntax to HTML (legacy pipeline only).

__Parameters:__

- `content` (string): Content with JSPWiki tables

__Returns:__ `string` - Content with HTML tables

##### `processWikiLinks(content)`

Processes wiki-style links `[PageName]` (legacy pipeline only).

__Parameters:__

- `content` (string): Content with wiki links

__Returns:__ `Promise<string>` - Content with processed links

#### Link Graph Methods

##### `buildLinkGraph()`

Builds a graph of page links for backlink support.

__Returns:__ `Promise<void>`

##### `updateLinkGraph(pageName, links)`

Updates the link graph when a page is saved.

__Parameters:__

- `pageName` (string): Name of the page
- `links` (`Array<string>`): Array of linked page names

__Returns:__ `void`

##### `getBacklinks(pageName)`

Gets all pages that link to the specified page.

__Parameters:__

- `pageName` (string): Target page name

__Returns:__ `Array<string>` - Array of page names linking to target

##### `getOrphanedPages()`

Finds pages with no incoming links.

__Returns:__ `Array<string>` - Array of orphaned page names

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
// Output includes <a id="footnote-ref-1" href="#footnote-1" class="footnote-ref"><sup>[1]</sup></a>
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
JSPWiki syntax while allowing markdown-it to process markdown features.

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
  console.log('Using legacy parser (markdown-it only)');
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

__Symptoms:__

- `[^1]` appears as red wiki link
- Footnote definitions show as literal text

__Diagnosis:__

```bash
# Check MarkupParser footnote extraction
grep -n "footnote" src/parsers/MarkupParser.ts
grep -n "\\[\\^" src/parsers/handlers/LinkParserHandler.ts
```

__Solution:__

1. Check `extractJSPWikiSyntax()` in `src/parsers/MarkupParser.ts`: Steps 3.5 / 3.6 extract `[^id]: text` definitions, and the Step 4 bracket scanner classifies `[^id]` as a footnote reference.

2. Check LinkParserHandler excludes `^`:

   ```javascript
   /\[(?!\^)([^|\]]+)(?:\|([^|\]]+))?(?:\|([^\]]+))?\](?!\()/g
   ```

### Parser Not Selected

__Symptoms:__

- Always using legacy parser
- MarkupParser features not working

__Diagnosis:__

```javascript
const parser = renderingManager.getParser();
console.log('Parser:', parser ? 'MarkupParser' : 'Legacy');

const markupParser = engine.getManager('MarkupParser');
console.log('MarkupParser available:', !!markupParser);
console.log('MarkupParser initialized:', markupParser?.isInitialized());
```

__Solution:__

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

__Symptoms:__

- Backlinks not updating
- Orphaned pages incorrect

__Solution:__

```javascript
// Rebuild link graph
await renderingManager.buildLinkGraph();

// Verify
const backlinks = renderingManager.getBacklinks('TestPage');
console.log('Backlinks:', backlinks);
```

### Performance Issues

__Symptoms:__

- Slow page rendering
- High CPU usage

__Diagnosis:__

```javascript
// Enable performance logging
{
  "ngdpbase.markup.performance-comparison": true,
  "ngdpbase.markup.log-parsing-method": true
}
```

__Solution:__

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
- [markdown-it Documentation](https://github.com/markdown-it/markdown-it)

---

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 1.4.0 | 2026-09-12 | markdown-it replaced showdown ([#1273](https://github.com/jwilleke/ngdpbase/issues/1273)); showdown removed ([#1274](https://github.com/jwilleke/ngdpbase/issues/1274)) |
| 1.3.2 | 2025-10-16 | Added footnotes support via showdown-footnotes extension |
| 1.3.1 | 2025-10-12 | Integrated MarkupParser with DOM extraction pipeline |
| 1.3.0 | 2025-10-01 | Added dual-parser architecture with fallback |
| 1.2.0 | 2025-09-15 | Implemented LinkParser integration |
| 1.1.0 | 2025-09-01 | Added link graph for backlinks support |
| 1.0.0 | 2025-08-01 | Initial RenderingManager implementation |

---

__Last Updated:__ 2026-09-12
__Maintained By:__ ngdpbase Development Team
__Status:__ Production Ready ✅
