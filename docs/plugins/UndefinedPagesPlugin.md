---
name: UndefinedPagesPlugin
description: Lists pages that are linked to (RED-LINKs) but do not exist in the wiki
dateModified: '2026-02-25'
category: plugins
code: src/plugins/UndefinedPagesPlugin.ts
relatedModules:
  - PluginManager
  - PageManager
  - RenderingManager
version: 1.2.0
---

# UndefinedPagesPlugin

Lists all pages that are referenced by wiki links (RED-LINKs) but do not exist in the wiki.

## Overview

The UndefinedPagesPlugin inspects the in-memory link graph to find every page title that
has been linked to but has never been created. Results are rendered as create links
(`/edit/PageName`) styled like inline red links, so clicking one takes you directly to
the page creation editor.

__Source:__ `plugins/UndefinedPagesPlugin.ts`
__Shared utilities:__ `src/utils/pluginFormatters.ts` (see [#238 Code Consolidation](https://github.com/jwilleke/ngdpbase/issues/238))

## Plugin Metadata

| Property | Value |
| --- | --- |
| Name | UndefinedPagesPlugin |
| Author | ngdpbase |
| Version | 1.2.0 |
| JSPWiki Compatible | Yes |

## Usage

### Basic Syntax

```wiki
[{UndefinedPagesPlugin}]
```

Returns a bulleted list of all undefined (red-link) pages, sorted alphabetically by default.

### Count Only

```wiki
[{UndefinedPagesPlugin format='count'}]
```

### Table with Referrer Count

```wiki
[{UndefinedPagesPlugin format='table'}]
```

Shows each undefined page alongside the number of pages that currently link to it.

## Parameters

| Parameter | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| max | integer | 0 (unlimited) | No | Maximum number of results to display. `count` format always returns the total regardless of `max`. Ignored when `pageSize` is set. |
| format | string | `list` | No | Output format: `list`, `count`, or `table` |
| before | string | — | No | Text/markup before each item (`list` format only, ignored when `showReferring='true'`) |
| after | string | — | No | Text/markup after each item (`list` format only, ignored when `showReferring='true'`) |
| include | regex | — | No | Only include undefined pages matching this pattern |
| exclude | regex | — | No | Exclude undefined pages matching this pattern |
| showReferring | boolean | `false` | No | Expand referring page info. `list`: nested `<ul class="referring-pages">` per item. `table`: page links instead of count in Referenced By column. No effect on `count` format. |
| sort | string | `name-asc` | No | Server-side sort order applied before `max`/pagination. Valid values: `name` / `name-asc` / `name-desc`, `count-asc` / `count-desc`. Invalid values silently fall back to `name-asc`. |
| pageSize | integer | 0 (disabled) | No | Rows per page. When > 0, enables pagination and ignores `max`. The current page is taken from the `page` parameter or the `?page=` query string. |
| page | integer | 1 | No | Static page number to display (1-based). Overridden by the `?page=` URL query string when the page is fetched by a browser. |

## Output Formats

| Format | `showReferring='false'` (default) | `showReferring='true'` |
| --- | --- | --- |
| `list` | `<ul>` of red create-links | Same `<ul>`, each `<li>` has a nested `<ul class="referring-pages">` |
| `count` | Plain integer total (ignores `max`) | Unchanged — `showReferring` has no effect |
| `table` | Two columns: Undefined Page \| count | Two columns: Undefined Page \| comma-separated page links |

## Examples

### Example 1: Full List

```wiki
[{UndefinedPagesPlugin}]
```

Bulleted list of all undefined pages, alphabetically sorted. Rendered output:

```html
<ul>
  <li><a class="redlink" href="/edit/ApiDocumentation"   style="color: red;" title="Create page: ApiDocumentation">ApiDocumentation</a></li>
  <li><a class="redlink" href="/edit/Architecture"       style="color: red;" title="Create page: Architecture">Architecture</a></li>
  <li><a class="redlink" href="/edit/InstallationGuide"  style="color: red;" title="Create page: InstallationGuide">InstallationGuide</a></li>
  <li><a class="redlink" href="/edit/ProjectRoadmap"     style="color: red;" title="Create page: ProjectRoadmap">ProjectRoadmap</a></li>
  <li><a class="redlink" href="/edit/ReleaseNotes"       style="color: red;" title="Create page: ReleaseNotes">ReleaseNotes</a></li>
</ul>
```

Clicking any red link opens the page-creation editor for that title.

---

### Example 2: Top 25

```wiki
[{UndefinedPagesPlugin max='25'}]
```

Same bulleted list as Example 1 but capped at the first 25 results (alphabetical). If fewer than 25 undefined pages exist the full list is returned.

---

### Example 3: Count for a Dashboard

```wiki
Undefined pages: [{UndefinedPagesPlugin format='count'}]
```

The plugin is replaced inline by the total count. Rendered output on a summary page:

```
Undefined pages: 42
```

The count always reflects the full set — `max`, `pageSize`, and `showReferring` are all ignored for this format.

---

### Example 4: Table View

```wiki
[{UndefinedPagesPlugin format='table'}]
```

Output columns: __Undefined Page__ (red-link create link) | __Referenced By__ (integer count).

```html
<table class="plugin-table sortable" data-sort-column="0" data-sort-direction="asc">
  <thead>
    <tr><th>Undefined Page</th><th>Referenced By</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><a class="redlink" href="/edit/ApiDocumentation"  style="color: red;" title="Create page: ApiDocumentation">ApiDocumentation</a></td>
      <td>3</td>
    </tr>
    <tr>
      <td><a class="redlink" href="/edit/Architecture"      style="color: red;" title="Create page: Architecture">Architecture</a></td>
      <td>7</td>
    </tr>
    <tr>
      <td><a class="redlink" href="/edit/InstallationGuide" style="color: red;" title="Create page: InstallationGuide">InstallationGuide</a></td>
      <td>1</td>
    </tr>
    <tr>
      <td><a class="redlink" href="/edit/ProjectRoadmap"    style="color: red;" title="Create page: ProjectRoadmap">ProjectRoadmap</a></td>
      <td>5</td>
    </tr>
    <tr>
      <td><a class="redlink" href="/edit/ReleaseNotes"      style="color: red;" title="Create page: ReleaseNotes">ReleaseNotes</a></td>
      <td>2</td>
    </tr>
  </tbody>
</table>
```

The `sortable` class activates `tableSort.js` so columns can be re-sorted client-side without a page reload.

---

### Example 5: Limit to a Namespace

```wiki
[{UndefinedPagesPlugin include='^Project.*'}]
```

Only shows undefined pages whose titles start with "Project". Rendered output:

```html
<ul>
  <li><a class="redlink" href="/edit/ProjectRoadmap" style="color: red;" title="Create page: ProjectRoadmap">ProjectRoadmap</a></li>
  <li><a class="redlink" href="/edit/ProjectSetup"   style="color: red;" title="Create page: ProjectSetup">ProjectSetup</a></li>
</ul>
```

---

### Example 6: Exclude Test Pages

```wiki
[{UndefinedPagesPlugin exclude='.*Test.*'}]
```

Returns the full list minus any title containing "Test" (case-sensitive). A page named `SmokeTest` or `TestPlan` would be suppressed; `Architecture` would remain.

---

### Example 7: Custom List Markers (JSPWiki-style before/after)

```wiki
[{UndefinedPagesPlugin before='* ' after='\n'}]
```

`before` contains `*` so `formatAsList` wraps items in `<ul><li>` (same as default). The `\n` in `after` is decoded to a newline but has no visual effect in HTML. This form is provided for JSPWiki compatibility. Rendered output is equivalent to Example 1.

---

### Example 8: List with Referring Pages Expanded

```wiki
[{UndefinedPagesPlugin showReferring='true'}]
```

Each `<li>` contains the red create-link followed by a nested `<ul class="referring-pages">` listing every existing page that links to it. Equivalent to running `[{ReferringPagesPlugin page='X'}]` inline for every undefined page X.

```html
<ul>
  <li>
    <a class="redlink" href="/edit/ApiDocumentation" style="color: red;" title="Create page: ApiDocumentation">ApiDocumentation</a>
    <ul class="referring-pages">
      <li><a class="wikipage" href="/wiki/GettingStarted">GettingStarted</a></li>
      <li><a class="wikipage" href="/wiki/Overview">Overview</a></li>
      <li><a class="wikipage" href="/wiki/QuickStart">QuickStart</a></li>
    </ul>
  </li>
  <li>
    <a class="redlink" href="/edit/Architecture" style="color: red;" title="Create page: Architecture">Architecture</a>
    <ul class="referring-pages">
      <li><a class="wikipage" href="/wiki/DatabaseDesign">DatabaseDesign</a></li>
      <li><a class="wikipage" href="/wiki/DeploymentGuide">DeploymentGuide</a></li>
      <li><a class="wikipage" href="/wiki/Overview">Overview</a></li>
    </ul>
  </li>
  <li>
    <a class="redlink" href="/edit/InstallationGuide" style="color: red;" title="Create page: InstallationGuide">InstallationGuide</a>
    <ul class="referring-pages">
      <li><a class="wikipage" href="/wiki/ReadMe">ReadMe</a></li>
    </ul>
  </li>
</ul>
```

---

### Example 9: Table with Referring Pages Expanded

```wiki
[{UndefinedPagesPlugin format='table' showReferring='true'}]
```

The __Referenced By__ column shows comma-separated `<a class="wikipage">` links instead of an integer count. Pages with no referrers still show `0`.

```html
<table class="plugin-table sortable" data-sort-column="0" data-sort-direction="asc">
  <thead>
    <tr><th>Undefined Page</th><th>Referenced By</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><a class="redlink" href="/edit/ApiDocumentation" style="color: red;" title="Create page: ApiDocumentation">ApiDocumentation</a></td>
      <td data-sort="3">
        <a class="wikipage" href="/wiki/GettingStarted">GettingStarted</a>,
        <a class="wikipage" href="/wiki/Overview">Overview</a>,
        <a class="wikipage" href="/wiki/QuickStart">QuickStart</a>
      </td>
    </tr>
    <tr>
      <td><a class="redlink" href="/edit/Architecture" style="color: red;" title="Create page: Architecture">Architecture</a></td>
      <td data-sort="3">
        <a class="wikipage" href="/wiki/DatabaseDesign">DatabaseDesign</a>,
        <a class="wikipage" href="/wiki/DeploymentGuide">DeploymentGuide</a>,
        <a class="wikipage" href="/wiki/Overview">Overview</a>
      </td>
    </tr>
  </tbody>
</table>
```

Note: the `data-sort` attribute on each __Referenced By__ cell holds the raw referrer count so that `tableSort.js` sorts numerically, not lexicographically.

---

### Example 10: Filtered Audit — Project Pages Only

```wiki
[{UndefinedPagesPlugin include='^Project.*' showReferring='true'}]
```

Scoped audit: only undefined pages in the "Project" namespace, with full referrer detail. Rendered output:

```html
<ul>
  <li>
    <a class="redlink" href="/edit/ProjectRoadmap" style="color: red;" title="Create page: ProjectRoadmap">ProjectRoadmap</a>
    <ul class="referring-pages">
      <li><a class="wikipage" href="/wiki/HomePage">HomePage</a></li>
      <li><a class="wikipage" href="/wiki/Milestones">Milestones</a></li>
      <li><a class="wikipage" href="/wiki/Planning">Planning</a></li>
    </ul>
  </li>
  <li>
    <a class="redlink" href="/edit/ProjectSetup" style="color: red;" title="Create page: ProjectSetup">ProjectSetup</a>
    <ul class="referring-pages">
      <li><a class="wikipage" href="/wiki/GettingStarted">GettingStarted</a></li>
      <li><a class="wikipage" href="/wiki/OnBoarding">OnBoarding</a></li>
    </ul>
  </li>
</ul>
```

---

### Example 11: Top 10 Most-Linked Undefined Pages

```wiki
[{UndefinedPagesPlugin format='table' sort='count-desc' max='10'}]
```

Sorts by referrer count descending before applying the `max` limit, so the result is the 10 most-linked undefined pages. The table's `data-sort-column` is set to column 1 (Referenced By) with `data-sort-direction="desc"` so the initial client-side sort matches the server-side sort.

```html
<table class="plugin-table sortable" data-sort-column="1" data-sort-direction="desc">
  <thead>
    <tr><th>Undefined Page</th><th>Referenced By</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><a class="redlink" href="/edit/Architecture"      style="color: red;" title="Create page: Architecture">Architecture</a></td>
      <td>7</td>
    </tr>
    <tr>
      <td><a class="redlink" href="/edit/ProjectRoadmap"    style="color: red;" title="Create page: ProjectRoadmap">ProjectRoadmap</a></td>
      <td>5</td>
    </tr>
    <tr>
      <td><a class="redlink" href="/edit/ApiDocumentation"  style="color: red;" title="Create page: ApiDocumentation">ApiDocumentation</a></td>
      <td>3</td>
    </tr>
    <tr>
      <td><a class="redlink" href="/edit/ReleaseNotes"      style="color: red;" title="Create page: ReleaseNotes">ReleaseNotes</a></td>
      <td>2</td>
    </tr>
    <tr>
      <td><a class="redlink" href="/edit/InstallationGuide" style="color: red;" title="Create page: InstallationGuide">InstallationGuide</a></td>
      <td>1</td>
    </tr>
  </tbody>
</table>
```

---

### Example 12: Reverse Alphabetical List

```wiki
[{UndefinedPagesPlugin sort='name-desc'}]
```

Same as Example 1 but items appear in Z → A order:

```html
<ul>
  <li><a class="redlink" href="/edit/ReleaseNotes"       style="color: red;" title="Create page: ReleaseNotes">ReleaseNotes</a></li>
  <li><a class="redlink" href="/edit/ProjectRoadmap"     style="color: red;" title="Create page: ProjectRoadmap">ProjectRoadmap</a></li>
  <li><a class="redlink" href="/edit/InstallationGuide"  style="color: red;" title="Create page: InstallationGuide">InstallationGuide</a></li>
  <li><a class="redlink" href="/edit/Architecture"       style="color: red;" title="Create page: Architecture">Architecture</a></li>
  <li><a class="redlink" href="/edit/ApiDocumentation"   style="color: red;" title="Create page: ApiDocumentation">ApiDocumentation</a></li>
</ul>
```

---

### Example 13: Paginated Browse (20 per page)

```wiki
[{UndefinedPagesPlugin pageSize='20'}]
```

Displays the first 20 results with __Prev / Next__ navigation links. When a user clicks __Next__, the browser requests the same wiki page with `?page=2`, and the plugin renders the next 20 items automatically.

Assuming 42 total undefined pages, the footer for page 1 renders as:

```html
<ul>
  <!-- items 1–20 -->
</ul>
<div class="plugin-pagination">
  <span class="disabled">« Prev</span>&nbsp;&nbsp;Page 1 of 3&nbsp;&nbsp;<a href="/wiki/UndefinedPages?page=2">Next »</a>
</div>
```

And page 2:

```html
<ul>
  <!-- items 21–40 -->
</ul>
<div class="plugin-pagination">
  <a href="/wiki/UndefinedPages?page=1">« Prev</a>&nbsp;&nbsp;Page 2 of 3&nbsp;&nbsp;<a href="/wiki/UndefinedPages?page=3">Next »</a>
</div>
```

---

### Example 14: Paginated by Count, Static Page 2

```wiki
[{UndefinedPagesPlugin pageSize='20' sort='count-desc' page='2'}]
```

Static page 2 of the count-sorted paginated results (useful for embedding in transcluded pages). The `page='2'` is overridden by the `?page=` URL query string when the page is fetched by a browser — allowing the same markup to drive all pages of pagination.

```html
<ul>
  <!-- items 21–40 sorted by referrer count descending -->
</ul>
<div class="plugin-pagination">
  <a href="/wiki/UndefinedPages?page=1">« Prev</a>&nbsp;&nbsp;Page 2 of 3&nbsp;&nbsp;<a href="/wiki/UndefinedPages?page=3">Next »</a>
</div>
```

## Technical Implementation

### Data Source

The plugin reads `context.linkGraph` (provided by `RenderingManager`) — a
`Record<string, string[]>` map of `targetPage → [referringPages]`. Every key
in this map that is __not__ present in `PageManager.getAllPages()` is an
undefined page.

```typescript
const allPages  = await pageManager.getAllPages();
const pageSet   = new Set(allPages.map(p => p.toLowerCase()));
const undefined = Object.keys(linkGraph).filter(p => !pageSet.has(p.toLowerCase()));
```

### Shared Formatters

Output is generated via `src/utils/pluginFormatters.ts`:

| Helper | Used for |
| --- | --- |
| `parseMaxParam` | Parse and validate the `max` parameter |
| `applyMax` | Slice the results array |
| `parseSortParam` | Parse and validate the `sort` parameter |
| `parsePageParam` | Parse and validate the `page` parameter |
| `parsePageSizeParam` | Parse and validate the `pageSize` parameter |
| `applyPagination` | Slice items to the requested page, return page metadata |
| `formatPaginationLinks` | Render prev/next pagination nav HTML |
| `formatAsList` | `list` format with optional `before`/`after` |
| `formatAsCount` | `count` format |
| `formatAsTable` | `table` format (with optional `TableOptions` for sortable headers) |
| `escapeHtml` | Safe HTML escaping in error messages and table cells |

### Context Usage

- `context.linkGraph` — link graph from RenderingManager
- `context.engine.getManager('PageManager')` — for the current page list
- `context.query` — parsed URL query string (e.g. `{ page: '2' }`); populated by `RenderingManager.expandMacros` from the request's query parameters

## JSPWiki Compatibility

| Feature | JSPWiki | ngdpbase | Notes |
| --- | --- | --- | --- |
| Basic undefined page listing | Yes | Yes | Fully compatible |
| `max` parameter | Yes | Yes | Same semantics |
| `format='count'` | Yes | Yes | |
| `include`/`exclude` filters | No | Yes | ngdpbase extension |
| `format='table'` | No | Yes | ngdpbase extension |
| `before`/`after` | No | Yes | ngdpbase extension |
| `showReferring` | No | Yes | ngdpbase extension |
| `sort` | No | Yes | ngdpbase extension |
| `pageSize`/`page` | No | Yes | ngdpbase extension |

## Error Handling

| Error | Cause | Output |
| --- | --- | --- |
| PageManager unavailable | Engine not initialized | Error paragraph |
| Invalid `include` pattern | Bad regex | Error with pattern text |
| Invalid `exclude` pattern | Bad regex | Error with pattern text |

## CSS Classes

| Class | Applied to | Description |
| --- | --- | --- |
| `redlink` | `<a>` | Marks the link as a create (red) link |
| `plugin-table` | `<table>` | Table wrapper (from `formatAsTable`) |
| `sortable` | `<table>` | Added when `format='table'`; activates `tableSort.js` for client-side column re-sorting |
| `wikipage` | `<a>` | Applied to referring page links when `showReferring='true'` |
| `referring-pages` | `<ul>` | Nested list of referring pages in `list` format with `showReferring='true'` |
| `plugin-pagination` | `<div>` | Wraps the prev/next navigation links rendered when `pageSize > 0` |
| `disabled` | `<span>` | Applied to Prev/Next labels when there is no previous/next page |

## Related Plugins

- [ReferringPagesPlugin](./ReferringPagesPlugin.md) — Lists pages that link *to* the current page
- [IndexPlugin](./IndexPlugin.md) — Alphabetical index of all existing pages
- [SearchPlugin](./SearchPlugin.md) — Dynamic page search

## Related Documentation

- [Plugin System Architecture](../architecture/Plugin-Architecture.md)
- [pluginFormatters utility](../../src/utils/pluginFormatters.ts) — Shared formatting helpers
- [PageManager](../managers/PageManager.md)

## Version History

| Version | Date | Changes |
| --- | --- | --- |
| 1.2.0 | 2026-02-25 | Add `sort`, `page`, `pageSize` parameters — server-side sort (name/count asc/desc), client-side sortable table headers via `tableSort.js`, and prev/next pagination |
| 1.1.0 | 2026-02-25 | Add `showReferring` parameter — inline referring page expansion for list and table formats |
| 1.0.0 | 2026-02-25 | Initial implementation — list, count, table formats; include/exclude filters |
