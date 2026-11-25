# MarkupParser API Documentation

__Version:__ 1.3.2 (Phase 6 Complete)
__Last Updated:__ 2026-11-24
__Related Issues:__ #114-#120

## Overview

The `MarkupParser` is the core parsing engine for ngdpbase, responsible for converting wiki markup into HTML. As of Phase 6 (Issue #120), it supports two parsing pipelines:

1. __Primary Pipeline__ (default): WikiDocument DOM extraction (Issues #115-#120)
2. __Legacy Pipeline__: 7-phase string-based parser (deprecated, fallback only)

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

__config/app-default-config.json:__

```json
{
  "jspwiki.parser.useExtractionPipeline": true  // Default: use new pipeline
}
```

__Options:__

- `true` (default): Use WikiDocument DOM extraction pipeline
- `false`: Use legacy 7-phase pipeline

## Primary API Methods

### parse(content, context)

Main entry point for parsing. Automatically selects the appropriate pipeline based on configuration.

__Parameters:__

- `content` (string): Raw wiki markup to parse
- `context` (Object): Rendering context
  - `pageName` (string): Name of the page being rendered
  - `userName` (string): Current user name
  - Additional context properties as needed

__Returns:__ `Promise<string>` - Rendered HTML

__Behavior:__

1. Checks configuration for `jspwiki.parser.useExtractionPipeline`
2. Routes to `parseWithDOMExtraction()` if enabled (default)
3. Falls back to legacy parser if disabled or on error
4. Integrates with cache for performance
5. Tracks metrics and performance

__Example:__

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

__New in:__ Phase 3 (Issue #117)

Parses wiki markup using the WikiDocument DOM extraction pipeline. This is the primary parsing method that fixes the markdown heading bug and provides robust JSPWiki syntax processing.

__Parameters:__

- `content` (string): Wiki markup content to parse
- `context` (Object): Rendering context

__Returns:__ `Promise<string>` - Rendered HTML

__Pipeline Steps:__

1. Extract JSPWiki syntax (`extractJSPWikiSyntax()`)
2. Create WikiDocument DOM nodes (`createDOMNode()`)
3. Parse markdown with markdown-it (`RenderingManager.converter`, the `page` profile of `src/rendering/markdownConverter.ts`)
4. Merge DOM nodes into HTML (`mergeDOMNodes()`)

__Example:__

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

__Features:__

- No markdown/JSPWiki conflicts
- Correct heading rendering
- Code block protection
- Escaped syntax support
- Nested syntax handling

__Performance:__

- Typical page: <50ms
- Large page (5KB): <100ms
- Cache integrated

---

### extractJSPWikiSyntax(content, context)

__New in:__ Phase 1 (Issue #115)

Extracts JSPWiki syntax elements from content before markdown parsing. Replaces JSPWiki syntax with HTML comment placeholders to prevent markdown interference.

__Parameters:__

- `content` (string): Raw wiki markup
- `context` (Object): Rendering context (optional)

__Returns:__ `Object`

- `sanitized` (string): Content with placeholders
- `jspwikiElements` (Array): Extracted elements with metadata
- `uuid` (string): Unique identifier for this extraction

__Extracted Elements:__

- __Variables__: `[{$varname}]`
- __Plugins__: `[{PluginName param="value"}]`
- __Wiki Links__: `[PageName]` or `[Text|PageName]`
- __Escaped Syntax__: `[[{$var}]` → literal `[{$var}]`

__Example:__

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

__Features:__

- __Code Block Protection__: JSPWiki syntax in `` ` `` or ``` blocks not extracted
- __UUID-based Placeholders__: Prevents conflicts with user content
- __Span Placeholders__: `<span data-jspwiki-placeholder="uuid-id"></span>` passed through by markdown-it as inline HTML
- __Order-Independent__: Extraction order doesn't affect result

---

### createDOMNode(element, context, wikiDocument)

__New in:__ Phase 2 (Issue #116)

Creates a WikiDocument DOM node from an extracted JSPWiki element. Routes to appropriate handler based on element type.

__Parameters:__

- `element` (Object): Extracted element from `extractJSPWikiSyntax()`
  - `type` (string): 'variable', 'plugin', 'link', or 'escaped'
  - `id` (number): Element ID for placeholder matching
  - Additional type-specific properties
- `context` (Object): Rendering context
- `wikiDocument` (WikiDocument): WikiDocument instance for node creation

__Returns:__ `Promise<Element>` - WikiDocument DOM node

__Element Types:__

- __variable__: Routes to `DOMVariableHandler.createNodeFromExtract()`
- __plugin__: Routes to `DOMPluginHandler.createNodeFromExtract()`
- __link__: Routes to `DOMLinkHandler.createNodeFromExtract()`
- __escaped__: Creates text node with literal content

__Example:__

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

__Error Handling:__

- Returns error node on failure
- Logs error message
- Parsing continues for other elements

---

### mergeDOMNodes(html, nodes, uuid)

__New in:__ Phase 3 (Issue #117)

Merges WikiDocument DOM nodes back into markdown-it-generated HTML by replacing placeholders with rendered nodes.

__Parameters:__

- `html` (string): markdown-it-generated HTML with placeholders
- `nodes` (`Array<Element>`): Array of WikiDocument DOM nodes
- `uuid` (string): UUID from extraction (for placeholder matching)

__Returns:__ `string` - Final HTML with nodes merged

__Algorithm:__

1. Sort nodes by ID in descending order (handles nested syntax)
2. For each node, find its placeholder `<!--JSPWIKI-uuid-id-->`
3. Replace placeholder with `node.outerHTML` or `node.textContent`
4. Return final HTML

__Example:__

```javascript
const html = '<p>User: <!--JSPWIKI-abc12345-0--></p>';
const nodes = [/* WikiDocument nodes */];
const uuid = 'abc12345';

const final = parser.mergeDOMNodes(html, nodes, uuid);
// Result: '<p>User: <span class="wiki-variable">Alice</span></p>'
```

__Features:__

- __Descending ID Order__: Handles nested JSPWiki syntax correctly
- __Safe Replacement__: Regex escaping prevents injection
- __Preserves HTML__: markdown-it-generated HTML structure maintained

---

## Helper Methods

### createTextNodeForEscaped(element, wikiDocument)

Creates a text node for escaped JSPWiki syntax.

__Parameters:__

- `element` (Object): Escaped element with `literal` property
- `wikiDocument` (WikiDocument): WikiDocument instance

__Returns:__ `TextNode` - DOM text node

__Example:__

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

__@deprecated__ Initializes the legacy 7-phase pipeline.

Use `parseWithDOMExtraction()` instead for new code.

### executePhase(phase, content, context)

__@deprecated__ Executes a single phase of the legacy pipeline.

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

__Properties:__

- `jspwiki.parser.useExtractionPipeline` (boolean): Use extraction pipeline (default: `true`)
- `ngdpbase.parser.enabled` (boolean): Enable MarkupParser (default: `true`)

### Cache Configuration

```json
{
  "ngdpbase.markup.cache.parse-results.enabled": true,
  "ngdpbase.markup.cache.parse-results.ttl": 300,
  "ngdpbase.markup.cache.parse-results.max-size": 1000
}
```

### Performance Configuration

```json
{
  "ngdpbase.markup.performance.monitoring": true,
  "ngdpbase.markup.performance.alert-thresholds.parse-time": 100,
  "ngdpbase.markup.performance.alert-thresholds.cache-hit-ratio": 0.2,
  "ngdpbase.markup.performance.alert-thresholds.error-rate": 0.05,
  "ngdpbase.markup.performance.alert-thresholds.min-cache-samples": 50,
  "ngdpbase.markup.performance.history.dir": "${FAST_STORAGE}/parser-performance"
}
```

The three limits are set in code, not in `config/app-default-config.json`; the values above are their defaults.

### Page building check and history ([#2468](https://github.com/jwilleke/ngdpbase/issues/2468))

While pages are being viewed, the parser checks itself once a minute. A minute in which no page is built has no check. Each check measures:

- the average time to build a page, over the last 20 pages that were not served from a stored copy (milliseconds; none when there were none);
- the share of pages served from a stored copy, over the minute (none when nothing was looked up);
- the share of pages that failed to build, over the minute (none when nothing was built);
- how many pages were built in the minute.

The share served from a stored copy and the share that failed are the minute's own numbers, taken from the counters since the last check, not totals since start-up. The share served from a stored copy is compared to its limit only when the minute had at least `min-cache-samples` lookups; it is recorded when it had one or more.

Every check, over its limits or under them, is kept as one JSON line in a file for that day, `parser-performance-YYYY-MM-DD.jsonl`, in `ngdpbase.markup.performance.history.dir`:

```json
{"t":"2026-11-22T14:15:00.000Z","parse":119.5,"hit":0.192,"err":0,"n":20}
```

- A line is written when the check runs, so a restart loses nothing. It is at most 1,440 lines (about 150 KB) a day.
- Files whose whole day is more than 30 days old are removed when the parser starts and once a day after that.
- A failed write logs one warning and drops that line. It never fails a page build.
- The folder is operational data that rebuilds itself and is not part of a backup.
- With no folder to resolve (no ConfigurationManager), the checks run and nothing is kept.

Crossing a limit writes one warning line, and coming back under it one info line that says how long it was over. The count of minutes is the time between the two lines, so it includes minutes the check skipped (a minute with no page built, or too few lookups to judge the share served from a stored copy); it is not a count of checks that were over. Staying over writes nothing. Each limit is tracked on its own, and the state starts empty at every start, so a site that is still over its limit writes one crossing line per restart. The parser no longer sends a notification when a limit is crossed; `getPerformanceAlerts()` still lists one entry per crossing.

```text
Page building is over its limit: average 119.5 ms for the last 20 pages, limit 100 ms.
Page building is back under its limit: average 82.1 ms, limit 100 ms. It was over for 37 minutes.
```

For the share served from a stored copy, the limit is a lowest allowed, so its recovery line reads "It was below the lowest allowed for 37 minutes." The other two read "It was over for 37 minutes."

A line that does not parse, such as the half-written last line after a crash, is skipped when the files are read. The next check starts on a new line, so it is not joined to the fragment. A check whose time has no usable date is dropped with one warning, so a file name is only ever built from a real date.

#### Sums, `getPerformanceReport()`

`getPerformanceReport(now = Date.now())` reads the kept files and returns what the admin page "Page building speed" shows:

```typescript
{
  rollup: Record<'hour' | 'day' | 'week' | 'month', Record<'parse' | 'hit' | 'err', MeasureStats | null>>,
  checks: Record<'hour' | 'day' | 'week' | 'month', number>,
  legacy: Record<'parse' | 'hit' | 'err', MeasureStats | null>,
  limits: { parseTime: number; cacheHitRatio: number; errorRate: number },
  recording: boolean
}
// MeasureStats = { count, p50, p95, max, mean }
```

- The windows are the last hour, 24 hours, 7 days and 30 days up to `now`, the edge included. They are worked out when called; nothing is stored.
- `p50` and `p95` are nearest-rank: the value at rank `ceil(p / 100 × N)` of the N values, smallest first. `mean` is the plain average. A check with no value for a measure is left out of that measure's sums.
- A measure with no value in a window is `null`.
- `checks` is how many checks each window holds, whichever numbers a check carried. The page shows it once, in the column headings; a table whose own count differs says so on its own row.
- `recording` is false when there is no folder to keep checks in, or the folder could not be made when the parser started. In that case the parser does not try to keep checks and leaves the old notifications where they are.
- Reading 30 days of files is the costly part, so a report is reused for 60 seconds, the interval of the check itself. Many page views in a minute read the files once.

#### The earlier over-limit alerts

Before checks were kept, each minute a number went over its limit saved a notification titled `MarkupParser Performance Alert: ...`. Those are the only record of how bad the slow minutes were, so when the parser starts it copies their numbers to `legacy-alerts.json` in the same folder, and then deletes them with `NotificationManager.removeByTitles`, naming the three whole titles the parser used to write ([NotificationManager](../managers/NotificationManager.md)):

1. No file: read the old notifications, write the file under a temporary name and rename it into place, then delete the notifications. A crash never leaves half a file.
2. A file without `removedAt`: a crash fell between the write and the delete, so only the delete is tried again. Nothing is imported twice.
3. A file with `removedAt`: nothing runs.
4. A file that cannot be read is left as it is and nothing is deleted.

A site with no old alerts still gets the file, so the check is not repeated. A message that is not one of the three shapes the parser wrote is counted in `skipped` and left out of the numbers. A notification whose title is not exactly one of the three is neither counted nor deleted, even if it starts the same way. Percentages become ratios from 0 to 1, as in the per-minute lines; times stay in milliseconds. `legacy` in the report sums the imported samples from the last 30 days. They are over-limit checks only, so they show how bad the slow ones were, not how the site did overall, and the page shows them apart from the checks. The share served from stored copies and the share that failed in them were totals since start-up, not the minute's own, so the page says they are not comparable with its per-minute tables.

#### The admin page

`GET /admin/parser-performance`, "Page building speed" on the admin dashboard next to Logs, shows the sums above. It opens for a caller who passes the `admin-read` permission check (`admin-system` also passes); anyone else gets the same 403 "Access Denied" as Logs. It is read-only: nothing on it changes a setting or removes a file, and the removal of old notifications is not reachable from any route.

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

1. __Primary__: Extraction pipeline
2. __Fallback__: Legacy 7-phase parser
3. __Ultimate__: Return original content

__Example:__

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

__Typical Performance:__

- Small page (<1KB): <10ms
- Medium page (1-5KB): <50ms
- Large page (5-10KB): <100ms
- Very large page (10KB+): <500ms

__Scaling:__

- Extraction: O(n) where n = content length
- DOM Creation: O(m) where m = number of JSPWiki elements
- Merge: O(m log m) due to sorting

### Cache Integration

`parse()` is the one page cache. It reads through the `MarkupParser-ParseResults` region (`RegionCache.getOrSetVersioned`); there are no separate handler-result, pattern or variable caches.

- __Key__: the page text, page name, the viewer's username and roles, the query string and the viewer's date/locale preferences, plus a 5-minute time bucket
- __TTL__: `ngdpbase.markup.cache.parse-results.ttl` in seconds (default 300)
- __Freshness__: an entry records the version of each data topic its render read (always `PageManager`, `ConfigurationManager`, `UserManager`, plus every manager a plugin asked for) and re-renders once any of them is bumped. A plugin may add `context.dependsOn(topic)`; time-driven output uses `CLOCK_TOPIC`, per-request output marks the render volatile and is not stored
- __Not cached__: a page that is not shared-indexable (a sealed private-store page)
- `ngdpbase.markup.cache.parse-results.max-size` is read but not currently enforced

See [caching-developer-guide.md](../guides/caching-developer-guide.md).

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

__Before (Manual Phase Management):__

```javascript
// Don't do this anymore
const phases = parser.phases;
let content = originalContent;
for (const phase of phases) {
  content = await phase.process(content, context);
}
```

__After (Use Primary Method):__

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

__Symptom:__ `<!--JSPWIKI-abc12345-0-->` appears in rendered page

__Cause:__ DOM node not created or merge failed

__Solution:__

1. Check handler initialization: `await parser.initialize()`
2. Check error logs for handler failures
3. Verify WikiDocument is created correctly

### Issue: Markdown not rendering

__Symptom:__ Markdown syntax (`##`, `**`, etc.) appears literally

__Cause:__ markdown converter not initialized or extraction conflict

__Solution:__

1. Verify RenderingManager has its markdown-it converter (`createMarkdownConverter('page')` in `initialize()`)
2. Check that JSPWiki syntax is extracted before markdown-it runs
3. Verify `jspwiki.parser.useExtractionPipeline = true`

### Issue: Variables not expanding

__Symptom:__ `[{$username}]` appears literally instead of expanding

__Cause:__ VariableManager not initialized or handler error

__Solution:__

1. Ensure `await parser.initialize()` is called
2. Check VariableManager is available: `engine.getManager('VariableManager')`
3. Check error logs for handler failures
4. Verify variable exists in VariableManager

### Issue: Slow parsing

__Symptom:__ Page loads take >1 second

__Cause:__ Large page, many elements, or cache disabled

__Solution:__

1. Enable parse results cache: `ngdpbase.markup.cache.parse-results.enabled = true`
2. Check page size (consider breaking up large pages)
3. Monitor logs for slow parse warnings
4. Check for plugin performance issues

---

## Testing

### Unit Tests

__Extraction Tests:__

```bash
npm test -- src/parsers/__tests__/MarkupParser-Extraction.test.js
```

__Merge Pipeline Tests:__

```bash
npm test -- src/parsers/__tests__/MarkupParser-MergePipeline.test.js
```

__Comprehensive Tests:__

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

- [markdown-it Documentation](https://github.com/markdown-it/markdown-it)
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

__Last Updated:__ 2026-10-11
__Maintainer:__ ngdpbase Team
__Status:__ Production Ready
