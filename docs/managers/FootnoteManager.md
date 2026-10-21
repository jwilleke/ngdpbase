---
name: FootnoteManager
description: Sidecar storage + CRUD for page footnotes (migrated out of page body in #553/#557)
dateModified: '2026-10-19'
category: managers
code: src/managers/FootnoteManager.ts
---

# FootnoteManager

Stores footnote definitions as a sidecar JSON file per page, decoupling them from the page body. Migrated from in-body markdown footnotes (`[^id]:`) in #553 / #557 so footnotes can be edited, reordered, and rendered independently of page revision history.

## Storage

- Public page: `${SLOW_STORAGE}/footnotes/{pageUuid}.json` (`ngdpbase.footnotes.storagedir`)
- Vault page (`vaults/{owner}/{vault}/{title}`): `pages/vaults/{owner}/{vault}/footnotes/{pageUuid}.json`, read and written through the vault's store I/O, so sealed exactly when the page is, and refused when the vault is locked or not yet opened ([#1839](https://github.com/jwilleke/ngdpbase/issues/1839)). Where they live is decided by the page's name, never by its uuid alone: see [private-stores.md](../private-stores.md#footnotes-and-comments)
- A page that moves into or out of a vault takes its footnotes with it (`movePageFootnotes`, called by the page door)
- Enabled flag: configurable (default `true`)
- Moving definitions out of a page body: Convert to NCM, ingest and import, through `FootnoteManager.transferFromContent` (#1125)

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

Every call names the page as `{ name, uuid }` and carries the caller's context. Whether the caller may read or edit the page is decided by the route before the call.

- `getFootnotes(page, ctx)` — list footnotes for a page
- `addFootnote(page, footnote, ctx)` — append
- `updateFootnote(page, id, patch, ctx)` — edit
- `deleteFootnote(page, id, ctx)` — remove
- `movePageFootnotes(uuid, fromName, toName, ctx)` — follow the page to its new place

## Backup and restore

Public pages' footnotes are in every backup ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)): `backup()` writes the folder (`ngdpbase.footnotes.storagedir`) as `<stem>.footnotes.tar` beside the backup document, streamed, the files as they are, and the manager's entry names the archive (`src/utils/directoryBackup.ts`). `restore()` is staged (`restoreIsStaged()`): it extracts the archive to `<folder>.staged` as part of a site restore and never writes into the folder; at the next start, before anything reads the folder, the staged copy takes its place (the old one kept as `<folder>.pre-restore`) only when every part of the site restore goes in. A vault page's footnotes are in its vault, which PageManager backs up as stored. Details in the [backup and restore guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876-slice-1).

## See Also

- [FootnotesPlugin](../plugins/FootnotesPlugin.md) — render + CRUD UI
- Issues #553, #557 — sidecar migration tracking
