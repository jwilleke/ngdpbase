# JSPWikiPreprocessor Architecture

__Status__: Production Architecture (as of 2026-04-27)
__Related__: [Current-Rendering-Pipeline.md](./Current-Rendering-Pipeline.md) | [MANAGERS-OVERVIEW.md](./MANAGERS-OVERVIEW.md)

## Overview

`JSPWikiPreprocessor` is a registered markup handler that converts JSPWiki-specific table syntax and `%%class%%` style blocks to HTML __before__ Showdown markdown conversion. It runs as __Phase 2.5__ in the `parseWithDOMExtraction()` pipeline with registration priority 95 (highest among handlers).

## Position in the Rendering Pipeline

`JSPWikiPreprocessor` runs inside `MarkupParser.parseWithDOMExtraction()`:

```text
HTTP GET /wiki/PageName
    │
    ▼
MarkupParser.parseWithDOMExtraction()
    │
    ├─ Phase 1: extractJSPWikiSyntax()
    │    (code blocks, fenced code, INLINE style extraction,
    │     block style extraction, emoji, status boxes
    │     — all extract to UUID placeholders)
    │
    ├─ Phase 2: WikiDocument DOM node creation
    │    (extracted elements → DOM nodes for placeholder restoration)
    │
    ├─ Phase 2.5: JSPWikiPreprocessor  ← RUNS HERE
    │    (bare table syntax || / |, %%class%% style blocks → HTML)
    │    Priority: 95 — executes first among all registered handlers
    │
    ├─ Phase 2.6: Other registered handlers
    │
    ├─ Phase 3: Showdown markdown → HTML
    │
    └─ Phase 4: DOM placeholder restoration
         (UUID spans → plugin/code/style block HTML)
```

### Why Phase 2.5 (After Phase 1)?

JSPWikiPreprocessor runs after `extractJSPWikiSyntax()` for a critical reason: Phase 1 extracts style blocks wrapped in `%%class … /%` into UUID placeholder spans. JSPWikiPreprocessor handles the __bare table rows__ (`|| header ||` / `| cell |`) and any remaining `%%class%%` blocks that were not captured as style blocks in Phase 1.

__Why table syntax must run before Showdown (Phase 3):__

Without Phase 2.5, Showdown wraps `|| header ||` in `<p>` tags during Phase 3, which prevents the table from being parsed. Producing the `<table>` HTML in Phase 2.5 leaves it unchanged by Showdown. ✅

