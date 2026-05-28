---
name: FootnotesPlugin
description: Renders footnote definitions from sidecar storage (FootnoteManager) with a CRUD UI for authorised users
dateModified: '2026-05-28'
category: plugins
code: src/plugins/FootnotesPlugin.ts
relatedModules:
  - FootnoteManager
---

# FootnotesPlugin

Renders the footnote definitions for the current page from sidecar storage. Falls back to scanning the page body for legacy pages that haven't been migrated to the sidecar.

## Storage

- Sidecar: `${SLOW_STORAGE}/footnotes/{pageUuid}.json`
- Managed by: `FootnoteManager`
- Migration: `scripts/migrate-footnotes-to-sidecar.mjs`
- Tracking: #553, #557

## Usage

```wiki
[{FootnotesPlugin}]
[{FootnotesPlugin noheader='true'}]
```

## Parameters

| Parameter | Default | Description |
|---|---|---|
| `noheader` | `false` | Suppress the "Footnotes" heading |

## Legacy Body Parsing

For pages not yet migrated to sidecar storage, the plugin recognises three legacy syntaxes from page body:

- `[^id]: text` — markdown footnote definition
- `* [^N] - text` — bullet-style numeric footnote
- `* [#N] - text` — JSPWiki-style numeric footnote

Once migrated, the sidecar is authoritative.

## See Also

- [FootnoteManager](../managers/FootnoteManager.md)
