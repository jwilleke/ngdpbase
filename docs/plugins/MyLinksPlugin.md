---
name: MyLinksPlugin
description: Renders the current user's pinned pages as a scrollable list in the sidebar.
dateModified: '2026-05-14'
category: plugins
code: src/plugins/MyLinksPlugin.ts
---

# MyLinksPlugin

Renders the current user's pinned pages as a scrollable list in the sidebar.

__Version:__ 1.0.0  
__Issue:__ #537

## Overview

`MyLinksPlugin` reads `nav.pinnedPages` from the authenticated user's preferences and renders a scrollable `<ul>` of bookmark links. Each link includes an inline remove button that calls `removePinnedPage()` (defined in `public/js/my-links.js`).

Anonymous and unauthenticated users receive an empty string — the section disappears entirely.

> __Note:__ As of the header.ejs template-level injection (fix for #420), My Links renders automatically in the sidebar for all instances regardless of which LeftMenu page variant is loaded. The `[{MyLinks}]` plugin invocation still works on any page but is no longer required in LeftMenu.

## Usage

```wiki
[{MyLinks}]
```

No parameters.

## Data Model

Pinned pages are stored in user preferences under the key `nav.pinnedPages`:

```typescript
interface PinnedPage {
  pageName: string;  // the wiki page name (slug)
  title: string;     // display label
}
```

Maximum 20 entries enforced by the `POST /api/user/pinned-pages` route.

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/user/pinned-pages` | Add a page (`{ pageName, title }` body) |
| `DELETE` | `/api/user/pinned-pages/:pageName` | Remove a page by name |
| `PUT` | `/api/user/pinned-pages/order` | Reorder pages (`{ pageName, direction }` body) |

All endpoints require authentication; anonymous requests receive `401`.

## Front-End

- `public/js/my-links.js` — `addPinnedPage(pageName, title)` and `removePinnedPage(pageName)`
- Loaded via `views/footer.ejs`
- The "Add to My Links" / "Remove from My Links" entry in the More dropdown is rendered in `views/header.ejs`

## Cache Key

`MarkupParser.generateCacheKey()` includes `nav.pinnedPages` in the context hash so the sidebar re-renders after pin/unpin instead of serving stale cached HTML.

## Files

| File | Purpose |
| --- | --- |
| `src/plugins/MyLinksPlugin.ts` | Plugin implementation |
| `src/types/User.ts` | `PinnedPage` interface, `UserPreferences['nav.pinnedPages']` |
| `src/routes/WikiRoutes.ts` | `addPinnedPage`, `removePinnedPage`, `reorderPinnedPages` handlers |
| `public/js/my-links.js` | Client-side add/remove helpers |
| `views/header.ejs` | More dropdown toggle + sidebar template injection |
| `views/footer.ejs` | `my-links.js` script tag |
