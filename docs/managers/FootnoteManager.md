---
name: FootnoteManager
description: Sidecar storage + CRUD for page footnotes (migrated out of page body in #553/#557)
dateModified: '2026-11-22'
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
  sourceId?: string; // the shared source it points at, when it has one (#2454)
}
```

## API (high-level)

Every call names the page as `{ name, uuid }` and carries the caller's context. Whether the caller may read or edit the page is decided by the route before the call.

- `getFootnotes(page, ctx)` — list footnotes for a page; a footnote with a `sourceId` comes back with its source's title and link (see [Shared sources](#shared-sources-2454))
- `addFootnote(page, footnote, ctx)` — append
- `updateFootnote(page, id, patch, ctx)` — edit
- `createSource({ title, url }, ctx)` and `getSource(id, ctx)` — make a shared source, and read one the person may see
- `deleteFootnote(page, id, ctx)` — remove
- `movePageFootnotes(uuid, fromName, toName, ctx)` — follow the page to its new place
- `isCreator(footnote, ctx)` — whether the caller added it; the plugin's Delete button and the delete route ask this

## Links: http and https only ([#2454](https://github.com/jwilleke/ngdpbase/issues/2454))

A footnote's link is a link only when it is an http or https address. `safeSourceUrl` and `tidyUrl` are in `src/utils/footnoteLinks.ts`.

- `addFootnote` and `updateFootnote` refuse a link that is not http or https with a `FootnoteLinkError`: "A footnote's link must start with http:// or https://. Check the address and try again." The add and edit routes answer it with 400 and that text. A footnote with no link at all (a note) is still saved.
- `importFootnote` and `transferFromContent` do not check the link they are given. The render does: `FootnotesPlugin` puts a stored value into `href` only when `safeSourceUrl` passes, and shows other values as text, so an old or imported value never becomes a link.
- `tidyUrl(url)` gives the key two links share when they are "the same link": `http` and `https` are equal, the host is lower case without a leading `www.`, a port written in the address stays in the key (an explicit default port such as `:443` is not the same key as no port), a `user:password@` part is left out (and `stripUrlCredentials` removes it from the link itself on every save), a trailing slash on the path is dropped, and `utm_*`, `fbclid` and `gclid` parameters are dropped. Other parameters keep their order, and a fragment stays. It returns `null` for a value that is not an http or https link. A new source keeps it as its `urlKey`.

## Shared sources ([#2454](https://github.com/jwilleke/ngdpbase/issues/2454))

A source is one title and one link that many footnotes can point at. Each is a file of its own, `{id}.json`, in `ngdpbase.footnotes.sources.storagedir` (default `${SLOW_STORAGE}/footnote-sources`), written only by this manager through `SourceStore` (`src/utils/footnoteSources.ts`). The id is a random UUID, never made from the link.

- A record holds `id`, `title`, `url` (as entered, http or https only), `urlKey` (its `tidyUrl`), `status` (`good`), `statusSince`, `flagReason`, `lastChecked`, `staleBy`, `createdBy` (an identity `@id`, as for a footnote) and `createdAt`.
- `createSource` refuses a link that is not http or https with a `FootnoteLinkError`, and a title with nothing in it. It bumps the cache topic once and records `footnote-edit` with action `create`, resource type `footnote-source`, and the source's id only: never its title or link. It needs the `page-edit` permission (`SourceNotPermittedError` otherwise), refuses while footnotes are turned off, cuts a title to 300 characters, and saves a link without any `user:password@` part: the link is cleaned, never refused. No route calls it yet.
- __A footnote may point at a source.__ `addFootnote` and `updateFootnote` take a `sourceId`. The footnote stores the id and a copy of the source's title and link; any title or link sent with the id is ignored. An id with no record is refused: "That source was deleted a moment ago. Search again, or add the link as a new source." `updateFootnote` with `sourceId: null` makes it a page note again, with the title and link given (checked like any link) or, when none are given, the stored copy. With no `sourceId` at all, a sourced footnote keeps its source and only its note changes.
- __Which copy wins.__ `getFootnotes` shows the source's title and link whenever its record exists; with the record gone, the footnote's stored copy shows and the `sourceId` stays. `FootnotesPlugin` and the list route get this with no change of their own.
- __Vault pages never use a source__ (R6). `addFootnote` and `updateFootnote` refuse a `sourceId` on a vault page, whether or not the source exists: "Sources are shared across the site, so they can't be used on private pages. Add the link as a note on this page instead." When a page moves into a vault, `movePageFootnotes` rewrites its footnotes as page notes carrying the source's title and link as they are then (the stored copy when the record is gone), through the vault's own I/O, and drops the `sourceId`s. A move out of a vault, or to another public page, leaves them as they are.
- The add and edit routes do not accept a `sourceId` yet: they come with the screens.
- __Reverse index and reader filter__ (R6, R4). The manager keeps an in-memory index from each source to the public pages that cite it. It is built at startup from the page list (`PageManager.listPageRefs`, by name and uuid, never by listing a folder), so a vault page is never read, and it is updated on every footnote write, on a rename or delete (`pageChanged`, called from `reconcileSharedIndexes`) and on a move into a vault. A write that lands while the startup build runs can be missed until that page changes again or the site restarts.
- A person sees a source only if they may view at least one page that cites it (`PageManager.filterPagesFor` with their own context), or if no page cites it and they hold `page-edit` (so a new source can be found before it is used). A hidden source reads as a missing one. `getSource`, `listSourcesFor`, `findSourcesFor` (match by link key) and `citingPagesFor` all apply this; `addFootnote` and `updateFootnote` refuse a hidden source as "deleted a moment ago". A page whose footnotes are turned off still counts as citing. A page whose uuid no longer resolves does not.

## The cache

After every write to a page's footnote file (add, update, delete, import, transfer, and a move into or out of a vault) the manager bumps `FOOTNOTE_DATA_TOPIC` (`'FootnoteManager'`, in `src/cache/CacheDependencies.ts`), so a cached page that shows footnotes re-renders on its next view. `FootnotesPlugin` declares that topic before it reads. A failed bump is logged by the cache and never fails the write.

## Who added a footnote

`createdBy` is the creator's identity `@id` ([#2041](https://github.com/jwilleke/ngdpbase/issues/2041), step 6 of the [identity model](../planning/identity-model.md)), from `IdentityManager.identityIdOf(ctx, username)` under the system context; a name with no account (an import's system principal), or any name while the identity store cannot answer, is stored as given. `isCreator` answers "is it mine" by the caller's `@id`, or by their username on a footnote written before and not yet converted; an orphan never matches, so only an administrator can delete it.

At start-up the manager converts the public folder once: each footnote whose `createdBy` is still a username is given that user's `@id`, one write per page file, under the system context, and the count is logged. Values already an `@id` (`urn:`), `anonymous` and the system principal are left alone, so a second start writes nothing. A username with no account becomes `orphan:<name>` (nobody's from then on: a later account with the same name never takes it over, no "is it mine" check matches it, and only an administrator can act on it); the orphans are logged at every start, counts only, at info: an orphan is the intended final state and needs nothing from an administrator, so it is never on the dashboard ([#2097](https://github.com/jwilleke/ngdpbase/issues/2097)). An orphan is never looked up again. When the identity store cannot answer, nothing is converted, the dashboard says "identity store unavailable, conversion postponed", and the next start tries again. A vault page's footnotes are in its vault, which start-up does not open (a sealed one has no key then), so they keep their username until written again; `isCreator` still matches them.

## Backup and restore

Public pages' footnotes are in every backup ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)): the manager declares its folder (`ngdpbase.footnotes.storagedir`) in `backupFolders()` and writes no backup code ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985)). BackupManager writes it as `<stem>.footnotes.tar` beside the backup document, streamed, the files as they are, and the manager's entry names the archive. A site restore stages it (`restoreIsStaged()` is true for a manager that declares folders): BackupManager extracts the archive to `<folder>.staged` and never writes into the folder; at the next start, in `BaseManager.initialize()` before the manager reads the folder, the staged copy takes its place (the old one kept as `<folder>.pre-restore`) only when every part of the site restore goes in. The shared sources are a part of their own, `<stem>.footnote-sources.tar` (`ngdpbase.footnotes.sources.storagedir`), declared `optional`: a backup made before sources existed has none, and restoring it leaves this site's folder as it is and names it as not restored. A manager's first declared part is the one an older single-part backup holds, so those backups still restore (`partRecordIn`). A vault page's footnotes are in its vault, which PageManager backs up as stored. Details in the [backup and restore guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876-slice-1).

## See Also

- [FootnotesPlugin](../plugins/FootnotesPlugin.md) — render + CRUD UI
- Issues #553, #557 — sidecar migration tracking
