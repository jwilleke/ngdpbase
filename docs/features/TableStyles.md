# JSPWiki Table Styles - Complete Guide

## Overview

ngdpbase implements JSPWiki-compatible table styles with extensions for modern web applications. Tables support visual styling, interactive features, and custom colors with automatic text contrast.

## Table of Contents

1. [Quick Start](#quick-start)
2. [JSPWiki Syntax](#jspwiki-syntax)
3. [Visual Styles](#visual-styles)
4. [Interactive Features](#interactive-features)
5. [Custom Colors](#custom-colors)
6. [Combining Styles](#combining-styles)
7. [Dark Mode Support](#dark-mode-support)
8. [Advanced Examples](#advanced-examples)
9. [Technical Reference](#technical-reference)

---

## Quick Start

### Basic Table (No Styling)

```
|| Name || Age || City ||
| Alice | 28 | Boston |
| Bob | 35 | Seattle |
```

__Result:__ Plain table with headers

### Striped Table

```
%%table-striped
|| Product || Price || Stock ||
| Laptop | $999 | 15 |
| Mouse | $25 | 150 |
/%
```

__Result:__ Alternating row colors for readability

### Sortable Table

```
%%sortable
|| Name || Score || Grade ||
| Alice | 95 | A |
| Bob | 87 | B |
/%
```

__Result:__ Click column headers to sort

---

## JSPWiki Syntax

### Row Types

__Header Row__ - Double pipes (`||`):

```
|| Column 1 || Column 2 || Column 3 ||
```

Rendered as: `<th>Column 1</th>`

__Data Row__ - Single pipes (`|`):

```
| Data 1 | Data 2 | Data 3 |
```

Rendered as: `<td>Data 1</td>`

### Style Blocks

__Single Style:__

```
%%style-name
|| Table content ||
| ... |
/%
```

__Nested Styles (JSPWiki Compatible):__

```
%%style-1
%%style-2
%%style-3
|| Table content ||
/%
/%
/%
```

__Important:__ Each `%%` requires a matching `/%`

---

## Visual Styles

### 1. Zebra Table / Table Striped

__Purpose:__ Alternating row colors for easier reading

__Syntax:__

```
%%zebra-table
|| Header ||
| Row 1 (gray) |
| Row 2 (normal) |
| Row 3 (gray) |
/%
```

__Alternative:__ `%%table-striped` (Bootstrap-compatible)

__CSS Classes:__ `zebra-table`, `table-striped`

__JavaScript:__ zebraTable.js applies `.zebra-even` and `.zebra-odd` classes dynamically

---

### 2. Table Bordered

__Purpose:__ Add borders around all cells

__Syntax:__

```
%%table-bordered
|| Name || Value ||
| Item | 123 |
/%
```

__CSS Class:__ `table-bordered`

__Visual:__ All cells have visible borders

---

### 3. Table Fit (Auto-Width)

__Purpose:__ Size table to content width (not full width)

__Syntax:__

```
%%table-fit
|| Code || Language ||
| JS | JavaScript |
| PY | Python |
/%
```

__CSS Class:__ `table-fit`

__CSS Rule:__ `width: auto !important`

---

### 4. Table Hover

__Purpose:__ Highlight row on mouse hover

__Syntax:__

```
%%table-hover
|| Product || Price ||
| Laptop | $999 |
| Mouse | $25 |
/%
```

__CSS Class:__ `table-hover`

__JavaScript:__ zebraTable.js adds `.zebra-hover` on mouseenter

---

### 5. Table Compact (table-sm / table-condensed)

__Purpose:__ Reduce padding for dense information

__Syntax:__

```
%%table-sm
|| Code || Desc ||
| 01 | Item 1 |
| 02 | Item 2 |
/%
```

__CSS Classes:__ `table-sm`, `table-condensed`

__CSS Rule:__ Reduced padding (4px vs 8px)

---

### 6. Table Responsive

__Purpose:__ Horizontal scroll on mobile devices

__Syntax:__

```
%%table-responsive
|| Col 1 || Col 2 || Col 3 || Col 4 || Col 5 || Col 6 ||
| Wide table content... |
/%
```

__CSS Class:__ `table-responsive`

__Behavior:__ Scrollable on screens < 768px

---

## Interactive Features

### 1. Sortable Tables

__Purpose:__ Click column headers to sort

__Syntax:__

```
%%sortable
|| Name || Age || Score ||
| Alice | 28 | 95 |
| Bob | 35 | 87 |
| Charlie | 22 | 92 |
/%
```

__Alternative:__ `%%table-sort`

__Features:__

- __Natural sorting:__ "Item 2" before "Item 10"
- __Type detection:__ Numbers, dates, text
- __Click toggle:__ Ascending → Descending → Ascending
- __Visual indicator:__ `.sort-asc` / `.sort-desc` classes

__Implementation:__ [tableSort.js](../../public/js/tableSort.js)

__Sort Types:__

- __Number:__ 123, 45.67, -10
- __Date:__ 2025-01-15, Jan 15 2025
- __Text:__ Alphabetical (case-insensitive)

---

### 2. Filterable Tables

__Purpose:__ Filter rows based on column values

__Syntax:__

```
%%table-filter
|| Product || Category || Price ||
| Laptop | Electronics | 1299 |
| Mouse | Accessories | 29 |
| Keyboard | Accessories | 89 |
/%
```

__Features:__

- __Filter row:__ Input fields for each column
- __Live filtering:__ 300ms debounce
- __Filter operators:__
  - `text` - Contains (default)
  - `=exact` - Exact match
  - `^starts` - Starts with
  - `ends$` - Ends with
  - `/regex/` - Regular expression

__Examples:__

- `Electronics` - Show rows containing "Electronics"
- `=29` - Show rows with exactly "29"
- `^L` - Show rows starting with "L"
- `/^[A-M]/` - Show rows matching regex

__Implementation:__ [tableFilter.js](../../public/js/tableFilter.js)

---

## Custom Colors

### Syntax

__Format:__ `%%zebra-HEXCOLOR`

Where `HEXCOLOR` is a 6-digit hex color __without__ the `#` symbol.

### Examples

__Pink Stripes:__

```
%%zebra-ffe0e0
|| Product || Price ||
| Item 1 | $10 |
| Item 2 | $20 |
/%
```

__Light Blue Stripes:__

```
%%zebra-e0e0ff
|| Name || Score ||
| Alice | 95 |
| Bob | 87 |
/%
```

__Dark Green Stripes:__

```
%%zebra-006400
|| Status || Count ||
| Active | 42 |
| Pending | 17 |
/%
```

### Automatic Text Contrast

__Algorithm:__ WCAG relative luminance

```javascript
luminance = (0.299 * R + 0.587 * G + 0.114 * B) / 255
textColor = luminance > 0.5 ? 'black' : 'white'
```

__Examples:__

- `%%zebra-ffe0e0` (pink, luminance 0.90) → __Black text__
- `%%zebra-800000` (maroon, luminance 0.15) → __White text__
- `%%zebra-808080` (gray, luminance 0.50) → __Black text__

### Color Palette Ideas

__Semantic Colors:__

```
%%zebra-d4edda  # Success (light green)
%%zebra-fff3cd  # Warning (light yellow)
%%zebra-f8d7da  # Error (light red)
%%zebra-d1ecf1  # Info (light blue)
```

__Brand Colors:__

```
%%zebra-e3f2fd  # Material Blue 50
%%zebra-f3e5f5  # Material Purple 50
%%zebra-e8f5e9  # Material Green 50
%%zebra-fff8e1  # Material Yellow 50
```

---

## Combining Styles

### Multiple Visual Styles

```
%%table-bordered
%%table-hover
%%table-fit
|| Code || Name ||
| 01 | Item 1 |
| 02 | Item 2 |
/%
/%
/%
```

__Result:__ Bordered + Hover + Auto-width

---

### Visual + Interactive

```
%%zebra-table
%%sortable
|| Product || Price || Stock ||
| Laptop | $999 | 15 |
| Mouse | $25 | 150 |
| Keyboard | $75 | 80 |
/%
/%
```

__Result:__ Striped rows + Click to sort

---

### Custom Color + Features

```
%%zebra-e0ffe0
%%sortable
%%table-filter
|| Name || Department || Salary ||
| Alice | Engineering | 95000 |
| Bob | Sales | 87000 |
| Charlie | Engineering | 92000 |
/%
/%
/%
```

__Result:__ Light green stripes + Sortable + Filterable

---

### Maximum Features (Jim's Fav Style)

```
%%table-bordered
%%table-fit
%%table-striped
%%table-hover
%%sortable
|| Title || Author || Year || Edition ||
| Book 1 | Smith | 2020 | 5 |
| Book 2 | Jones | 2019 | 3 |
| Book 3 | Davis | 2021 | 2 |
/%
/%
/%
/%
/%
```

__Result:__ All features combined!

---

## Dark Mode Support

### Automatic Theme Switching

ngdpbase supports three dark mode approaches:

1. __Manual toggle:__ `[data-theme="dark"]`
2. __System preference:__ `@media (prefers-color-scheme: dark)`
3. __Hybrid:__ Manual override system

### Default Colors

__Light Mode:__

```css
--table-stripe: #f0f0f0;        /* Light gray */
--zebra-row-even: rgba(2, 6, 19, 0.08);
--zebra-row-odd: transparent;
```

__Dark Mode:__

```css
--table-stripe: #252525;        /* Dark gray */
--zebra-row-even: #1a1a1a;
--zebra-row-odd: transparent;
```

### Text Brightness

__Dark Mode Enhancement:__

```css
/* Even rows (striped) get brighter text */
.zebra-even td {
  color: #f0f6fc;  /* Bright white */
}

/* Odd rows (normal) use default */
.zebra-odd td {
  color: #e6edf3;  /* Normal white */
}
```

### Custom Colors in Dark Mode

Custom colors (`%%zebra-HEXCOLOR`) override theme colors:

```
%%zebra-4a90e2  /* Medium blue */
```

__Renders as:__

```html
<table style="--zebra-row-even: #4a90e2; --zebra-text-color: #ffffff;">
```

Text color calculated independently of theme.

---

## Advanced Examples

### 1. Product Comparison Table

```
%%table-bordered
%%table-hover
%%sortable
|| Product || Price || Rating || Stock || Actions ||
| MacBook Pro | $2,399 | 4.8 | 12 | 🛒 |
| Dell XPS 15 | $1,799 | 4.6 | 25 | 🛒 |
| Surface Laptop | $1,299 | 4.5 | 8 | 🛒 |
| ThinkPad X1 | $1,899 | 4.7 | 15 | 🛒 |
/%
/%
/%
```

---

### 2. Dashboard Status Table

```
%%zebra-f0f8ff
%%table-fit
|| Service || Status || Uptime || Last Check ||
| API Server | ✅ Active | 99.9% | 2 min ago |
| Database | ✅ Active | 99.8% | 1 min ago |
| Cache | ⚠️ Slow | 98.5% | 5 min ago |
| Queue | ✅ Active | 99.7% | 3 min ago |
/%
/%
```

---

### 3. Financial Report Table

```
%%table-bordered
%%table-hover
%%sortable
|| Quarter || Revenue || Expenses || Profit || Growth ||
| Q1 2024 | $2.5M | $1.8M | $700K | +12% |
| Q2 2024 | $2.8M | $1.9M | $900K | +28% |
| Q3 2024 | $3.1M | $2.0M | $1.1M | +22% |
| Q4 2024 | $3.4M | $2.1M | $1.3M | +18% |
/%
/%
/%
```

---

### 4. User Directory with Filtering

```
%%table-filter
%%zebra-table
%%table-hover
|| Name || Department || Email || Phone ||
| Alice Johnson | Engineering | alice@company.com | (555) 123-4567 |
| Bob Smith | Sales | bob@company.com | (555) 234-5678 |
| Charlie Davis | Engineering | charlie@company.com | (555) 345-6789 |
| Diana Martinez | Marketing | diana@company.com | (555) 456-7890 |
| Eve Wilson | Sales | eve@company.com | (555) 567-8901 |
/%
/%
/%
```

__Filter examples:__

- Department: `Engineering` - Show only engineers
- Email: `@company.com` - Show all (contains)
- Name: `^A` - Show names starting with "A"

---

### 5. Color-Coded Priority Table

```
%%zebra-ffc0cb
%%sortable
|| Task || Priority || Assignee || Due Date ||
| Fix login bug | 🔴 High | Alice | 2025-10-08 |
| Update docs | 🟡 Medium | Bob | 2025-10-15 |
| Refactor API | 🟢 Low | Charlie | 2025-10-30 |
| Add tests | 🔴 High | Diana | 2025-10-09 |
/%
/%
```

---

## Technical Reference

### HTML Structure

__Generated by JSPWikiPreprocessor:__

```html
<table class="table zebra-table sortable" style="--zebra-row-even: #ffe0e0; --zebra-text-color: #000000;">
  <thead>
    <tr>
      <th>Header 1</th>
      <th>Header 2</th>
    </tr>
  </thead>
  <tbody>
    <tr class="zebra-even">
      <td>Cell 1</td>
      <td>Cell 2</td>
    </tr>
    <tr class="zebra-odd">
      <td>Cell 3</td>
      <td>Cell 4</td>
    </tr>
  </tbody>
</table>
```

### CSS Classes

| Class | Applied By | Purpose |
| ------- | ----------- | --------- |
| `table` | JSPWikiPreprocessor | Base table styling |
| `zebra-table` | JSPWikiPreprocessor | Enables zebra striping |
| `sortable` | JSPWikiPreprocessor | Enables sorting |
| `table-filter` | JSPWikiPreprocessor | Enables filtering |
| `zebra-even` | zebraTable.js | Even row (striped) |
| `zebra-odd` | zebraTable.js | Odd row (normal) |
| `zebra-hover` | zebraTable.js | Row being hovered |
| `sort-asc` | tableSort.js | Column sorted ascending |
| `sort-desc` | tableSort.js | Column sorted descending |

### CSS Variables

| Variable | Default (Light) | Default (Dark) | Purpose |
| ---------- | ---------------- | ---------------- | --------- |
| `--zebra-row-even` | `rgba(2,6,19,0.08)` | `#1a1a1a` | Even row background |
| `--zebra-row-odd` | `transparent` | `transparent` | Odd row background |
| `--zebra-row-hover` | `rgba(88,166,255,0.24)` | `#21262d` | Hover background |
| `--zebra-text-color` | (none) | (none) | Custom text color |
| `--table-stripe` | `#f0f0f0` | `#252525` | CSS-only striping |
| `--table-hover` | `#e8e8e8` | `#21262d` | CSS-only hover |

### JavaScript APIs

__zebraTable.js:__

```javascript
// Manually refresh zebra striping
window.ZebraTable.init();
window.ZebraTable.refresh();
```

__tableSort.js:__

```javascript
// Manually sort a table
window.TableSort.sortTable(tableElement, columnIndex, ascending);
window.TableSort.refresh();
```

__tableFilter.js:__

```javascript
// Manually refresh filters
window.TableFilter.init();
window.TableFilter.refresh();
```

### Performance

__Server-Side (JSPWikiPreprocessor):__

- Parsing: O(n) where n = content length
- Table generation: O(rows × cells)
- Color calculation: O(1) per custom color

__Client-Side (JavaScript):__

- zebraTable.js: O(rows) per table
- tableSort.js: O(rows × log rows) per sort
- tableFilter.js: O(rows × columns) per filter

__Memory:__

- Minimal: HTML strings only
- No DOM caching
- Event listeners cleaned up on destroy

---

## Browser Support

### Required Features

- CSS Custom Properties (CSS Variables)
- ES6 JavaScript
- `Array.from()`, `Array.sort()`, arrow functions
- `querySelector`, `querySelectorAll`
- MutationObserver (for zebra striping)

### Supported Browsers

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

### Graceful Degradation

- Without JavaScript: Basic HTML tables still render
- Without CSS variables: Falls back to default colors
- Without MutationObserver: CSS-only striping works

---

## Troubleshooting

### Issue: Custom colors not showing

__Check:__

1. zebraTable.js loaded: `<script src="/js/zebraTable.js"></script>`
2. zebraTable.js selector includes `table.zebra-table`
3. CSS rule includes `table.zebra-table tbody tr.zebra-even`

__Solution:__ Clear browser cache, check console for errors

---

### Issue: Headers outside table

__Check:__

1. JSPWikiPreprocessor registered in Phase 1
2. Handler has `this.phase = 1`
3. Using correct syntax: `|| Header ||` not `| Header |`

__Solution:__ Verify MarkupParser.js registration order

---

### Issue: Sorting not working

__Check:__

1. tableSort.js loaded
2. Table has `class="sortable"`
3. Table has `<thead>` with `<th>` elements

__Solution:__ Check browser console for JavaScript errors

---

### Issue: Dark mode contrast too low

__Check:__

1. CSS variables defined in `[data-theme="dark"]`
2. Text color set for `.zebra-even td`
3. Theme actually applied (check `<html data-theme="dark">`)

__Solution:__ Inspect element, verify computed styles

---

## Migration Guide

### From Old WikiStyleHandler/WikiTableHandler

__Before (Phase 4):__

```
Headers appear as <p> tags outside tables
TABLE_CLASSES markers used
Complex priority dependencies
```

__After (Phase 1):__

```
Headers inside <thead> correctly
Direct HTML generation
Simple, clean architecture
```

__No syntax changes required!__ All existing `%%` blocks work.

---

## Related Documentation

- [JSPWikiPreprocessor Architecture](../architecture/JSPWikiPreprocessor.md)
- [MarkupParser Pipeline](../architecture/MarkupParser.md)
- [Theme System](./ThemeSystem.md)
- [JavaScript Enhancements](./JavaScriptEnhancements.md)

---

## Credits

__Implementation:__

- JSPWikiPreprocessor: Server-side parser (Phase 1)
- zebraTable.js: Dynamic row striping
- tableSort.js: Interactive sorting
- tableFilter.js: Column filtering

__Inspired by:__

- [Apache JSPWiki](https://jspwiki.apache.org/)
- [JSPWiki Haddock Styles](https://jspwiki-wiki.apache.org/Wiki.jsp?page=Haddock%20Styles)
- Bootstrap Tables
- Material Design Tables

---

__Last Updated:__ 2025-10-07
__Version:__ 1.0.0
__Maintainer:__ ngdpbase Development Team
