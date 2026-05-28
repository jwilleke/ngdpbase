---
name: FootnoteManager
description: Sidecar storage + CRUD for page footnotes (migrated out of page body in #553/#557)
dateModified: '2026-05-28'
category: managers
code: src/managers/FootnoteManager.ts
---

# FootnoteManager

Stores footnote definitions as a sidecar JSON file per page, decoupling them from the page body. Migrated from in-body markdown footnotes (`[^id]:`) in #553 / #557 so footnotes can be edited, reordered, and rendered independently of page revision history.

## Storage

- Sidecar: `${SLOW_STORAGE}/footnotes/{pageUuid}.json`
- Enabled flag: configurable (default `true`)
- Migration: `scripts/migrate-footnotes-to-sidecar.mjs`

## `PageFootnote` Shape

```ts
interface PageFootnote {
  id: string;
  display: string;
  url: string;
  note: string;
  createdBy: string;
  createdAt: string;
}
```

## API (high-level)

- `getFootnotes(pageUuid)` — list footnotes for a page
- `addFootnote(pageUuid, footnote)` — append
- `updateFootnote(pageUuid, id, patch)` — edit
- `deleteFootnote(pageUuid, id)` — remove

## See Also

- [FootnotesPlugin](../plugins/FootnotesPlugin.md) — render + CRUD UI
- Issues #553, #557 — sidecar migration tracking
