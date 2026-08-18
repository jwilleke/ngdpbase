# Current Rendering Pipeline

__Status__: Production Architecture (as of 2026-05-03, post-v3.6.0)
__Related__: [Current-Save-Page-Pipeline.md](./Current-Save-Page-Pipeline.md) | [WikiDocument-DOM-Architecture.md](./WikiDocument-DOM-Architecture.md) | [JSPWikiPreprocessor.md](./JSPWikiPreprocessor.md) | [Access-Control.md](./Access-Control.md)

---

## Request-to-HTML Flow

```
HTTP GET /wiki/PageName
    │
    ▼
WikiRoutes.viewPage()
    │  wikiContext.canAccess('view') / hasPermission(...) — see Access-Control.md
    │  page load via PageManager
    ▼
WikiContext (request encapsulation; lazy theme resolution post-v3.6.0)
    │
    ▼
RenderingManager.renderMarkdown()
    │  cache check → MarkupParser.parse()
    ▼
MarkupParser.parseWithDOMExtraction()   ← primary path
    │
    ├─ Phase 1: extractJSPWikiSyntax()
    ├─ Phase 2: WikiDocument DOM node creation
    ├─ Phase 2.5: JSPWikiPreprocessor (tables, style blocks)
    ├─ Step 0.55: inline style conversion (%%sup/sub/strike%%)
    ├─ Phase 2.6: registered handlers
    └─ Phase 3: Showdown markdown → HTML
    │
    ▼
DOM placeholder restoration (UUID spans → rendered HTML)
    │
    ▼
FilterChain  ⚠️ WIRED BUT NOT CALLED — see #596
    │
    ▼
TemplateManager (EJS) — reads wikiContext.activeTheme/themeInfo lazily → HTTP Response
```

---

## Component Status

