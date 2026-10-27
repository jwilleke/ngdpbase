---
name: FootnoteManager
description: Sidecar storage + CRUD for page footnotes (migrated out of page body in #553/#557)
dateModified: '2026-10-26'
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
- `isCreator(footnote, ctx)` — whether the caller added it; the plugin's Delete button and the delete route ask this

## Who added a footnote

`createdBy` is the creator's identity `@id` ([#2041](https://github.com/jwilleke/ngdpbase/issues/2041), step 6 of the [identity model](../planning/identity-model.md)), from `IdentityManager.identityIdOf(ctx, username)` under the system context; a name with no account (an import's system principal), or any name while the identity store cannot answer, is stored as given. `isCreator` answers "is it mine" by the caller's `@id`, or by their username on a footnote written before and not yet converted; an orphan never matches, so only an administrator can delete it.

At start-up the manager converts the public folder once: each footnote whose `createdBy` is still a username is given that user's `@id`, one write per page file, under the system context, and the count is logged. Values already an `@id` (`urn:`), `anonymous` and the system principal are left alone, so a second start writes nothing. A username with no account becomes `orphan:<name>` (nobody's from then on: a later account with the same name never takes it over, no "is it mine" check matches it, and only an administrator can act on it); the orphans are logged at every start, counts only, at info: an orphan is the intended final state and needs nothing from an administrator, so it is never on the dashboard ([#2097](https://github.com/jwilleke/ngdpbase/issues/2097)). An orphan is never looked up again. When the identity store cannot answer, nothing is converted, the dashboard says "identity store unavailable, conversion postponed", and the next start tries again. A vault page's footnotes are in its vault, which start-up does not open (a sealed one has no key then), so they keep their username until written again; `isCreator` still matches them.

## Backup and restore

Public pages' footnotes are in every backup ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)): the manager declares its folder (`ngdpbase.footnotes.storagedir`) in `backupFolders()` and writes no backup code ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985)). BackupManager writes it as `<stem>.footnotes.tar` beside the backup document, streamed, the files as they are, and the manager's entry names the archive. A site restore stages it (`restoreIsStaged()` is true for a manager that declares folders): BackupManager extracts the archive to `<folder>.staged` and never writes into the folder; at the next start, in `BaseManager.initialize()` before the manager reads the folder, the staged copy takes its place (the old one kept as `<folder>.pre-restore`) only when every part of the site restore goes in. A vault page's footnotes are in its vault, which PageManager backs up as stored. Details in the [backup and restore guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876-slice-1).

## See Also

- [FootnotesPlugin](../plugins/FootnotesPlugin.md) — render + CRUD UI
- Issues #553, #557 — sidecar migration tracking