__Inline styles (`%%(css)`, `%%sup/sub/strike`) no longer use a post-processing pass (#907):__

Earlier revisions ran a "Step 0.55" string-replace *after* Phase 2.5 to turn `%%sup 2%%` → `<sup>2</sup>`, because `JSPWikiPreprocessor.parseTable()` `escapeHtml()`'d cell values and `%` survived unescaped. That pass — and `convertInlineCssStyles()` — are __removed__. Inline styles are now extracted to typed DOM elements in Phase 1 (`type: 'inline-style'`), *before* block extraction, so a swatch's `/%` can't be mis-paired with an enclosing block and table cells receive an inert `data-jspwiki-placeholder` span that `populateCell` restores after the table is built. See [The DOM Extraction Pipeline → Style syntax is DOM-native too](../WikiDocument-Complete-Guide.md#style-syntax--is-dom-native-too-907). ([#592](https://github.com/jwilleke/ngdpbase/issues/592), [#907](https://github.com/jwilleke/ngdpbase/issues/907))

## How JSPWikiPreprocessor Works

### 1. Entry Point

```javascript
async process(content, context) {
  const processedContent = this.parseStyleBlocks(content);
  return processedContent;
}
```

### 2. Nested Block Parsing

__Input:__

```markdown
%%zebra-table
%%sortable
|| Header || Data ||
| Cell 1 | Cell 2 |
/%
/%
```

__Processing Flow:__

```javascript
parseStyleBlocks(content, accumulatedClasses = [])
  ├─ Finds: %%zebra-table
  ├─ isTableClass('zebra-table') → true
  ├─ Accumulates: ['zebra-table']
  ├─ Recursively processes inner content:
  │   ├─ Finds: %%sortable
  │   ├─ isTableClass('sortable') → true
  │   ├─ Accumulates: ['zebra-table', 'sortable']
  │   ├─ Finds table syntax: || Header ||
  │   └─ Calls: parseTable(content, 'zebra-table sortable')
  └─ Returns: <table class="table zebra-table sortable">...
```

### 3. Table Parsing

__JSPWiki Syntax:__

``` markdown
|| Header 1 || Header 2 ||   ← Double pipes = header row
| Cell 1 | Cell 2 |          ← Single pipes = data row
```

__Parsing Logic:__

```javascript
parseTableRow(line) {
  const isHeader = line.trim().startsWith('||');
  const delimiter = isHeader ? '||' : '|';
  const cells = line.split(delimiter).slice(1, -1); // Remove empty edges
  return { isHeader, cells };
}
```

__HTML Output:__

```html
<table class="table zebra-table sortable">
  <thead>
    <tr><th>Header 1</th><th>Header 2</th></tr>
  </thead>
  <tbody>
    <tr><td>Cell 1</td><td>Cell 2</td></tr>
  </tbody>
</table>
```

### 4. Custom Color Support

__Syntax:__ `%%zebra-HEXCOLOR` (e.g., `%%zebra-ffe0e0`)

__Processing:__

```javascript
extractCustomStyles(['zebra-ffe0e0'])
  ├─ Regex match: /^zebra-([0-9a-fA-F]{6})$/
  ├─ Extract: hexColor = 'ffe0e0'
  ├─ Calculate contrast: getContrastColor('ffe0e0')
  │   ├─ Convert to RGB: r=255, g=224, b=224
  │   ├─ Calculate luminance: (0.299*255 + 0.587*224 + 0.114*224) / 255 = 0.90
  │   └─ Return: '#000000' (black, because 0.90 > 0.5)
  ├─ Output classes: 'zebra-table'
  └─ Output styles: '--zebra-row-even: #ffe0e0; --zebra-text-color: #000000;'
```

__HTML Output:__

```html
<table class="table zebra-table" style="--zebra-row-even: #ffe0e0; --zebra-text-color: #000000;">
```

## Integration Points

### With MarkupParser

__Registration__ (`src/parsers/MarkupParser.ts` — `registerDefaultHandlers()`):

```typescript
const jspwikiPreprocessor = new JSPWikiPreprocessor(this.engine);
await this.registerHandler(jspwikiPreprocessor);
```

The handler sets `this.priority = 95` in its constructor, making it the first handler to run in Phase 2.5 / Phase 2.6.

__Phase Execution__ (`src/parsers/MarkupParser.ts` — `parseWithDOMExtraction()`):

```typescript
// Phase 2.5 / 2.6 — registered handlers in priority order
const allHandlers = this.handlerRegistry.resolveExecutionOrder();
for (const handler of allHandlers) {
  preprocessed = await handler.process(preprocessed, context) ?? preprocessed;
}
```

__Source:__ `src/parsers/handlers/JSPWikiPreprocessor.ts`

### With Client-Side JavaScript

JSPWikiPreprocessor generates HTML that client-side JavaScript enhances:

#### 1. zebraTable.js

```javascript
// Finds tables: table.zebra-table
// Applies classes: .zebra-even, .zebra-odd
// Uses CSS variables: --zebra-row-even, --zebra-text-color
```

#### 2. tableSort.js

```javascript
// Finds tables: table.sortable
// Adds click handlers to <th> elements
// Sorts rows and refreshes zebra striping
```

#### 3. tableFilter.js

```javascript
// Finds tables: table.table-filter
// Injects filter input row
// Filters rows and refreshes zebra striping
```

### With CSS

__CSS Variables Flow:__

```css
JSPWikiPreprocessor (JS)
  ↓ Sets inline style
<table style="--zebra-row-even: #ffe0e0; --zebra-text-color: #000000;">
  ↓ CSS variable inheritance
tbody tr.zebra-even (CSS)
  ↓ Uses variables
background-color: var(--zebra-row-even);
color: var(--zebra-text-color);
```

## Supported Table Classes

### Visual Styles

- `zebra-table` - Alternating row colors (default gray)
- `table-striped` - Bootstrap-style striping
- `table-bordered` - Cell borders
- `table-hover` - Highlight on hover
- `table-fit` - Auto-width to content
- `table-sm` / `table-condensed` - Compact padding
- `table-responsive` - Horizontal scrolling on mobile

### Interactive Features

- `sortable` / `table-sort` - Clickable column headers
- `table-filter` - Filter inputs per column

### Custom Colors

- `zebra-HEXCOLOR` - Custom stripe color with auto-contrast text
  - Example: `zebra-ffe0e0` (pink), `zebra-e0e0ff` (blue)

## Design Patterns

### 1. Recursive Descent Parser

```javascript
parseStyleBlocks(content, accumulatedClasses) {
  // Accumulates classes through recursion
  // Handles arbitrary nesting depth
}
```

### 2. State-Based Parsing (Inspired by JSPWiki)

```javascript
// Line-by-line processing
// Maintains state (depth, accumulated classes)
// Handles block boundaries (/%/)
```

### 3. WCAG Accessibility

```javascript
getContrastColor(hexColor) {
  // Ensures WCAG-compliant contrast
  // Automatic black/white selection
}
```

## Deprecated Components

### WikiStyleHandler / WikiTableHandler

Both were replaced by JSPWikiPreprocessor. They ran too late in the old 7-phase pipeline (after Showdown wrapped `||` rows in `<p>` tags), causing table headers to appear outside the table. JSPWikiPreprocessor solves this by running before Showdown in Phase 2.5.

## Known Limitations

- No column alignment support (`||align=right Header||`)
- No colspan / rowspan support
- Cell-level styling not supported

These are tracked as potential enhancements, not bugs.

## Testing

### Unit Test Coverage Needed

```javascript
describe('JSPWikiPreprocessor', () => {
  describe('parseStyleBlocks', () => {
    test('single style block');
    test('nested style blocks');
    test('multiple tables in one block');
  });

  describe('parseTable', () => {
    test('header rows only');
    test('data rows only');
    test('mixed header and data');
    test('empty cells');
    test('HTML escaping');
  });

  describe('getContrastColor', () => {
    test('light colors return black');
    test('dark colors return white');
    test('edge case: 50% luminance');
  });

  describe('extractCustomStyles', () => {
    test('zebra-HEXCOLOR pattern');
    test('invalid hex colors ignored');
    test('multiple custom colors');
  });
});
```

### Integration Test Scenarios

1. __End-to-End Rendering__
   - Markdown file → MarkupParser → HTML output
   - Verify table structure, classes, inline styles

2. __JavaScript Enhancement__
   - HTML table → zebraTable.js → .zebra-even classes
   - HTML table → tableSort.js → sortable columns

3. __Theme Compatibility__
   - Light mode, dark mode, system preference
   - Custom colors in all themes

## Performance Considerations

### Complexity Analysis

- __Nested blocks:__ O(n) where n = content length
- __Table parsing:__ O(rows × cells) per table
- __Color calculation:__ O(1) per custom color

### Optimization Strategies

1. __Early Exit__

   ```javascript
   if (!content.includes('%%')) return content; // No JSPWiki syntax
   ```

2. __Regex Compilation__

   ```javascript
   // Compile once in constructor
   this.blockPattern = /^%%([a-zA-Z0-9_-]+)$/;
   ```

3. __Minimal DOM Manipulation__
   - Generate complete HTML strings
   - Single innerHTML assignment client-side

## Debugging

### Enable Debug Logging

```javascript
// Add to JSPWikiPreprocessor constructor
this.debug = true;

// Add logging in parseStyleBlocks
if (this.debug) {
  console.log(`🔍 Found block: ${className}`);
  console.log(`🔍 Accumulated classes: ${accumulatedClasses.join(' ')}`);
}
```

### Common Issues

__Issue:__ Custom colors not applied

- __Check:__ zebraTable.js selector includes `table.zebra-table`
- __Check:__ CSS rule includes `table.zebra-table tbody tr.zebra-even`

__Issue:__ Headers outside table

- __Check:__ JSPWikiPreprocessor registered in Phase 1
- __Check:__ Handler phase property: `this.phase = 1`

__Issue:__ Nested blocks not working

- __Check:__ Matching `/%` for each `%%`
- __Check:__ Recursive call passes `accumulatedClasses`

## Related Documentation

- [Current-Rendering-Pipeline.md](./Current-Rendering-Pipeline.md) — Full pipeline overview including Phase 2.5 context
- [MANAGERS-OVERVIEW.md](./MANAGERS-OVERVIEW.md) — Manager and rendering flow
- [Issue #592](https://github.com/jwilleke/ngdpbase/issues/592) — Inline style ordering fix (Step 0.55 moved after Phase 2.5)
- [Issue #596](https://github.com/jwilleke/ngdpbase/issues/596) — FilterChain not wired (affects validation at save/render time)

---

__Last Updated:__ 2026-04-27