| Component | Status | Notes |
|---|---|---|
| `MarkupParser.parseWithDOMExtraction()` | ✅ Active | Primary rendering path |
| `WikiDocument` DOM | ✅ Active (partial) | Used for extracted elements (code, plugins, style blocks, links) — not full-page DOM parse |
| `JSPWikiPreprocessor` | ✅ Active | Phase 2.5 — converts bare table syntax and `%%class%%` style blocks to HTML |
| __WikiContext access methods__ | ✅ Active | `hasRole` / `hasPermission` / `canAccess` / `getPrincipals` route-handler gates (post-#625, v3.6.0) — see [Access-Control.md](./Access-Control.md) |
| __Lazy theme resolution__ | ✅ Active | `wikiContext.activeTheme` / `themeInfo` are getters; resolution + ThemeManager fs I/O fire only on first read (typically inside template rendering) |
| __ParseContext access methods__ | ✅ Active | `hasRole(...names)`, `hasPermission`, `canAccess`, `getPrincipals` (mirrors WikiContext API; #625 + #633) |
| `FilterChain` (Security/Spam/Validation) | ⚠️ Initialized, never called | `filterChain.execute()` missing — tracked in [#596](https://github.com/jwilleke/ngdpbase/issues/596) |
| Legacy 7-phase string pipeline | ❌ Superseded | Replaced by `parseWithDOMExtraction()` |
| Inline `userContext.roles.includes('admin')` / `.isAdmin` | ❌ Lint-blocked | `eslint.config.mjs` `no-restricted-syntax` rule (post-v3.6.0) flags reads outside test files |

---

## Detailed Pipeline Phases

### Phase 1 — `extractJSPWikiSyntax()`

__Source__: `src/parsers/MarkupParser.ts` → `extractJSPWikiSyntax()`

Extracts structured elements from raw wiki markup and replaces them with UUID placeholder spans. Extracted elements become `WikiDocument` DOM nodes in Phase 2.

| Step | What it does |
|---|---|
| 0 | Fenced code blocks (` ``` `) — line-scanner, handles CRLF |
| 0.5 | `%%class … /%` style blocks via `extractStyleBlocksWithStack()` |
| 0.5 (inline) | Inline code spans (`` `…` ``) |
| 0.56 | JSPWiki status boxes (`%%information`, `%%warning`, `%%error`) → Bootstrap alerts |
| 0.6 | JSPWiki line breaks (`\\` → `<br>`, `\\\` → `<br class="wiki-clearfix">`) |
| 0.7 | Emoji shortcodes (`:name:` → Unicode) |

> __Note__: Inline style conversion (`%%sup/sub/strike%%`) was previously Step 0.55 here.
> It was moved to after Phase 2.5 (#592) so that `escapeHtml()` in `parseTable()` does not
> destroy the generated `<sup>`/`<sub>` tags. See Phase 2.5 notes below.

---

### Phase 2 — WikiDocument DOM Node Creation

__Source__: `src/parsers/MarkupParser.ts` → `parseWithDOMExtraction()` lines ~2115–2134

A `WikiDocument` instance is created. For each element extracted in Phase 1, a DOM node is created via `createDOMNode()`. These nodes hold the rendered HTML for plugins, variables, code blocks, and style blocks — they are restored into the output in Phase 4 (placeholder replacement).

WikiDocument is __not__ used as a full-document parser here — the surrounding wiki text continues through the string pipeline. Only the extracted elements are DOM-managed.

---

### Phase 2.5 — JSPWikiPreprocessor

__Source__: `src/parsers/handlers/JSPWikiPreprocessor.ts`
__Registered priority__: 95 (highest among handlers)

Converts bare JSPWiki syntax that was not captured as a style block in Phase 1:

- __Table syntax__: `||header||` / `|cell|` rows → `<table>/<thead>/<tbody>/<th>/<td>` HTML
- Calls `escapeHtml()` on each cell value — protects placeholder spans, escapes `&`, `<`, `>`, `"`, `'`

> __Important__: `%` is not an HTML-special character, so `%%sup 2%%` text inside a table
> cell survives `escapeHtml()` unchanged and is correctly converted in Step 0.55 below.
> See [#592](https://github.com/jwilleke/ngdpbase/issues/592) for the ordering fix history.

---

### Step 0.55 — Inline Style Conversion (after Phase 2.5)

__Source__: `src/parsers/MarkupParser.ts` → `parseWithDOMExtraction()` after the Phase 2.5 block

Converts inline JSPWiki style markers to HTML. Runs __after__ Phase 2.5 so these patterns are preserved through `escapeHtml()` in table cells.

| Pattern | Output | Notes |
|---|---|---|
| `%%sup content /%` or `%%sup content%%` | `<sup>content</sup>` | Superscript |
| `%%sub content /%` or `%%sub content%%` | `<sub>content</sub>` | Subscript |
| `%%strike content /%` or `%%strike content%%` | `<del>content</del>` | Strikethrough |

After conversion, any remaining `%%sup2%%`-style pattern (compact form with no space — malformed syntax) triggers a `<!-- VALIDATION WARNING [markup-syntax]: … -->` HTML comment. Correct syntax requires a space: `%%sup 2%%` or `%%sup 2 /%`.

> __TODO__: Once [#596](https://github.com/jwilleke/ngdpbase/issues/596) wires `filterChain.execute()`, move this warning to `ValidationFilter.validateMarkupSyntax()`.

---

### Phase 2.6 — Other Registered Handlers

All handlers except `JSPWikiPreprocessor` run here in priority order. Because JSPWiki syntax was already extracted in Phase 1 (replaced with UUID placeholders), built-in handlers (PluginSyntaxHandler etc.) are effectively no-ops on this content. Custom addon handlers with their own patterns run here.

---

### Phase 3 — Showdown Markdown Conversion

__Source__: `RenderingManager.converter.makeHtml(preprocessed)`

Showdown converts the preprocessed string (which now contains table HTML, inline style HTML, and UUID placeholder spans) to final HTML. Showdown configuration:

```javascript
{
  tables: true,
  strikethrough: true,
  tasklists: true,
  simpleLineBreaks: false,
  ghCodeBlocks: true,
  ghHeaderIds: true
}
```

---

### Phase 4 — DOM Placeholder Restoration

After Showdown runs, UUID placeholder spans (`<span data-jspwiki-placeholder="uuid-N">`) are replaced with the rendered HTML from the WikiDocument DOM nodes created in Phase 2. This is where plugin output, variable values, code blocks, and style block HTML are injected into the final document.

---

### FilterChain — ⚠️ Not Currently Executing

__Source__: `src/parsers/MarkupParser.ts` → `this.filterChain`

Three filters are registered and initialized:

| Filter | Config key | Default |
|---|---|---|
| `SecurityFilter` | `ngdpbase.markup.filters.security.enabled` | `false` |
| `SpamFilter` | `ngdpbase.markup.filters.spam.enabled` | `false` |
| `ValidationFilter` | `ngdpbase.markup.filters.validation.enabled` | `true` |

__However, `filterChain.execute()` is never called__ in `parse()` or `parseWithDOMExtraction()`. All three filters are dead code in the current production path.

This means:

- `ValidationFilter.validateMarkupSyntax()` does not run
- `<!-- VALIDATION WARNING -->` injection via `ValidationFilter` does not fire
- `SecurityFilter` HTML sanitization does not run
- `SpamFilter` link detection does not run

__Tracked in__: [#596 — FilterChain configured but filterChain.execute() never called](https://github.com/jwilleke/ngdpbase/issues/596)

---

## Caching

`MarkupParser.parse()` checks and populates a parse-result cache before calling `parseWithDOMExtraction()`:

```
cache key = hash(content + context)
cache TTL = ngdpbase.markup.cache-ttl (default: 300s)
```

Cache hits skip the entire pipeline and return stored HTML directly.

---

## Configuration

Key config properties controlling the rendering pipeline:

| Property | Default | Effect |
|---|---|---|
| `ngdpbase.markup.enabled` | `true` | Enable MarkupParser; falls back to basic Showdown if false |
| `ngdpbase.markup.caching` | `true` | Enable parse-result caching |
| `ngdpbase.markup.cache-ttl` | `300` | Cache TTL in seconds |
| `ngdpbase.markup.filters.enabled` | `true` | Global filter switch (has no effect until #596 is fixed) |
| `ngdpbase.markup.filters.validation.enabled` | `true` | Enable ValidationFilter (has no effect until #596 is fixed) |
| `ngdpbase.markup.filters.security.enabled` | `false` | Enable SecurityFilter (has no effect until #596 is fixed) |
| `ngdpbase.markup.filters.spam.enabled` | `false` | Enable SpamFilter (has no effect until #596 is fixed) |

---

## Key Source Files

| File | Role |
|---|---|
| `src/parsers/MarkupParser.ts` | Pipeline orchestration — `parse()`, `parseWithDOMExtraction()`, `extractJSPWikiSyntax()` |
| `src/parsers/handlers/JSPWikiPreprocessor.ts` | Table and style-block conversion (Phase 2.5) |
| `src/parsers/dom/WikiDocument.ts` | DOM node container for extracted elements |
| `src/parsers/filters/ValidationFilter.ts` | Markup validation (wired but not called — #596) |
| `src/parsers/filters/SecurityFilter.ts` | HTML sanitization (wired but not called — #596) |
| `src/managers/RenderingManager.ts` | Entry point — calls `MarkupParser.parse()`, holds Showdown converter |
| `src/routes/WikiRoutes.ts` | HTTP layer — `viewPage()` triggers rendering |

---

## Access-control gating (where it sits in the pipeline)

Permission checks happen at the __route-handler layer__, before `RenderingManager.renderMarkdown()` is invoked. The pipeline itself is permission-agnostic — by the time `MarkupParser` sees content, the user has already been authorized to read the page. Inside the parser pipeline, `ParseContext` plugins can do their own role checks (e.g., `CommentsPlugin` hides delete buttons for non-admins via `WikiContext.userHasRole(userContext, 'admin')`).

| Layer | Check | Method |
|---|---|---|
| Route handler (`viewPage`, `editPage`, etc.) | "Can this user read/edit this page?" | `wikiContext.canAccess('view')` / `canAccess('edit')` (3-tier ACL) |
| Route handler (admin/system endpoints) | "Can this user perform admin action X?" | `wikiContext.hasPermission('admin-system')` (global, PolicyEvaluator) |
| Hot-path middleware (maintenance, `/metrics`) | "Is this user an admin?" | `WikiContext.userHasRole(req.userContext, 'admin')` (sync, no context construction) |
| Plugins (parser pipeline) | "Should I render the delete link?" | `parseContext.hasRole('admin')` or `WikiContext.userHasRole(...)` |
| Search providers | "Which audience principals match this user?" | `wikiContext.getPrincipals()` — fed into per-doc audience filter at index-query time |

See [Access-Control.md](./Access-Control.md) for the full operational guide.

---

## See Also

- [Access-Control.md](./Access-Control.md) — operational guide for `hasRole` / `hasPermission` / `canAccess` / `getPrincipals` across contexts
- [Current-Save-Page-Pipeline.md](./Current-Save-Page-Pipeline.md) — How pages are written to disk
- [JSPWikiPreprocessor.md](./JSPWikiPreprocessor.md) — Table and style-block handler detail
- [WikiDocument-DOM-Architecture.md](./WikiDocument-DOM-Architecture.md) — WikiDocument design
- [WikiContext-Complete-Guide.md](../WikiContext-Complete-Guide.md) — full WikiContext API and lifecycle
- [RenderingManager Complete Guide](../managers/RenderingManager-Complete-Guide.md)
- [Issue #596](https://github.com/jwilleke/ngdpbase/issues/596) — FilterChain not wired
- [Issue #592](https://github.com/jwilleke/ngdpbase/issues/592) — Table inline style fix (Step 0.55 ordering)
- [Issue #625](https://github.com/jwilleke/ngdpbase/issues/625) — WikiContext access-method consolidation (shipped v3.6.0)
