---
name: InsertPlugin
description: Embed another page's content (or one section of it) into the current page at render time.
dateModified: '2026-11-27'
category: plugins
code: src/plugins/InsertPlugin.ts
---

# InsertPlugin

Embed another page's content (or one section of it) into the current page at render time.

__Version:__ 1.0.0
__Issue:__ #665 (origin); #741 (`caption=`); #743 (source-page render identity + whole-page heading); #2550 (`denied=`, audience)

## Overview

`InsertPlugin` is a render-time transclusion plugin. When a page is rendered, every `[{Insert ...}]` invocation loads the referenced page, optionally slices a section out of it, and inlines its markdown into the host page at that position. The inserted content runs through `RenderingManager.renderMarkdown` so other plugins (Image, MediaPlugin, etc.) inside it still evaluate — but it is rendered under the __source__ page's name (not the host's), so identity variables like `[{$pagename}]` / `[{$title}]` resolve to the page the content came from (see [Render Path](#render-path); #743).

The supported forms:

```wiki
[{Insert page='Pagename'}]                                   full page
[{Insert pagesection='Pagename#Heading'}]                    section by heading text
[{Insert pagesection='Pagename?section=N'}]                  section by 0-based index
[{Insert pagesection='Pagename?section=1', caption='My Heading'}]   override imported heading
[{Insert pagesection='Pagename?section=1', caption='none'}]         drop imported heading
[{Insert page='Pagename', denied='none'}]                   show nothing if the viewer may not read it
```

The `?section=N` index form mirrors the editor's section-edit URL (`/edit/Pagename?section=N`) and reuses `SectionUtils.extractSection()`. The two locators are mutually exclusive on a single target string — when both `?section=` and `#` appear, `?section=` wins because it is the unambiguous URL form.

## Section semantics

Both section locators resolve through the same model:

- A __section__ is an ATX heading (`#`–`######`) plus everything down to — but not including — the next heading of the __same or higher level__ (fewer/equal `#`s). Deeper subsections are therefore included in their parent's slice.
- Section __indexing__ (`?section=N`, 0-based) counts every heading of any level in document order. It matches the editor's `?section=N` URL: YAML frontmatter is excluded from numbering, and headings inside fenced code blocks (```` ``` ````/`~~~`) are not counted (`SectionUtils.extractSection` / `findHeadings`).
- The heading-text locator (`#Heading`) is the first heading whose text matches case-insensitively after trimming. __Caveat:__ the heading-name scan (`findSectionIndexByHeading`) does *not* skip code-fence or frontmatter headings, so on a page that has `#`-lines inside a code block the `#Heading` form and the `?section=N` form can resolve to different sections. Prefer `?section=N` when a page embeds fenced code containing `#` lines.

## Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | string | *(none)* | Page name for full-page insert |
| `pagesection` | string | *(none)* | `Pagename#Heading` or `Pagename?section=N` for sectional insert; takes precedence over `page` |
| `caption` | string | *(none)* | #741: override the imported leading heading's text (keeps its level). A suppression token — `none`, `off`, `false`, `no`, or empty — drops the imported heading entirely so only the body transcludes. Omit the param: a __section__ insert keeps the section's own heading; a __whole-page__ insert is prefixed with an `## <source page title>` heading (#743). |
| `denied` | string | *(none)* | #2550: what a viewer sees when they may not read the page. Omit it for the `Insert: page not visible` note. A suppression token — `none`, `off`, `false`, `no`, or empty (the same tokens `caption` takes) — shows __nothing at all__: no text, no note and no page name. A page that is not found, a failed lookup and an unavailable page service show nothing too, so a refusal and an absence look the same. Any other value keeps the note. |

At least one of `page` or `pagesection` must be provided. An empty target renders nothing.

## ACL

The viewer's identity (not the host-page author's) gates the read. Insert reads the page through `PageManager.readPage`, the door every page read goes through, which decides `page-read` for the viewer before any content is read: the `private` flag, the page's frontmatter `audience`, access rules and global policy. Insert adds no check of its own, so it cannot disagree with the page's own view.

A viewer the door refuses gets the placeholder, or, with `denied='none'`, nothing:

```html
<div class="alert alert-info insert-plugin-placeholder" role="status">
  <i class="fas fa-info-circle"></i> Insert: page not visible <code>Pagename</code>
</div>
```

The placeholder keeps the insert position discoverable on the host page so an editor knows something was meant to render there, and it names the page, so it tells a viewer the page exists. Use `denied='none'` wherever the host page is shown to people who must not learn that: one host page can then show a section to members and nothing from it to a signed-out visitor.

The page cache keeps this safe. A host page's rendered HTML is cached per viewer (username and roles are part of the key), so the render made for a signed-out visitor is never served to a member, nor the member's to a visitor. Tests render the same host page in both orders from one cache.

With `denied` set, every refusal up to the read is silent: refused, not found, lookup failed, page service unavailable. Once the viewer may read the page, a missing section or a failed render still shows its note, as the viewer is allowed to know the page exists. The one note `denied` does not cover is the malformed-parameters guard, which is about the Insert markup itself and names its target.

## No-Recursion Guard

Any `[{Insert ...}]` syntax inside an inserted page is regex-stripped before the inserted content is handed to `renderMarkdown`. Replaced with `<!-- Insert (skipped: no recursion) -->` so the location stays visible in the rendered HTML source.

Other plugin syntax inside the inserted page passes through unchanged and evaluates normally during the inserted render.

## Render Path

The inserted content is rendered with `renderingManager.renderMarkdown(content, sourcePageName, userContext)`. The __source page's__ name is used for the rendering context so identity variables and pagename-relative context resolve against the page the content actually came from:

- `[{$pagename}]` / `[{$title}]` in the inserted content resolve to the __source__ page, so a transcluded heading reads exactly as it does on its own page (not the host's identity).
- Pagename-relative plugin context sees the source page.

This was a fix (#743, follow-up to #741): rendering under the host page name made a transcluded `# [{$title}]` heading display the host page's title.

For a __whole-page__ insert (`[{Insert page='X'}]`) with no `caption=`, an `## <source page title>` heading (falling back to the page name) is prepended so the inserted block is identifiably the source page. Section inserts keep their own heading; `caption=` still overrides or suppresses it (see Parameters).

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
| `src/plugins/__tests__/InsertPlugin.test.ts` | Unit tests |
| `src/plugins/__tests__/InsertPlugin.audience.test.ts` | Audience through the real read door and the per-viewer page cache (#2550) |
| `src/utils/SectionUtils.ts` | `extractSection(markdown, index)` reused by the index path |
| `required-pages/ad98220f-3780-4315-a7e1-ed598d5d870b.md` | End-user "Using InsertPlugin" guide |

## Known Limitations

- The default note for a refused read names the page (see [ACL](#acl)); pass `denied='none'` to show nothing.
- No caching of the inserted content. Every host-page render re-loads and re-renders the target page. Fine for typical deployments; worth revisiting if an embedded page becomes hot.
- Heading-text matching is exact (case-insensitive, whitespace-trimmed). Slug matching (`some-anchor` against an `id="some-anchor"`) is not currently supported.
- The `#Heading` and `?section=N` locators count headings differently on pages with `#`-lines inside fenced code blocks or frontmatter — the index path skips them, the heading-name path does not. See [Section semantics](#section-semantics).
