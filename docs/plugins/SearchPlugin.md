---
name: SearchPlugin
description: Embeds search results directly in pages via the [{Search ...}] markup
dateModified: 2026-05-18
category: plugins
code: src/plugins/SearchPlugin.ts
relatedModules: [PluginManager, SearchManager]
version: 2.0.0
status: stable
---

# SearchPlugin

Embeds search results directly in wiki pages with filtering and formatting options.

## Overview

The SearchPlugin allows embedding search results within wiki content. It supports text queries, category filtering, keyword filtering, and multiple output formats. This enables creating dynamic pages that automatically display related content.

**Source:** `plugins/SearchPlugin.js`

## Plugin Metadata

| Property | Value |
| ---------- | ------- |
| Name | SearchPlugin |
| Author | ngdpbase |
| Version | 2.0.0 |
| JSPWiki Compatible | Yes |

## Usage

### Basic Syntax

```wiki
[{Search query='keyword'}]
```

### With Category Filter

```wiki
[{Search system-category='documentation'}]
```

### Multiple Filters

```wiki
[{Search query='manager' system-category='system' max=5}]
```

## Parameters

| Parameter | Type | Default | Required | Description |
| ----------- | ------ | --------- | ---------- | ------------- |
| query | string | * | No | Search text query (* for all pages) |
| system-category | string | - | No | Filter by system category |
| user-keywords | string | - | No | Filter by user keywords (pipe-separated for OR) |
| author | string | - | No | Filter by page author (metadata.author); `$currentUser` for the logged-in user |
| editor | string | - | No | Filter by last editor (metadata.editor); `$currentUser` for the logged-in user |
| since | date | - | No | #643: last-modified on/after this date (`YYYY-MM-DD`) |
| until | date | - | No | #643: last-modified on/before this date (`YYYY-MM-DD`) |
| date | date | - | No | #643: last-modified on exactly this day (`YYYY-MM-DD`; convenience for since=until=date) |
| max | number | 50 | No | Maximum total results (0 = unlimited) |
| pageSize | number | 0 | No | Results per page; enables pagination when > 0 |
| page | number | 1 | No | Current page (also read from `?page=N` query string) |
| format | string | table | No | Output format: table, count, titles, list |

### Format Options

| Format | Description |
| -------- | ------------- |
| table | Full table with page names and scores (default) |
| count | Just the count of matching pages |
| titles | Bullet list with page links |
| list | Simple list of page names (no links) |

### Multi-Value Syntax

For `user-keywords`, use pipe (`|`) for OR logic:

```wiki
[{Search user-keywords='economics|geology'}]
```

Matches pages with either "economics" OR "geology" keywords.

## Examples

### Example 1: Basic Text Search

```wiki
[{Search query='plugin' max=10}]
```

**Output:** Table of pages containing "plugin" with relevance scores.

### Example 2: All Pages in Category

```wiki
[{Search system-category='documentation'}]
```

Shows all pages categorized as "documentation".

### Example 3: Count Format

```wiki
There are [{Search system-category='system' format='count'}] system pages.
```

**Output:** `There are 42 system pages.`

### Example 4: Titles Format

```wiki
[{Search system-category='documentation' format='titles'}]
```

**Output:**

```html
<div class="search-plugin search-titles">
  <ul>
    <li><a class="wikipage" href="/wiki/GettingStarted">Getting Started</a> <span class="badge">documentation</span></li>
    <li><a class="wikipage" href="/wiki/UserGuide">User Guide</a> <span class="badge">documentation</span></li>
  </ul>
</div>
```

### Example 5: List Format (No Links)

```wiki
[{Search user-keywords='test' format='list'}]
```

**Output:** Simple unordered list of page names.

### Example 6: Combined Query and Filter

```wiki
[{Search query='manager' system-category='system' max=5}]
```

Searches for "manager" within system-categorized pages.

### Example 7: Multiple Keywords (OR)

```wiki
[{Search user-keywords='economics|geology|history'}]
```

Pages tagged with economics OR geology OR history.

### Example 8: Paginated Results

```wiki
[{Search system-category='documentation' pageSize=10}]
```

Shows the first 10 documentation pages with Prev/Next navigation. The `?page=N` query string controls the current page automatically.

```wiki
[{Search query='manager' max=100 pageSize=20}]
```

Fetches up to 100 results and paginates them 20 per page.

### Date filter (#643)

```wiki
[{Search since='2026-05-01' format='titles'}]
[{Search author='$currentUser' until='2026-05-01'}]
[{Search date='2026-05-01'}]
```

Filters by **last-modified** date (inclusive, whole-day; combined AND with `author`/`editor`/category/keywords). `date='X'` is shorthand for `since='X' until='X'`. Invalid dates (non-`YYYY-MM-DD`) return an error.

> Note: this is **last-modified only**. ngdpbase pages do not store a creation timestamp (frontmatter carries `lastModified`, not `created`), so a `created`-date filter is intentionally not offered.

## Output Formats

### Table Format (Default)

```html
<div class="search-plugin">
  <div class="search-summary">
    <p>Found <strong>5</strong> results for <strong>"manager"</strong></p>
  </div>
  <table class="search-results" border="1">
    <thead>
      <tr><th>Page</th><th>Score</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><a href="/wiki/PageManager">PageManager</a> <span class="badge">system</span></td>
        <td>1.000</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Count Format

```html
<span class="search-count">42</span>
```

### Titles Format

Bullet list with links and category badges.

### List Format

Plain bullet list of page names.

## Technical Implementation

### Execute Method

```javascript
async execute(context, params) {
  const searchManager = context?.engine?.getManager?.('SearchManager');

  const searchOptions = {
    query: opts.query === '*' ? '' : opts.query,
    maxResults: maxResults,
    categories: opts['system-category'] ? [opts['system-category']] : undefined,
    userKeywords: opts['user-keywords'] ? opts['user-keywords'].split('|') : undefined
  };

  const results = await searchManager.advancedSearch(searchOptions);
  return formatResults(results, options);
}
```

### Context Usage

- `context.engine.getManager('SearchManager')` - For search execution

## JSPWiki Compatibility

| Feature | JSPWiki | ngdpbase | Notes |
| --------- | --------- | --------- | ------- |
| query parameter | Yes | Yes | Same behavior |
| max parameter | Yes | Yes | Same behavior |
| Table output | Yes | Yes | Similar format |
| system-category | No | Yes | ngdpbase extension |
| user-keywords | No | Yes | ngdpbase extension |
| format parameter | Partial | Yes | Extended options |

## Error Handling

| Error | Cause | Output |
| ------- | ------- | -------- |
| SearchManager unavailable | Engine not ready | Error message |
| Invalid format | Unknown format type | Error message |
| Search failure | Internal error | Error with message |

> **Note:** Invalid `max`, `page`, or `pageSize` values fall back to their defaults rather than returning an error.

## CSS Classes

| Class | Description |
| ------- | ------------- |
| search-plugin | Container div |
| search-summary | Results summary |
| search-results | Results table |
| search-titles | Titles format container |
| search-list | List format container |
| search-count | Count format span |
| plugin-pagination | Pagination nav (Prev/Next links) |

## Related Documentation

- [Plugin System Architecture](../architecture/Plugin-Architecture.md)
- [SearchManager](../managers/SearchManager.md)
- [GitHub Issue #111](https://github.com/jwilleke/ngdpbase/issues/111)

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 2.0.1 | 2026-03-06 | Added `pageSize` / `page` pagination parameters |
| 2.0.0 | 2025-11-26 | Added format parameter, category/keyword filters |
| 1.0.0 | 2025-10-01 | Initial implementation |
