---
name: InsertPlugin
description: Embed another page's content (or one section of it) into the current page at render time.
dateModified: '2026-05-18'
category: plugins
code: src/plugins/InsertPlugin.ts
---

# InsertPlugin

Embed another page's content (or one section of it) into the current page at render time.

**Version:** 1.0.0
**Issue:** #665 (origin); #741 (`caption=`); #743 (source-page render identity + whole-page heading)

## Overview

`InsertPlugin` is a render-time transclusion plugin. When a page is rendered, every `[{Insert ...}]` invocation loads the referenced page, optionally slices a section out of it, and inlines its markdown into the host page at that position. The inserted content runs through `RenderingManager.renderMarkdown` so other plugins (Image, MediaPlugin, etc.) inside it still evaluate — but it is rendered under the **source** page's name (not the host's), so identity variables like `[{$pagename}]` / `[{$title}]` resolve to the page the content came from (see [Render Path](#render-path); #743).

Three forms are supported:

```wiki
[{Insert page='Pagename'}]                                   full page
[{Insert pagesection='Pagename#Heading'}]                    section by heading text
[{Insert pagesection='Pagename?section=N'}]                  section by 0-based index
[{Insert pagesection='Pagename?section=1', caption='My Heading'}]   override imported heading
[{Insert pagesection='Pagename?section=1', caption='none'}]         drop imported heading
```

The `?section=N` index form mirrors the editor's section-edit URL (`/edit/Pagename?section=N`) and reuses `SectionUtils.extractSection()`. The two forms are mutually exclusive on a single target string — when both `?section=` and `#` appear, `?section=` wins because it is the unambiguous URL form.

## Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | string | *(none)* | Page name for full-page insert |
| `pagesection` | string | *(none)* | `Pagename#Heading` or `Pagename?section=N` for sectional insert; takes precedence over `page` |
| `caption` | string | *(none)* | #741: override the imported leading heading's text (keeps its level). A suppression token — `none`, `off`, `false`, `no`, or empty — drops the imported heading entirely so only the body transcludes. Omit the param: a **section** insert keeps the section's own heading; a **whole-page** insert is prefixed with an `## <source page title>` heading (#743). |

At least one of `page` or `pagesection` must be provided. An empty target renders nothing.

## ACL

The viewer's identity (not the host-page author's) gates the read.

The current implementation is intentionally simplified:

- Only the `private: true` frontmatter flag is honoured.
- A page with `private: true` is readable by its `author` / `creator` username and any user with the `admin` role. Everyone else gets a placeholder.
- Frontmatter `audience` rules and global policy evaluation are **NOT** consulted by Insert. Full ACL parity is a deliberate follow-up.

When the viewer cannot read the target page, the plugin renders:

```html
<div class="alert alert-info insert-plugin-placeholder" role="status">
  <i class="fas fa-info-circle"></i> Insert: page not visible <code>Pagename</code>
</div>
```

The placeholder keeps the insert position discoverable on the host page so an editor knows something was meant to render there. It does not break the host page.

## No-Recursion Guard

Any `[{Insert ...}]` syntax inside an inserted page is regex-stripped before the inserted content is handed to `renderMarkdown`. Replaced with `<!-- Insert (skipped: no recursion) -->` so the location stays visible in the rendered HTML source.

Other plugin syntax inside the inserted page passes through unchanged and evaluates normally during the inserted render.

## Render Path

The inserted content is rendered with `renderingManager.renderMarkdown(content, sourcePageName, userContext)`. The **source page's** name is used for the rendering context so identity variables and pagename-relative context resolve against the page the content actually came from:

- `[{$pagename}]` / `[{$title}]` in the inserted content resolve to the **source** page, so a transcluded heading reads exactly as it does on its own page (not the host's identity).
- Pagename-relative plugin context sees the source page.

This was a fix (#743, follow-up to #741): rendering under the host page name made a transcluded `# [{$title}]` heading display the host page's title.

For a **whole-page** insert (`[{Insert page='X'}]`) with no `caption=`, an `## <source page title>` heading (falling back to the page name) is prepended so the inserted block is identifiably the source page. Section inserts keep their own heading; `caption=` still overrides or suppresses it (see Parameters).

If `RenderingManager` is unavailable (degraded deployment), the plugin falls back to an escaped `<pre>` block of the raw markdown so the host page still renders cleanly with no HTML injection risk.

## Attribution

Every successful insert is followed by a subtle attribution link:

```html
<div class="insert-plugin-attribution small text-muted mt-1">
  ↪ from <a href="/view/Pagename">Pagename</a>
</div>
```

When a section is requested, `(section: <label>)` is appended — using either the heading text or `#N` for index-based inserts. The attribution makes the transclusion source discoverable so editors know where to go to actually edit the content.

## Files

| File | Purpose |
| --- | --- |
| `src/plugins/InsertPlugin.ts` | Plugin implementation |
| `src/plugins/__tests__/InsertPlugin.test.ts` | 34 unit tests |
| `src/utils/SectionUtils.ts` | `extractSection(markdown, index)` reused by the index path |
| `required-pages/ad98220f-3780-4315-a7e1-ed598d5d870b.md` | End-user "Using InsertPlugin" guide |

## Known Limitations

- ACL is `private`-flag only (see [ACL](#acl) above). Frontmatter `audience` and global policy evaluation are not yet honoured.
- No caching of the inserted content. Every host-page render re-loads and re-renders the target page. Fine for typical deployments; worth revisiting if an embedded page becomes hot.
- Heading-text matching is exact (case-insensitive, whitespace-trimmed). Slug matching (`some-anchor` against an `id="some-anchor"`) is not currently supported.
