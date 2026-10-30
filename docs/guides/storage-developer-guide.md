---
name: Storage developer guide
description: Where an add-on's pages, files and data live — declaring a system-category with its own vault, the fields that decide privacy and encryption, writing through the doors, and the gaps
dateModified: 2026-10-30
category: guides
relatedModules: [ValidationManager, PageManager, AttachmentManager, FileManager, ShareManager, DatabaseManager]
---

# Storage developer guide

What a developer, above all an add-on author, has to know about where things are stored. The design is [system-category.md](../system-category.md); this page is the practice.

## Where each kind of thing goes

| What | Where | Who it belongs to |
| --- | --- | --- |
| Pages the add-on __seeds__ (its own documentation) | System-category `addon`, public, no vault | The add-on |
| Content the add-on __generates for a person__ (journal entries, health records, their files) | The add-on's __own system-category__, with its __own vault__ `pages/vaults/{user}/{vaultid}/` | That user |
| A `general` page the add-on only helps someone create (a template) | `general`, and the user's `default` vault if they make it private | That user; no add-on rules afterwards |
| A request that waits for someone's decision (a new owner, an owner change) | Core's reviews: `host.reviews.fileRequest` ([addons guide](addons-developer-guide.md#ask-for-a-review)). Core keeps it in the application database, and only while that is encrypted, since its details can be personal; never a queue of the add-on's own | The site, until decided; removed after `ngdpbase.reviews.retention-days` ([ReviewManager](../managers/ReviewManager.md)) |
| Data the add-on keeps for itself (submissions, ledgers, indexes) | Its own [declared database](#declaring-a-database) (`DatabaseManager.openAddonDatabase`) or files under its own `dataPath`; never a vault | The system; read with `admin-system`, or handed to another add-on through a hook |

Never put an add-on's own content in `general` or a user's `default` vault. There it can't be told apart from the user's own pages, the add-on's rules (such as `encrypt`) don't apply, and turning the add-on off, retiring it ([#1490](https://github.com/jwilleke/ngdpbase/issues/1490)) or a takeout can't find it.

## Declaring a system-category with a vault

A system-category is an entry in `ngdpbase.system-category`. An add-on declares its own in its `config/default-config.json`. That file is merged into the site's configuration one entry at a time (#1220), and the site's own `app-custom-config.json` is applied last. For `ngdpbase.system-category` two things differ ([#1559](https://github.com/jwilleke/ngdpbase/issues/1559), details in [system-category.md](../system-category.md#system-categories-that-add-ons-bring)):

- __It is read whether or not the add-on is enabled.__ Turned off, the category stays (not offered, `enabled: false`): its pages keep resolving and its vault door says "turned off", its data untouched. If the add-on is removed, its category goes with its files.
- __The owner's fields stand.__ `owner`, `encrypt`, `defaultPrivate`, `shareMaxDays`, `comments` and `footnotes` are the add-on's; the site's file cannot change them (it gets a warning). The site decides the rest.

The PHR example (the yourPHR `phr` add-on):

```json
{
  "ngdpbase.system-category": {
    "phr": {
      "label": "PHR",
      "description": "Personal health Records and files",
      "default": false,
      "enabled": true,
      "owner": "phr",
      "storageLocation": {
        "defaultstore": "pages/",
        "privatestore": "pages/vaults/{user}/phr/"
      },
      "defaultPrivate": true,
      "encrypt": true,
      "shareMaxDays": 15,
      "page-badge": { "color": "bg-info", "label": "PHR", "title": "PHR entry" }
    }
  }
}
```

The journal's entry in `addons/journal/config/default-config.json` (#1507) has the same shape, and is the working reference.

### The fields an add-on sets

- __Map key and `label`__: keep them the same word. A page stores the `label` as its `system-category`, and some code looks entries up by key, some by label.
- __`storageLocation.defaultstore`__: `pages/`, where public pages of the category live. Without a `storageLocation` at all, pages of the category are never stored on the site: saving one is refused, none is seeded, and it is not offered in the editor (an enabled entry like that gets a startup warning).
- __`storageLocation.privatestore`__: the vault, `pages/vaults/{user}/{vaultid}/`. `{user}` is the page owner's username. The last segment is the vault id: use the add-on's slug, and never one another entry uses. Without a `privatestore`, pages of the category can never be private.
- __`defaultPrivate`__: whether a new page starts private. Exactly one of:
  - `true` (the boolean): always private, no preference offered;
  - `false` (the boolean, the default): always public, no preference offered;
  - `"choice"` (the string): each user's own preference, `<category>.defaultPrivate`; someone who hasn't set it starts private.

  The editor's Private box can still move a single page, where policy allows.
- __`encrypt`__: whether the vault's pages and files are sealed with the owner's key. `true` means always private: an encrypted page is never public in place.
- __`owner`__: your add-on's `ngdpbase.slug`, or leave it out: core stamps it. The owner's `encrypt` and `defaultPrivate` are the declaration that stands (operator, 2026-09-29): a health-record add-on that declares `encrypt: true` keeps it sealed. Any other `owner` (including `admin`) is refused.
- __`shareMaxDays`__: the longest a new share link into the vault may last. The vault's owner picks any lifetime up to it, and can extend a live link by up to 24 hours at a time. Default 15.
- __`comments`__ and __`footnotes`__: `false` turns the Comments or Footnotes tab off for every page of the category ([#1951](https://github.com/jwilleke/ngdpbase/issues/1951)); leave them out to keep the tabs. A page's own `comments:` / `footnotes:` frontmatter boolean wins over the category. Turned off, existing comments are kept and hidden, footnotes are kept and read-only, and the managers refuse new writes.
- __`enabled`__: whether the category is offered in the editor (to administrators: only they may set or change a page's system-category, [#1503](https://github.com/jwilleke/ngdpbase/issues/1503); anyone else's new page is `general`). An add-on that files pages in its own category sets it server-side, as the journal does. Visibility only: whether a page may be edited is policy. Set `false` when only the add-on assigns the category.
- __`default`__: never `true` on an add-on's entry (such an entry is refused). Exactly one entry, `general`, is the default.
- __`page-badge`__: optional `{ color, label, title }`, shown beside the page title.
- __Your seeded pages are shipped pages__ ([#1503](https://github.com/jwilleke/ngdpbase/issues/1503), operator 2026-10-29), exactly like `required-pages/` ones, decided per page by the seeded-pages record: only admins may edit, delete or rename them, they are never private (even in a system-category with a vault), and an edit marks them `user-modified`. A page a user makes in your system-category is not shipped. The system-categories your pages carry also count as shipped ones: moving a page into one is admin-only.
- __`source`__: removed ([#1503](https://github.com/jwilleke/ngdpbase/issues/1503)). Leave it out. An entry that still carries it is ignored, with one info line at startup naming every such entry; where pages are stored is `storageLocation` alone.

### Value types are exact

`defaultPrivate`, `encrypt`, `comments` and `footnotes` are compared as booleans. The string `"true"` is __not__ `true`:

- `"defaultPrivate": "true"` makes pages start __public__;
- `"encrypt": "true"` leaves the vault __unsealed__;
- `"comments": "false"` or `"footnotes": "false"` leaves the tab __on__.

So a wrong type is refused. An add-on's entry with one is left out entirely, with a startup warning and an admin notification naming the entry and the field. __The add-on itself is then not loaded__: none of its routes, plugins or other configuration keys apply, and `/admin/addons` shows it as not loaded with the reason. It loads again once its file is fixed. Write `true`, `false` or `"choice"` exactly (`comments` and `footnotes`: `true` or `false`). The same refusal applies to an entry whose `owner` isn't the add-on's slug, whose key is a site entry's or another add-on's, whose vault id another entry already uses, that sets `default: true`, or whose `privatestore` is malformed.

The same mistake in one of the site's own entries (core's, or the site's `app-custom-config.json`) is not refused: the site keeps running and the value is still read as above (false for `defaultPrivate` and `encrypt`, on for `comments` and `footnotes`). Startup logs an error, and admins get a non-dismissible dashboard entry under "Working, but needs your attention" (`markNeedsAttention`, [#1946](https://github.com/jwilleke/ngdpbase/issues/1946)) and a system notification. Both name the entry, the field, the bad value and what it is read as.

## Declaring a database

An add-on that keeps rows of its own declares its database in its `config/default-config.json`, then opens it from `register()` with `engine.getManager('DatabaseManager').openAddonDatabase(owner, { migrations, ledgerTable })` ([#1860](https://github.com/jwilleke/ngdpbase/issues/1860); the API is in [DatabaseManager.md](../managers/DatabaseManager.md#add-on-databases)). The PHR example:

```json
{
  "ngdpbase.addons.phr.database": { "owner": "phr", "ledgerTable": "phr_schema_migrations", "encrypt": "required" }
}
```

- __Only a declared database opens.__ `openAddonDatabase` throws for an owner and ledger no enabled add-on declares. Migrations stay in code: pass them when you open.
- __The key is your own slug__: `ngdpbase.addons.<slug>.database`. `owner` is the file (`<owner>.db`); a dependent add-on declares the owner's slug with a ledger of its own.
- __`ledgerTable`__ starts with the owner's slug, dashes as underscores, then `_`. One add-on declares one ledger; two add-ons can't declare the same one.
- __`encrypt`__ is exactly `"required"` or `"optional"`. Use `"required"` for anything personal, such as health records: without `NGDPBASE_DATABASE_KEY` the add-on isn't loaded at all, `/admin/addons` says why, and admins get a critical notification saying to set the key in `<FAST_STORAGE>/.env` and restart. `"optional"` opens unencrypted when no key is set, with a startup warning.
- __Site-critical__: when the site is wrong without your database (a health-record add-on whose records are the site), declare `"ngdpbase.addons.<slug>.site-critical": true` too. Then a missing key, a failed migration or integrity check, or any other failure to load puts the whole site in maintenance mode instead of switching only your add-on off: visitors get a short notice with no details, admins can still sign in and reach `/admin` ([addons guide](addons-developer-guide.md#when-an-addon-does-not-load-site-critical), #1883).
- __An invalid declaration stops the add-on loading__, like a refused system-category: a missing or mistyped field, any other field, a ledger outside the owner's prefix, a key under another add-on's slug, or a ledger another add-on already declares. Startup logs it and admins get a notification.
- __It stays known while the add-on is off.__ Admin → Add-ons lists every declared database, on or off, so its file isn't forgotten. The site's `app-custom-config.json` can't change a declaration; a value there is ignored, with a warning.
- __It needs the application database.__ When that can't be opened safely (no key or the wrong one, a damaged file, a failed migration), the site starts in maintenance mode and no add-on that declares a database loads: each is refused before it is imported, with the #1883 critical notification, and admins get "Critical: the application database is not available" naming the fix ([#1892](https://github.com/jwilleke/ngdpbase/issues/1892), [DatabaseManager.md](../managers/DatabaseManager.md#when-the-application-database-cant-be-opened-maintenance-mode)).
- __It is backed up because it is declared__ ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723)). Write no backup code: `DatabaseManager` copies every declared database, on or off, into each backup, encrypted under `NGDPBASE_BACKUP_KEY`, and a restore puts it back at the next start. Details in [DatabaseManager.md](../managers/DatabaseManager.md#backup-and-restore).
- __Never open the file yourself__, for a backup or anything else. A second connection, a file copy or a `VACUUM INTO` is a second door, and a copy of a live WAL file can be torn or miss committed pages.

## Writing pages and files

- __Pages__ go through `PageManager`, with the caller's context. A private page's name is `vaults/{owner}/{vaultid}/{title}`. `npm run lint:page-door` fails on any other page write.
- __Whether a name is taken is an exact question__ ([#2140](https://github.com/jwilleke/ngdpbase/issues/2140)). Ask `PageManager.uuidHoldingName('title' | 'slug', name, ctx)`: a title is held when another page has the same title, a slug when another has the same slug, ignoring case (the store's own rule, written once in `FileSystemProvider.uuidHoldingName`). `ValidationManager.checkConflicts` (every save, and the UUID Mismatch status in Admin → Required Pages) uses it. Never ask `getPage` / `pageExists` whether a name is free: they resolve links, plurals included, so "Reviews" finds "review".
- __Files__ (PDFs, images, DICOM) are written through `FileManager.put(ctx, place, file)` into the place the caller chose, and read as file records through `FileManager` ([Files: one record, one door](#files-one-record-one-door), [#2148](https://github.com/jwilleke/ngdpbase/issues/2148)). `FileManager.placesWritableBy(ctx)` lists the places a user may write to; never offer another. AttachmentManager is the storage underneath; its `uploadAttachment` (upload onto a page) still works for today's callers, and goes through `put`. An upload is either an attachment, on a page, or a saved file; __every attachment of a vault page is stored in that vault__ (operator, 2026-10-16, [#1842](https://github.com/jwilleke/ngdpbase/issues/1842)). A file uploaded onto a vault page goes into its vault, a shared file attached to one is copied in, and when a page moves into a vault, out of one or between two its files move with it under the same id ([private-stores.md](../private-stores.md#files)). A vault's files are just files, under the vault's own access controls. Never point a vault page at a file in the shared pool: the pool serves it to anyone with `asset-read`.
- __An upload records who uploaded it__, taken from the context the door was given, as the file's author and editor, public or vault: the user's identity `@id` ([#2097](https://github.com/jwilleke/ngdpbase/issues/2097); the username only when there is none or the identity store cannot answer). Never an email, never `Unknown`. No one uploads anonymously (operator, 2026-10-20, on [#1852](https://github.com/jwilleke/ngdpbase/issues/1852)): with nobody signed in (the anonymous subject, a share visitor, a job with no user behind it) the upload is refused after policy and before anything is written, and the route answers 401 ([#1926](https://github.com/jwilleke/ngdpbase/issues/1926)). An add-on uploading for a user forwards that user's context; one uploading for itself uses `jobContextFromSystem`.
- __Footnotes and comments__ go through `FootnoteManager` and `CommentManager`, naming the page as `{ name, uuid }` with the caller's context. A vault page's are kept in its vault and sealed with it; the name, not the uuid, says where ([#1839](https://github.com/jwilleke/ngdpbase/issues/1839), [private-stores.md](../private-stores.md#footnotes-and-comments)). Never key anything belonging to a vault page by uuid alone in a folder outside the vault. Ask `isAllowedOn` before offering either: on a page or category that turns them off, the managers' write doors refuse with `PageNotesTurnedOffError`, which routes answer with 403 ([#1951](https://github.com/jwilleke/ngdpbase/issues/1951)).
- __A page's author and editor, its history's editors, its tombstone's `deletedBy` and a file's uploader are identity `@id`s__ ([#2097](https://github.com/jwilleke/ngdpbase/issues/2097)); the doors store them. Code that reads one asks IdentityManager: `refersTo` for "is it this user's", `referencesOf` for a list filter, `usernameOf` for something named by username (a vault path, a preference), `describeReference` to show it (`jim (urn:uuid:…)`). Never compare a stored author with a username. A vault is still named by its owner's username. Existing records convert once ([PageManager](../managers/PageManager.md#authorship-identity-ids-2097), [AttachmentManager](../managers/AttachmentManager.md#who-uploaded-it-1926)); a vault's when it is opened.
- __Never__ write into `pages/` or `pages/vaults/` directly. The doors apply encryption, the owner checks, the audit record and the indexes.
- __A file in an encrypted vault is audited by id and vault only__ (operator, 2026-10-24, [#2048](https://github.com/jwilleke/ngdpbase/issues/2048)): `AttachmentManager`'s upload and delete records carry the attachment id, the owner and the store, never the file's original name, its page or its size. Anything new that records a vault file follows the same rule (`AttachmentDetail`'s `sealedStore` form in `src/utils/auditEvents.ts`). An unencrypted vault and the shared pool keep the name.
- __An import's kept original__ ([#2061](https://github.com/jwilleke/ngdpbase/issues/2061)): `AttachmentManager.uploadAttachment` takes an `OriginalKeep` as its `keep` option, which only the import engine opens, for one receiver's `keepOriginal` call at upload. It applies only to a file going into the uploading user's own vault of a system-category the receiver's add-on declares: there the receiver's declared `originals.types` are allowed beyond the site's `ngdpbase.attachment.allowedtypes`, and the store's index marks the file `download`. Every other upload uses the site's list. A file marked `download` is always served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` (`vaultFileDisposition`, at `/attachments/:id` and through a vault link), so a kept file never runs as a page; other vault files stay inline, so pictures on private pages still show. Never set `download` or pass `keep` any other way.
- An encrypted vault needs its owner's key, unlocked by their sign-in. A write without it is refused, never written in the clear. Whether a vault is sealed is fixed when it is created (its `store.json`), so decide `encrypt` before the first page is written.
- A vault of an `encrypt: true` category can't be written until its owner has opened it at `/stores/{vaultid}`, which creates the sealed copy. Before that a save is refused, and the editor tells them to open the vault first. A vault whose `store.json` isn't sealed under an `encrypt: true` category is refused too, and reported to admins at startup. Store I/O asks both the category and `store.json` ([#1834](https://github.com/jwilleke/ngdpbase/issues/1834)); details in [private-stores.md](../private-stores.md#the-kind-is-asked-as-well-as-storejson).
- Moving files into or out of a vault goes through store I/O as well, never a bare `fs.move`/`fs.copy`/`fs.writeFile`. Use `moveStoreFolder()` (history), the location's `io.writeBytes` (attachments), or refuse the move with `vaultMustBeSealed()` when there's no key (restore, legacy migrations) ([#1836](https://github.com/jwilleke/ngdpbase/issues/1836)).

## Files: one record, one door

Epic [#1851](https://github.com/jwilleke/ngdpbase/issues/1851) turns every stored file into one thing with one record behind one door. Every decision is in its [decision log](https://github.com/jwilleke/ngdpbase/issues/1851#issuecomment-6236003946), which is the spec; this section is what that means for code today.

### What exists now ([#1852](https://github.com/jwilleke/ngdpbase/issues/1852), [#2148](https://github.com/jwilleke/ngdpbase/issues/2148))

- __The file record__ is `FileRecord` in `src/types/File.ts`. It takes its fields from `AssetRecord` by name (`id`, `filename`, `name`, `description`, `keywords`, `encodingFormat`, `contentSize`, `url`, `mentions`, `dateCreated`/`author`, `dateModified`/`editor`) and adds `place`, `owner` and `systemCategory`. Declare nothing about a file anywhere else: extend this shape, or `AssetRecord` under it.
- __A place is `FilePlace`__, the one declaration of where a file lives: `{ kind: 'public' }`, `{ kind: 'vault', owner, vault }` or `{ kind: 'shared-folder', folder }`, named by the ids the site already uses. Never pass a shared folder as a vault of its internal container.
- __FileManager is the door__ for files ([FileManager.md](../managers/FileManager.md)). It reads: `list`, `get` and `findByName` show today's attachments (the shared pool as the public place, and every vault the requester may read) as file records. The public place needs `asset-read`; a vault is read through AttachmentManager's vault reads, under the container rule. A viewer never sees another user's vault, and a vault's metadata never leaves the door.
- __It writes through one door, `put(ctx, place, file, options)`__ (step 1 of [planning/files.md](../planning/files.md), #2148): the permission for the chosen place first (`asset-upload` for public, the vault rule for a vault, `shared-folder-file` for a folder), refused before any bytes are stored; then AttachmentManager stores it, sealed as the place requires, and records the upload (a sealed place's file by id only). No page decides the place: `options.pageName` is only the page that shows the file. `placesWritableBy(ctx)` lists the places the same questions allow. Today's page-tied upload (`AttachmentManager.uploadAttachment`) asks FileManager for the place (`placeForPageUpload`: a folder page's folder, a vault page's vault, the Private tick's vault, otherwise public) and then calls `put`, so there is one write path.
- __The migration dry run__ is `npm run files:migration:dry` ([#1859](https://github.com/jwilleke/ngdpbase/issues/1859)). It opens the door read-only (`FileManager.openForOperator()`) and reports counts, bytes, owners (with the configured mapping), name clashes per place with the `-###` name each would get, the pages whose links would be rewritten, and each vault as counts. It writes nothing. Its values are `ngdpbase.files.migration.owner-map`, `default-owner` and `clash-suffix-digits`.
- __Still today__: files are moved and deleted through `AttachmentManager`, as in [Writing pages and files](#writing-pages-and-files). Nothing about stored data or its layout changed.

### What is decided for later

From the decision log (17 October and round 2, 20 October), in short:

- A file is bytes plus one record, the same for every type; a page is a file of type `text/markdown`, and rendering is what differs by type. Every change is a version; only markdown keeps old content.
- A file is unique by place plus name, its id stable across renames and moves; linkable by name (`[Annual Report.pdf]`), URLs by name. No deduplication. Uploading a taken name replaces the file as a new version, after a warning.
- Files stand on their own and pages link to them; a page moving into a vault leaves its files' fate to the user, and only a file's owner moves it into a vault. The uploader is the owner; only the owner or an administrator (a permission, not a role) edits metadata.
- Permissions: `page-*` for pages, `asset-*` for every other file. No `file-*` set.
- A system-category per file (never by type) decides its vault and that vault's rules; picked on the upload form, starting from `general`.
- Media items are files with MediaManager as their handler; the library stays read-only. `[name.jpg]` finds an upload first, `[media:name.jpg]` the library copy.
- __One shape, an index per place__ (public, each vault, sealed inside it, the media library); the door reads them as one. __An index per type__ (pages, files, media, footnotes, comments) in one listing shape, usable on pages through one plugin.
- __Footnotes are shared records__ used by many pages; editing one asks which pages take the new wording. __Comments__ always target a file or an add-on record and need their own permission.
- __PageManager stays__, with its own index, for a long time; the files layer starts with uploads, media, footnotes and comments.
- __FileManager is the only writer of files__; __intake is ImportManager, extended__ (receive, unpack, identify, chained converters that add-ons register, hand to the writer). Converting to NCM is an option, with the original kept, cited or dropped as the user (or the calling add-on) chooses. Folder intake is upload (copy) or a linked read-only folder; files no converter reads yet are stored as they are, "not converted".
- __Migration is copy-first__: dry run, copy (originals untouched), verify counts and hashes, catch up, switch, keep the old pool read-only until the operator deletes it. Clashes get `-###`; pages using a clashing name are rewritten to the new name.

### Next steps

Not built yet, each its own step: the Upload file dialog through ICE ([#2149](https://github.com/jwilleke/ngdpbase/issues/2149)) and `/files` ([#2150](https://github.com/jwilleke/ngdpbase/issues/2150)), which move today's page-tied callers onto `put` with a place the user chose; replace as a version, rename, move and delete through FileManager; the per-place index files; ImportManager as the intake; footnote and comment records; links and URLs by name; the type indexes and their plugin; the copy, verify, catch-up and switch of the migration; the UI ("Files", "My files", "Upload file").

## Access, sharing and proxies

Vault access is the same for every vault, core's or an add-on's. Add nothing vault-specific.

- Only the vault's owner gets past the private-container check. Policies can name `vault` as a resource type (#1539).
- __Share links__ into a vault are issued by `ShareManager`, limited by the category's `shareMaxDays`.
- __Proxy access__ (#1762): someone acting for the owner reaches the vault under their grant; an encrypted vault's key copy is sealed to them (`vault-proxy`).
- An add-on's own records in a database follow the access-control model in [#1431](https://github.com/jwilleke/ngdpbase/issues/1431#issuecomment-6193262203): the add-on's manager is the PEP and asks the PDP.

## Known gaps

- __Removing the add-on removes its category__ ([#1490](https://github.com/jwilleke/ngdpbase/issues/1490)). The category is read from the add-on's files, so with them gone its pages carry an unknown system-category and its vault door answers "no such store". The data stays on disk. Retiring an add-on properly is #1490.
- __Restoring a database needs a site that starts__ ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723)). The restore is on Admin → Backup (staged, applied at the next restart); there is no command line for a site that won't start. A site whose application database can't be opened now starts, in maintenance mode, and can be restored from Admin → Backup; its safety backup leaves the databases out and the current files are kept as `*.pre-restore` ([#1892](https://github.com/jwilleke/ngdpbase/issues/1892)). The rest of the database backup's gaps are in [DatabaseManager.md](../managers/DatabaseManager.md#known-gaps).
- __Without `NGDPBASE_BACKUP_KEY` no database is backed up__ (#1723). It is never written unencrypted instead: the dashboard shows the database manager degraded from the start, and BackupManager's banner and one-time notice say what is left out. Every site now gets a backup key at first start (#1876), so this is a site whose key was taken away. A backup key equal to `NGDPBASE_DATABASE_KEY` still backs up, with the same banner and a notification.
- __Vault files are backed up beside the document, and restore only with the site restore__ ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)). Each vault's `attachments/` and `files-index.json` go into `<stem>.vault-attachments.tar` as stored (sealed bytes stay sealed), not into PageManager's part of the backup. They come back only with the whole-site restore (Admin → Backup, "Restore the whole site", [#1945](https://github.com/jwilleke/ngdpbase/issues/1945)), staged and applied at the next restart; there is no restore of one vault's files ([backup and restore guide](backup-restore-guide.md#restoring-the-whole-site)).
- __Plaintext written before [#1834](https://github.com/jwilleke/ngdpbase/issues/1834)__: a page saved into an `encrypt: true` vault before its door was opened was stored in the clear. Such vaults are closed and listed at startup; moving or sealing their files is still an administrator's job, with no tool for it yet.
- __Plaintext moved into sealed vaults before [#1836](https://github.com/jwilleke/ngdpbase/issues/1836)__: a page made private into a sealed vault kept its history in the clear, and adopted attachments landed in the clear. New moves are sealed. What is already on disk is listed at startup (owner, vault, count and folder), and nothing re-seals it yet.
- __A backup taken before a vault was sealed can't put its files back into it__ (#1836). Its plaintext files, and a `store.json` that isn't sealed, are skipped and logged as an error. Restoring that vault means opening the old backup's contents through the page door.
- __Footnotes and comments written before [#1839](https://github.com/jwilleke/ngdpbase/issues/1839)__ on vault pages are in `data/footnotes/` and `data/comments/`, in the clear, until someone moves them in. They are no longer shown on the page, and each is listed at startup (owner, vault, page uuid). "Move into vault" (#1842) moves them in, sealed when the vault is: the owner for any of their vaults, an administrator (`admin-system`) for one that isn't sealed ([private-stores.md](../private-stores.md#repairing-what-earlier-moves-left-outside)). Nothing moves them on its own; a sealed vault's wait for its owner.
- __Files moved into vaults before [#1842](https://github.com/jwilleke/ngdpbase/issues/1842)__ stayed in the shared pool, served to anyone with `asset-read`, until someone moves them in. Vault pages still using them are listed at startup (owner, vault, page uuid), and "Move into vault" copies them in by the same rule as a move: the pool copy is removed when no public page that exists now uses it. A mention naming a page that no longer exists publicly (renamed, made private, deleted) is stale and keeps nothing; until 2026-10-17 such a name counted as a sharer, so a repair copied the file in and left the public copy, and the check then reported nothing. Most stale names came from the save-time sync: `BasicAttachmentProvider.updateAttachmentMetadata` ignored `mentions`, so a detach (a page renamed, or no longer referencing the file) never reached disk; it now writes them. The check now also reports a pool copy left beside the vault's own copy, and running the repair again removes it. A shared record with no mentions at all is still never taken from the pool by a move or repair, since mentions are how a public page's use is known. Pages in sealed vaults can't be checked without their owner's key, so only shared records that name a sealed vault's page are found there; a file a sealed vault's page only references in its content is moved in only when that page is repaired for another reason.
- __A takeout's footnotes and comments are not imported__ (#1839). The takeout carries them, decrypted, and the import lists them as ignored.
- __Operator scripts that walk `pages/` recursively__ (`migrate-private-field`, `migrate-vocabulary-slice1`, `migrate-user-pages-category`, `repair-jspwiki-frontmatter`, `migrate-page-acl-to-frontmatter`) also go into vaults. They can't read sealed files, so they leave them alone, but they do rewrite plaintext in vaults that aren't sealed. `migrate-page-created` used to rewrite sealed files too, and now skips them (#1836).
- __While the page list is rebuilt, pages not yet re-read are missing__ ([#1979](https://github.com/jwilleke/ngdpbase/issues/1979)). `refreshPageList` (the end of a folder import, Admin → Reindex) empties the page indexes and re-reads every page file, which takes seconds on a large site. Until a page is re-read, a lookup of it misses, and a miss is not plural-matched during the rebuild, so a listing that looks up every page does not scan every title per page; a UUID is never plural-matched. The rebuild does not yet keep the old indexes until the new ones are complete.
- __`ImportManager` `targetDir`__ writes raw files to any folder it is given, and no caller passes it today. Pointing it into a vault would bypass store I/O (#1836).
- __Uploads before [#1926](https://github.com/jwilleke/ngdpbase/issues/1926) may name their uploader by email or as `Unknown`__. A public upload recorded the email, or `Unknown` when there was none, because the door handed the provider `name` and the provider read `username`. Those records are left as they are; the files migration's owner mapping ([#1859](https://github.com/jwilleke/ngdpbase/issues/1859)) assigns them an owner.
- __Page authorship is converted while the site serves__ ([#2097](https://github.com/jwilleke/ngdpbase/issues/2097)). Until the start-up pass reaches a page, its author and editor may still be a username; lookups match either, and a reused username matches a not-yet-converted page until then. A vault's pages and files keep usernames until their owner next signs in or unlocks it, and match the username until then; a vault whose owner never signs in again is never converted (it is in their own folder anyway). Plainly: if an account is deleted and a new account takes the same username before the pass reaches a page, that page's unconverted `bob` matches the new bob (author-lock, "my pages", an `audience` or `access` entry), and the pass then stores the new bob's @id, so the new account inherits it; once the pass has run, the old name is an orphan and nobody inherits it. A frontmatter `author`/`editor` written over several lines, or an `access` written as a flow mapping (`access: { view: [...] }`), is left as it is and counted in the log at info. A page or tombstone that fails for its own reason (unreadable, a full disk, a vault manifest) is skipped, counted by error class, and keeps the pass from being recorded as done, so the next start visits every page again. An access-list entry naming a role that does not exist yet, and no account, is orphaned (it named nobody already).
- __A site override of the journal's owner fields is now ignored__ ([#1507](https://github.com/jwilleke/ngdpbase/issues/1507)). The journal's entry moved from core config to the add-on, so a site whose `app-custom-config.json` sets `encrypt`, `defaultPrivate` or `shareMaxDays` on `journal` gets the journal's value and a startup warning. Vaults already sealed stay sealed; new ones follow the journal.

- __The files door writes new files only__ ([#2148](https://github.com/jwilleke/ngdpbase/issues/2148)). `put` stores a new file; rename, move, delete and replace-as-a-version still go through `AttachmentManager`, and there are no per-place index files yet.
- __Today's uploads still name a page__ (#2148). The editor's upload, imports, NCM image localization and thumbnails call `AttachmentManager.uploadAttachment`, whose place FileManager still infers from the page and the Private tick (`placeForPageUpload`) before `put`. The upload dialog, picker and `/files` that let the user choose the place are [#2149](https://github.com/jwilleke/ngdpbase/issues/2149) and [#2150](https://github.com/jwilleke/ngdpbase/issues/2150).
- __`placesWritableBy` asks permission, not the key__ (#2148). A sealed vault whose key is not in the session (locked, or an `encrypt: true` vault not yet opened) is listed when the vault rule allows it, and `put` then refuses it at the store. A user's own vaults are their default vault and the ones already on disk; a vault a system-category declares but they have never opened is not listed.
- __A viewer's vault files are their own vaults' only__ (#1852), as AttachmentManager reads them today: a proxy acting for a vault's owner does not see its files through the door yet.
- __The dry run's page rewrites come from each file's recorded pages__ (`mentions`), not a scan of page content, and cover public pages only (#1859). A stale mention lists a page that no longer shows the file; a page that shows a file its record does not name is missed. The copy step has to confirm against content.
- __The dry run doesn't check uploaders against accounts__ (#1859). A recorded name is kept unless `owner-map` covers it or it is `Unknown`, empty or an email; a name that is no account (a deleted user, a typo) is kept as is.
- __Names match exactly__ (#1859): `Route.png` and `route.png` are two names, as a link finds a file today.
- __The media library is not in the door yet__ (#1852): media items have no file records, and the dry run reports none.

- __An add-on that catches `openAddonDatabase`'s error still loads__ (#1860). It gets no connection, so nothing is written, but its status shows it as loaded. A `"required"` database with no key is caught before import and never gets this far; an undeclared owner or ledger is refused only when opened. Let the error leave `register()`.
- __A declared database that is never opened__ (the add-on is off, or it opens lazily) is listed as not open; nothing checks that its file exists or passes its integrity check until it is opened.

- __A "needs review" form submission is kept in the clear__ ([#2072](https://github.com/jwilleke/ngdpbase/issues/2072)). Core keeps the request (summary and details) only in the encrypted application database, but the forms add-on saves the full submission as plain JSON under its `dataPath` before filing it, as it does every stored submission, and keeps it after the decision. Forms' storage is not changed by #2072; a form whose answers are personal and must not be kept in the clear cannot use `review` yet.

## Checklist

- [ ] Generated content is in the add-on's own system-category, never `general`
- [ ] The vault id (last segment of `privatestore`) is the add-on's slug and unique
- [ ] `owner` is the add-on's slug
- [ ] `defaultPrivate` is `true`, `false` or `"choice"`; `encrypt` is a boolean
- [ ] `encrypt` decided before the first page is written
- [ ] Every page write goes through `PageManager`, every new file through `FileManager.put` into a place `placesWritableBy` offers
- [ ] The add-on's own data is in its database or `dataPath`, never a vault
- [ ] Its database is declared under `ngdpbase.addons.<slug>.database`, with `encrypt` `"required"` for anything personal
- [ ] No backup code of its own, and no second connection to its database file
