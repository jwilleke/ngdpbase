---
name: PageSlideshowPlugin
description: Bootstrap 5 carousel cycling through wiki page content with title + excerpt + Read more
dateModified: '2026-10-09'
category: plugins
code: src/plugins/PageSlideshowPlugin.ts
relatedModules:
  - PageManager
---

# PageSlideshowPlugin

Renders a Bootstrap 5 carousel of pages. Each slide shows the page title, an excerpt of the body, and a "Read more" link to the page's own URL (`pageUrl()`: `/view/<name>`, or `/vaults/…` for a private page).

## Who the pages are read as

- Every named page is read through `PageManager.readPage(name, viewer)`, the same page-read door the routes use ([#1622](https://github.com/jwilleke/ngdpbase/issues/1622)). A refused or missing page is not a slide, silently.
- `random` draws from `PageManager.listPagesFor(viewer, 'view')`, so only pages the viewer may read are candidates ([#1219](https://github.com/jwilleke/ngdpbase/issues/1219)).
- __No viewer__ (a render with no `userContext`, such as a background or cached render): pages are read as `ANONYMOUS_SUBJECT`, so only what an anonymous visitor may read appears. Before #1673 such a render could show every named page. Decided by the operator, 2026-10-09.
- No readable page at all: the plugin renders "no accessible pages found" instead of an empty carousel.

User-facing help: the required page "Using PageSlideshowPlugin".

## Usage

```wiki
[{PageSlideshowPlugin pages='Main,About,Contact'}]
[{PageSlideshowPlugin pages='Home,News' interval='4000' excerpt='200'}]
[{PageSlideshowPlugin random='5' interval='6000'}]
[{PageSlideshowPlugin random='3' height='350px' controls='false'}]
```

Use `pages` OR `random`, not both.

## Parameters

| Parameter | Default | Description |
|---|---|---|
| `pages` | — | Comma-separated wiki page names to include |
| `random` | — | Number of pages to pick randomly from all accessible pages |
| `interval` | `5000` | Milliseconds between auto-advances; `0` disables autoplay |
| `excerpt` | `300` | Max characters of page body per slide |
| `showTitle` | `true` | Show the page title as slide heading |
| `showLink` | `true` | Show a "Read more" link to the page |
| `controls` | `true` | Show prev/next arrow buttons |
| `indicators` | `true` | Show slide-dot indicators |
| `height` | `300px` | CSS `min-height` of each slide body |
| `cssclass` | — | Extra CSS class on the outer wrapper |

## Implementation

Carousel HTML is generated server-side; client-side cycling is handled by Bootstrap 5's `bootstrap.Carousel` (already present in the platform's bundle).

## See Also

- [SlideshowPlugin](SlideshowPlugin.md) — image-only slideshow (different surface)
