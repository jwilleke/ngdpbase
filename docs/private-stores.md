---
name: Private stores
description: Developer and operator reference for private stores — layout, kinds, keys, access, pages, links, search, trash and files
dateModified: 2026-09-24
category: architecture
relatedModules: [PageManager, AttachmentManager, SearchManager, PolicyInformationPoint, FileSystemProvider, VersioningFileProvider]
---

# Private stores

A __private store__ is one directory under `pages/private/{user}/{store}/` that holds a user's own pages, their history, their trash and their files, plus the indexes that describe them. It is a security container owned by that user, and it is self-contained: nothing about its contents appears in any shared index, so backing it up, deleting it or reading it is one directory's worth of work.

This page describes what the code does. Epic [#1382](https://github.com/jwilleke/ngdpbase/issues/1382) and its children ([#1383](https://github.com/jwilleke/ngdpbase/issues/1383)–[#1460](https://github.com/jwilleke/ngdpbase/issues/1460)) built it; the issue numbers appear here because the source cites them at the line that implements each decision.

The end-user page is [Using private stores](/view/Using-private-stores).

---

## On disk

The root is the resolved pages directory — `ngdpbase.page.provider.filesystem.storagedir` (default `./data/pages`) — plus the private root. There is no second storage root, and private pages are not on fast storage.

```text
private/{user}/user-keys.json               the user's wrapped keys
private/{user}/user-index.json              legacy: read once at unlock, then removed
private/{user}/{store}/store.json           kind, encrypt, created, wrapped DEK
private/{user}/{store}/pages-index.json     its pages
private/{user}/{store}/files-index.json     its files
private/{user}/{store}/search-index.json    its saved search index
private/{user}/{store}/deleted-index.json   its trash
private/{user}/{store}/migrations.json      the one-time migrations it has had
private/{user}/{store}/{uuid}.md            a page
private/{user}/{store}/versions/{uuid}/     that page's history
private/{user}/{store}/deleted/{uuid}.md    a deleted page, until it is purged
private/{user}/{store}/attachments/         its files, as {uuid}.ext
```

Every one of those names is defined in `DEFAULT_PRIVATE_STORE_LAYOUT` in `src/utils/privateStorePath.ts`, not in `config/app-default-config.json`. They are a disk convention the code owns.

An instance that must override one sets the matching configuration key, which `privateStoreLayoutFromConfig()` reads; an empty or non-string value falls back to the code's default.

| Layout field | Configuration key | Default |
|---|---|---|
| `privateRoot` | `ngdpbase.page.provider.filesystem.privateroot` | `private` |
| `defaultStoreId` | `ngdpbase.page.provider.filesystem.defaultstoreid` | `default` |
| `versionsDir` | `ngdpbase.page.provider.filesystem.versionsdir` | `versions` |
| `deletedDir` | `ngdpbase.page.provider.filesystem.deleteddir` | `deleted` |
| `attachmentsDir` | `ngdpbase.page.provider.filesystem.attachmentsdir` | `attachments` |
| `files.userkeys` | `ngdpbase.page.provider.filesystem.private.files.userkeys` | `user-keys.json` |
| `files.userindex` | `ngdpbase.page.provider.filesystem.private.files.userindex` | `user-index.json` |
| `files.storemeta` | `ngdpbase.page.provider.filesystem.private.files.storemeta` | `store.json` |
| `files.storepages` | `ngdpbase.page.provider.filesystem.private.files.storepages` | `pages-index.json` |
| `files.storefiles` | `ngdpbase.page.provider.filesystem.private.files.storefiles` | `files-index.json` |
| `files.storesearch` | `ngdpbase.page.provider.filesystem.private.files.storesearch` | `search-index.json` |
| `files.storedeleted` | `ngdpbase.page.provider.filesystem.private.files.storedeleted` | `deleted-index.json` |
| `files.storemigrations` | `ngdpbase.page.provider.filesystem.private.files.storemigrations` | `migrations.json` |

Every path is joined by a helper in the same module — `privateStoreRoot`, `privatePageFilePath`, `privateVersionDirectory`, `privateDeletedDirectory`, `privateStoreAttachmentsDir`, `storeMetaPath`, `storePageIndexPath`, `storeFileIndexPath`, `storeSearchIndexPath`, `storeDeletedIndexPath`, `storeMigrationsPath` — and every join validates its segments. A store id must be a plain lowercase slug (`[a-z0-9]+(-[a-z0-9]+)*`, `assertStoreId`); a user name must be exactly one path segment (`assertPathSegment`). Neither can be a path, so neither can leave the container.

`pathContainsPrivateRoot()` measures from the pages directory rather than searching the absolute path for `/private/`, which on macOS matched every page under `/private/var`.

---

## Store kinds and the door

A __store kind__ is instance-wide; a user's directory under it is that user's container. `storeKindFromConfig()` in `src/utils/privateStoreDoor.ts` reads two keys:

- `ngdpbase.stores.{id}.owner` — a non-empty string. A kind exists when it has an owner; with no owner there is no kind and the door 404s.
- `ngdpbase.stores.{id}.encrypt` — read strictly as a boolean. The string `"true"` is not a switch.

Shipped defaults in `config/app-default-config.json`:

```json
"ngdpbase.stores.default.encrypt": false,
"ngdpbase.stores.default.owner": "admin",
"ngdpbase.stores.recovery.confirmretries": 1
```

`owner` is `admin` for the core `default` kind, or an addon's canonical slug for a kind that addon owns. It is a label recording whose call `encrypt` was: nothing in the shipped code reads a `stores` block from an addon's `package.json` (`AddonManifest` in `src/managers/AddonsManager.ts` has no such field), so a kind is defined today by writing those two configuration keys. Whoever owns the kind decides `encrypt`; the end user is never asked, and the value is copied into that user's `store.json` when their copy is created, so changing the kind later does not reinterpret copies that already exist.

### The door

A user's copy of a kind is created when they walk through its door — never at login, never mid-save. The routes are in `src/routes/WikiRoutes.ts`:

| Route | What it does |
|---|---|
| `GET /stores/:kind` | The door. `step: 'ready'` when the user already has a copy, otherwise `intro-plain` or `intro-sealed` |
| `POST /stores/:kind` | Walk through. Creates at once, or shows the words screen |
| `GET /stores/:kind/confirm` | Type the words back. Never shows them |
| `POST /stores/:kind/confirm` | The last gate: a match commits, a miss shows a new set |

`storeDoorRequest()` gates all four on the `store-create` permission and on a password sign-in: the session must carry a `privateStoreHandle`, so a bearer-token or share request cannot reach the door. Views render from `views/store-door.ejs` with `Cache-Control: no-store`.

What happens on `POST /stores/:kind` depends on the kind and on whether the user already has a key:

- an unencrypted kind: `commitStoreCopy()` writes `store.json` and redirects
- an encrypted kind, user KEK already unlocked in this session: the copy is created, its DEK put in the session bag, and the door shows `step: 'done'`
- an encrypted kind, keys on disk but not unlocked: the door says so and sends the user to sign in with their password
- an encrypted kind, no keys yet: the door re-verifies the password, creates the KEK in memory and shows the 12 recovery words

The password re-entry (`verifyDoorPassword()`) uses the same authentication, the same login throttle and the same failed-attempt audit record as the sign-in form, so the door is not a second place to guess a password.

### The recovery words

The words exist only while that screen is open. `holdWordsForConfirmation()` keeps the pending KEK, envelope and mnemonic in a process `Map` keyed by the session's private-store handle — never in express-session JSON, never in a record, never logged — with a 30-minute TTL. Abandon the flow and nothing was written.

`confirmWords()` decides what happens next:

- a match hands back the KEK and envelope to commit, and forgets the words
- a miss discards the words it showed, forever, and while attempts remain generates a fresh set for the same uncommitted KEK (`newRecoveryWords()`)
- out of attempts: everything is forgotten and nothing was ever created

`confirmAttempts()` is `1 + ngdpbase.stores.recovery.confirmretries`, so the shipped default is two attempts, each with its own new set of words.

### The commit

`commitStoreCopy()` writes `user-keys.json` first when this commit creates the user's KEK, then `store.json`. Both are written with the `wx` flag, so an existing file is a refusal rather than an overwrite — replacing a `store.json` would lose the wrapped DEK and with it every byte of the store. If the `store.json` write fails after a new key file was written, the key file is removed: a key never outlives the store it was made for.

`store.json` is a `StoreFileRecord` (`src/utils/privateStoreMeta.ts`): `kind`, `encrypt`, `created`, and `dekWrap` when sealed. Per-user state and key material only — never policy. A missing `store.json` reads as `encrypt: false`.

The `store-create` audit event (`AUDIT_EVENT.STORE_CREATE`) is recorded __before__ anything is created, and its emitter is configured `on-failure: refuse`, so a record that cannot be written stops the creation. Its metadata carries the store id, the `encrypt` flag and whether a key was created — never the words and never a key. Severity is `high` for a sealed store, `medium` otherwise.

---

## Encryption and keys

Implemented in `src/utils/privateStoreCrypto.ts`. Nothing here is a manager method, and nothing here touches HTTP.

- __User KEK__ — 32 random bytes. Wrapped twice with AES-256-GCM: once by a key derived from the login password with scrypt (`N: 16384, r: 8, p: 1`, 16-byte random salt), once by a key derived from a 12-word BIP39 English phrase. The envelope on disk is `{ version: 1, kdf, passwordWrap, recoveryKdf, recoveryWrap }`.
- __Recovery phrase__ — 128 bits of entropy plus a 4-bit checksum, rendered as 12 words from `src/utils/bip39English.ts`. The wrap key is the first 32 bytes of `pbkdf2(mnemonic, "mnemonic", 2048, 64, sha512)`. Comparison at the confirm screen is normalised (NFKD, lower case, single-spaced) and constant time.
- __Store DEK__ — 32 random bytes per encrypted store, wrapped by the user KEK and kept in that store's `store.json`. `createEncryptedStore()` makes it; `unwrapDek()` opens it.

A password change re-wraps the envelope's `passwordWrap` and leaves `recoveryWrap` untouched (`rewrapPassword()`), which is why the 12 words keep working after a password change. `UserManager.updateUser` calls `rewrapUserKeysOnPasswordChange()` on the way through, and no-ops when the user has no envelope.

### What is sealed, and how

A file in an encrypted store is written by `sealBytes()`: the ASCII magic `NGDPSEAL1`, a 12-byte IV, the 16-byte GCM tag, then the ciphertext. The magic lets a reader tell a sealed file from a plaintext one without trying the key (`isSealedBytes()`); the format is binary, so page text and attachment bytes share it.

`src/utils/privateStoreFiles.ts` is the one place that turns "the DEK encrypts every byte in this store" into file I/O. A caller asks for the store's `StoreFileIO` through its context and every read and write it then makes is ciphertext at rest exactly when the store is encrypted:

- `storeFileIO(ctx, { pagesDirectory, owner, store })` returns `PLAIN_FILE_IO` for an unencrypted store, and a sealed I/O when the store is encrypted and this context holds its DEK. An encrypted store whose DEK the context does not hold is __refused for reads as well as writes__, so a locked store never falls back to plaintext.
- `storeFileIOForPath()` does the same from a path, for callers that have a file rather than a store.
- `readStoreTextSync()` is the synchronous read a page lookup needs; a locked store reads as `null`, never in the clear.

Every file in a store goes through that I/O — the page files, their version blobs, the trash blobs, the attachments, and all five indexes. `store.json` is the one exception and cannot be sealed: it holds the wrapped DEK needed to open everything else.

Because encryption is per file rather than a container, anyone with disk or backup access can still see how many items a store holds, their sizes and their dates. Names disclose nothing — pages are `{uuid}.md`, files `{uuid}.ext`.

### The session key bag

`src/utils/privateStoreUnlock.ts` holds the unwrapped keys, in a process-level `Map` that is never persisted.

- The bag is keyed by an opaque random handle (`newPrivateStoreHandle()`, a UUID), __not__ by the session id. The handle is minted at password login, stored on the session as `privateStoreHandle`, and carried on the request subject.
- Each bag holds the owner's username, the KEK, a map of store id to DEK, and the legacy `user-index.json` catalog read once at unlock so its entries can be moved into each store's own page index.
- `dekFor(ctx, owner, store)` is the only way to a DEK. It reads the handle off the context and refuses unless the bag belongs to `owner`. A `JobContext`, a bearer-token request and a share visitor carry no handle, so they reach no keys.
- `hasUnlockedKey(ctx)` is a yes/no for callers that only need to know a key exists — every page render asks it, and none of them should be copying key bytes into a buffer.
- `unlockedStoreIdsFor(ctx)` names the requester's own unlocked encrypted stores. Ids only; no key bytes leave the bag.

There is no ambient slot. `AsyncLocalStorage` is refused outright, and `npm run lint:context` fails the build on it.

When the bag is filled and when it is dropped:

- __Password login__ (`WikiRoutes`): mint a handle, `unlockPrivateStoresWithPassword()` unwraps the KEK and every encrypted store's DEK, then `adoptSealedPages()` runs the owner-only work.
- __`POST /private-store/unlock`__: the same unlock after a server restart, which drops the bag while the session cookie survives. Reuses the session's handle if it has one, mints one if not.
- __Logout__ (`processLogout`): `lockPrivateStores(handle)` zeroes the KEK and every DEK and deletes the bag entry, and `dropPendingWords(handle)` zeroes any uncommitted door KEK — both before express-session JSON is gone.

`privateStoreLockedFor()` in `src/utils/privateStoreLock.ts` answers "is this signed-in user's store locked?" from the user's own key file and their own bag, never from any page: while locked the catalog is itself encrypted, so the server does not know which pages are in it and must not pretend to. `getCommonTemplateData` puts the answer in `privateStoreLocked`, and `views/header.ejs` shows the banner that links to `/private-store/unlock`. It is only ever true for a store's own owner in their own session.

### What only the owner's session can do

Three pieces of maintenance can only run where the keys are. `WikiRoutes.adoptSealedPages()` runs all of them after an unlock, as the owner:

- `PageManager.adoptUserPageCatalog(ctx)` — moves the legacy `user-index.json` entries into each store's own page index and deletes the file
- `PageManager.migratePrivateLinks(ctx, username)` — the `[store/Title]` migration
- `PageManager.buildMissingStoreSearchIndexes(ctx, username)` — a search index for any store that has none
- `PageManager.purgeExpiredOwnPrivateTrash(ctx)` — retention for that owner's sealed stores

The matching boot passes (`migratePrivateLinksAtBoot`, `buildStoreSearchIndexesAtBoot`, the provider's retention tick) run under a job context, which holds no key, so they reach the unencrypted stores only.

---

## Access

One function decides: `mayActInPrivateContainer(ctx, owner, opts)` in `src/utils/privateStoreAccess.ts`.

- a context acting `viaShare` passes only when `opts.storeShared === true` and the share's issuer is the owner
- otherwise the context must be a job acting for the owner, or an authenticated session (`isAuthenticated === true`) whose username is the owner

No role reaches in. An anonymous visitor never matches, even a page whose recorded owner is `Anonymous`. No caller passes `storeShared: true` today, so in the shipped code the answer is the owner and nobody else.

The `PolicyInformationPoint` applies it in two places:

- __Tier 0 of the page tiers__ (`walkPageTiers`). For a page it calls `PageManager.checkPrivatePageAccess(ctx, name)`, which parses the private page name and ends in `mayActInPrivateContainer`. A non-null answer wins immediately — no later tier can grant what Tier 0 denied, and frontmatter `audience` grants nothing on a private page.
- __`canAccessPrivateContainer(userContext, owner, resource, action)`__ for something that is not a page — a file in a store. The same rule, and a refusal is recorded through `logAccessDecision` as `private_deny`.

`canUserAccessPage()` carries no role lookup into Tier 0 by design: [#1219](https://github.com/jwilleke/ngdpbase/issues/1219) once gave admins a private-page bypass, and it no longer does. It does forward the caller's context to `getPageMetadata`, because a page in an encrypted store resolves only through its owner's unlocked session — without the context the check could not see a sealed page at all and refused its owner ([#1422](https://github.com/jwilleke/ngdpbase/issues/1422)).

### What an administrator can and cannot see

An administrator has no read, list, search, edit or upload access to another user's container, encrypted or not. Concretely:

- no private page is in `page-index.json`, the shared search index, the link graph or the parse cache, so `/admin/deleted-pages`, site search and page lists have nothing to show
- no private file is in `attachment-metadata.json`
- `mayActInPrivateContainer` refuses every non-owner, so a direct URL is refused too
- for an encrypted store there is no key an administrator could hold: the KEK is wrapped by the owner's password and their 12 words

Private page titles are kept out of logs and audit records by `src/utils/redactPrivateNames.ts`: a name in any of its three forms (plain, URL path, URL-encoded) keeps its owner and store and loses its title, so a line stays diagnosable without saying which page. Code that knows a page is private logs its uuid instead.

### Why a refusal is 404, not 403

`privatePageRoute()` renders the same 404 — "The page does not exist." — for a name that does not parse and for a name this reader may not open, with no echo of the path asked for. A 403 would confirm that the page exists, which is exactly the fact the container is protecting. `publicPageRoute()` funnels a private page name handed to a public route through the same gate, so an old link gets the same answer.

---

## Pages

A private page's name __is__ its path: `private/{owner}/{store}/{title}`, the same string as its URL without the leading slash. Wherever the system passes a page name — `getPage(name, ctx)`, a context's `pageName`, a cache key, a log line — a private page is named this way, and a plain title always means a public page. Titles never contain `/` ([#1455](https://github.com/jwilleke/ngdpbase/issues/1455)), so the three parts are unambiguous. `formatPrivatePageName()` and `parsePrivatePageName()` are the only converters.

`src/utils/pageUrl.ts` turns a name into a URL, so routes, views and redirects agree: `pageUrl('private/jim/default/Diary', 'edit')` is `/private/jim/default/Diary/edit`.

The routes, each behind `privatePageRoute()`:

| Method and path | Action |
|---|---|
| `GET /private/:owner/:store/:title` | view |
| `GET /private/:owner/:store/:title/edit` | edit |
| `POST /private/:owner/:store/:title/save` | save |
| `POST /private/:owner/:store/:title/delete` | delete |
| `GET /private/:owner/:store/:title/history` | history |
| `GET /private/:owner/:store/:title/diff` | diff |

`/view/…` serves public pages only. As the last step before a 404 it asks `ownPrivatePageNamed()` whether the requester has a private page of that title, and 302s there if so — the stores are consulted in name order, byte-exact first and then case-insensitively. It is a 302 rather than the 301 used for former titles because the answer depends on who is asking.

### Titles and slugs

A private title is unique __within its store__; a public title is unique among public pages. `FileSystemProvider.savePage` reads the destination store's own page index and refuses a clash with "A page with this title is already in use in this store" — a message that names no title, because it reaches the logs.

A private page's slug is `private--{owner}-{store}-{title-slug}`, made by `ValidationManager.generatePrivateSlug` and suffixed `-2`, `-3`… against the owner's own readable stores only (`privateSlugFor`). A locked store is not readable and not consulted, and nothing about another user is ever read.

### The page door

Every page write goes through `PageManager.savePage` — validation, metadata normalisation, conflict checks, the provider write, the shared-index reconciliation and the audit record. `npm run lint:page-door` fails the build on a caller that reaches past it.

The door refuses a name under the private prefix that does not read as `private/{owner}/{store}/{title}`, and on a rename it names the renamed page by its new path rather than its bare title.

`PageManager.reconcileSharedIndexes` skips every private name: `isSharedIndexable(identifier)` is false for a private name and for anything the anonymous subject cannot resolve, and the link graph, the shared search index, attachment mentions and page assets all consult it. The parse cache asks the same question ([#1423](https://github.com/jwilleke/ngdpbase/issues/1423)): a sealed page's HTML would otherwise stay in a process-wide map after its owner logged out.

### The Private box

`FileSystemProvider.privatePlacement()` decides where a save lands:

- a page is private when the save says `private: true`, or when the name is a private name and the save did not say `private: false`
- the owner is the name's owner, else the save's `author`; a private page with no owner is refused
- the store is the one named by the page's name or the save, else the store the page is in now (found by uuid among the owner's stores), else `defaultstoreid`

So ticking the Private box on a public page moves it into the author's default store, and unticking it on a private page moves it back out to the public space. `BasePageProvider.resolvePrivatePageStore()` refuses a save that names a different store for a page that already lives in one: moving a page between stores is not supported, and for an encrypted store it would mean re-encrypting under another DEK.

The store is never written into frontmatter — the path records it, and a copy could disagree with where the file is. `private: true` is written only on a private page.

Before any private byte is written, `BasePageProvider.assertPrivateStoreWritable()` calls `assertContextCanWriteStore()`, which refuses a write into an encrypted store the context holds no DEK for.

---

## Links

`[store/Title]` is a link to a page in a store; `[Title]` is always a public page. `parsePrivateLinkTarget()` accepts only a first segment that is a valid store id and a title with no further `/`, so `Docs/Setup` is not a private link.

The target names no user. The owner comes from `readPageOwner()` in `src/parsers/dom/handlers/DOMLinkHandler.ts`, in this order: what the render was told (`pageOwner`, resolved by `RenderingManager`), else the owner in the page's own private name, else the page's frontmatter `author`. So a link written on a private page resolves in that page's owner's stores, and a link written on a public page resolves in its author's.

### Why the colour differs

- On a __public__ page a private link renders identically for every reader: one class, one href, no existence lookup. That page's HTML is cached and shared by role, so a per-reader appearance would tell one reader whether another's page exists. `/private/…` already answers 404 to anyone who may not open it.
- On a __private__ page nothing is cached for anyone — `isSharedIndexable` is false for every private name — and only the owner or a delegate is there at all, so the link says what it found. A title that is not in the store renders red and points at its editor, which is how the owner creates it.

`MarkupParser.parseWithDOMExtraction` resolves that answer once per parse, and only while a private page is being rendered: `resolvePrivateLinkTitles()` cheap-tests the content with `mayContainPrivateLink()` and then asks `PageManager.readablePrivateTitles(owner, reader)`, which returns the titles the reader can see in that owner's stores, by store id, folded to lower case. A store the reader cannot open is __absent__ from the map rather than empty, and its links stay neutral. With no reader, no page manager, or a lookup that throws there is no answer at all, and nothing claims a page is missing.

### The one-time migration

Private pages written before the syntax existed used `[Diary]`, which resolves against the public name list. `rewriteToPrivateLinks()` in `src/utils/privateLinkRewrite.ts` rewrites those to `[store/Title]`, and only those:

- only a target naming a page in the __same__ store as the page the link sits in
- never a title that store does not have — a link to a public page stays a link to a public page
- never a target that already parses as a private link, which is what makes a second run write nothing

It is the text half only: pure, synchronous, no I/O, handing a resolver to the same `rewriteLinkTargetsBy()` the rename rewrite uses, so the bracket forms, the checkbox case and the `#fragment` handling cannot drift between the two. `PageManager.migratePrivateLinks()` supplies the pages and writes the results through the page door.

Each store records that it has been migrated in its own `migrations.json` (`src/utils/privateStoreMigrations.ts`, migration id `private-links`), read and written through the store's own I/O so a sealed store's record is ciphertext like everything else in it. The record holds only which migrations ran and when — no page, title or count. A store with no record, or one that cannot be read, is migrated again, which is safe because the rewrite is idempotent.

Where it runs from is dictated by the keys: `migratePrivateLinksAtBoot()` covers the unencrypted stores under the system principal, and a sealed store migrates at its owner's next unlock. One store's failure never stops the others, and a page that refuses its own content does not stop its store.

---

## Search

A private page is in no shared index, so each store keeps its own saved search index: `{store}/search-index.json`, written through the store's own I/O and therefore sealed exactly when the store is.

`src/utils/storeSearchIndex.ts` holds the shape and the matching rule and nothing else — no I/O, no config, no access decision. A `StoreSearchDocument` carries `uuid`, `title`, `text`, `tags`, `category` and `lastModified`, read from the same frontmatter fields the shared index reads (`tags`, `user-keywords`, `system-category`), so a private page and a public one are found by the same words. The index is saved rather than built at search time: a search reads one small file per store and never opens a page file.

- `PageManager.reconcileStoreSearch()` updates it after every private save, rename and delete, from the same reconciliation step every save runs. A page that left a store — deleted, renamed across stores, or moved to the public space — has its document removed from the store it was in.
- `PageManager.rebuildStoreSearchIndex()` rebuilds one store's index from its pages; `buildMissingStoreSearchIndexes()` gives an index to every readable store that has none, so a store whose index was lost gets it back at the next boot or unlock and a store that has one costs nothing.
- `PageManager.searchOwnPrivatePages(ctx, query)` reads only the requester's own container, guarded by `mayActInPrivateContainer`, and only the stores that context can open. A locked store yields no matches rather than an error. Each match carries the page's private name.

`SearchManager.mergeOwnPrivateResults()` appends those rows to the public results, sorts the combined list by score and applies `maxResults`. A private row is flagged `isPrivate: true` and carries the private name, so `pageUrl` links to `/private/…`. Another user's search, and an administrator's, reach none of it — the merge asks the page door for the __requester's own__ stores and never for anyone else's.

---

## Trash and retention

A private page is deleted, restored and purged in its own store. Its tombstone lives in `{store}/deleted-index.json` with the blob in `{store}/deleted/{uuid}.md`, and never enters `page-index.json` — which is why `/admin/deleted-pages` cannot show one even by mistake.

`/my/trash` is its own surface beside `/my/private` and `/my/edits`, not a second meaning for the admin trash. All three routes ask `profile-manage`, and none of them ever takes a username from the request:

| Route | Manager call |
|---|---|
| `GET /my/trash` | `PageManager.listOwnDeletedPrivatePages(ctx)` |
| `POST /my/trash/restore` | `PageManager.restoreOwnPrivatePage(ctx, store, uuid)` |
| `POST /my/trash/purge` | `PageManager.purgeOwnPrivatePage(ctx, store, uuid)` |

Each applies the page gate's own container rule before touching a store, and a sealed store that is still locked contributes nothing — "nothing yet" is the honest answer to give before an unlock.

A restore moves the file and its history back and restores the store's page-index entry, then rebuilds that page's search document through the same reconciliation a save runs, so no index is left behind. A title that has been taken in the meantime comes back as `title-conflict` with the title named, for the owner to resolve; nothing is renamed on their behalf.

Retention is the site-wide `ngdpbase.page.delete.retentiondays` (default 30; `0` means keep forever, and `/my/trash` then shows no purge date because it would be a promise the site does not keep). `VersioningFileProvider.purgeExpiredStoreTrash()` removes tombstones past the window, and the split follows the keys:

- the boot run and the hourly tick run under a job context, which holds no key, so they reach the __unencrypted__ stores only
- a __sealed__ store's trash expires in its owner's own session, in `adoptSealedPages()` after an unlock — the one moment anything can open it at all

Each purge is audited as a `page-delete` / `purge` event naming the uuid, owner and store — never the title.

---

## Files

Every non-page file in a store lives in `{store}/attachments/{uuid}.ext` and is listed in that store's own `files-index.json`. Never the store root: an uploaded `.md` there would scan as a page, and `isPrivateStoreAttachmentsRel()` is depth-checked so a user or store that happens to be called `attachments` is not skipped.

`AttachmentManager.uploadAttachment` is the one door that decides a destination:

- an upload onto a private page is always private, into that page's author's store — an unticked box does not make it public
- an upload with no page, or onto a public page, follows the dialog's Private checkbox; ticked, it goes to the uploader's store (`options.store`, else `defaultstoreid`)
- `BasicAttachmentProvider.storeAttachment` __refuses__ a private destination outright, so a private file cannot end up in the shared pool with its original name in `attachment-metadata.json`

The condition for a store's own catalogue is "this page is in a private store", not "the store is sealed": encryption decides whether the bytes are ciphertext at rest, not who owns the catalogue.

`BasicAttachmentProvider.storeFileInStore()` writes the bytes through the store's `StoreFileIO` and keeps a SHA-256 `fingerprint` in the store's index. Duplicate detection is __per store__: an upload whose fingerprint is already in that store returns the existing entry and adds the page to its `mentions`. It never matches another store and never the public pool, which also fixes a private upload silently returning the public copy of identical bytes.

Reading back, `AttachmentManager.ownPrivateStores()` applies the container rule first, then lists every store in that container from the folder (`privateStoreIdsOf` — which stores exist is a question about a folder, not about keys), and opens each through `storeFileIO`, skipping the encrypted ones it holds no DEK for rather than reading them in the clear. `findOwnStoreFile()` asks the PIP again, per file, before anything is handed back, so ownership is checked before a store is opened and again before a byte leaves. A store file is presented to templates through `storeFileMetadata()`, which carries the legacy aliases but never `filePath`.

---

## Takeout and backup

Two ways out, which differ in kind ([#1387](https://github.com/jwilleke/ngdpbase/issues/1387)):

- __Instance backup__ (admin, a job). Private files ride in the backup document as base64, bytes as on disk: ciphertext stays ciphertext, `user-keys.json` travels, and no administrator becomes a keyholder. Restore writes them back as bytes.
- __Takeout__ (the owner, `GET`/`POST /my/takeout`). `PageManager.buildOwnStoreTakeout` → `buildStoreTakeout` in `src/utils/privateStoreExport.ts`, packed by `src/utils/zipArchive.ts`. Decrypted, built in memory, never staged on disk; a locked store is refused, never exported empty.

A takeout holds, under one `{store}/` folder:

- each page as `{title}.md` with its full frontmatter, uuid included
- each file under `attachments/` by the name it was uploaded with
- `files-index.json` — the store's file index, decrypted, holding only the files in the archive, each record's `fileName` rewritten to its path in the archive. It is kept because it is the only record of a file's id, which is what `/attachments/{id}` on a page names; without it a takeout's links point at nothing (operator, 2026-09-25)

It carries no `versions/`, `deleted/`, `pages-index.json`, `search-index.json`, `deleted-index.json`, `migrations.json`, `store.json` or `user-keys.json`. A takeout is a copy you can read, not a restore.

### Importing a takeout

`POST /my/takeout/import` ([#1472](https://github.com/jwilleke/ngdpbase/issues/1472)) takes a takeout back into one of the requester's own stores, on this instance or another. The door is `ImportManager.importOwnStoreTakeout`; `src/utils/privateStoreImport.ts` reads the takeout and `readZip` in `src/utils/zipArchive.ts` unpacks it, both in memory. Not `importPages`: that reads a server-side directory and converts every page.

- Refused before any write when the store is not the requester's, does not exist (the default store always does), or is encrypted and locked in this session.
- Files first, through `AttachmentManager.uploadAttachment` into the store; `/attachments/{oldId}` links in the pages are pointed at the ids the store holds, using `files-index.json`.
- Pages through `PageManager.savePage`, uuid kept, so a sealed store encrypts on write.
- Idempotent: a uuid already in the store is skipped (`unchanged`, or `changed-since-takeout` when the body differs — the live page wins); a uuid used elsewhere on the site is skipped as `uuid-elsewhere`, naming the page only when the requester may view it; a title held by a different page lands beside it as `Title (imported)`.
- Every file comes in, even one whose pages were skipped; files no page now in the store links to are named in the importer's report and counted (never named) in the log and audit record (operator, 2026-09-25).
- Capped by `ngdpbase.stores.import.maxsize` (256 MB), which bounds both the upload and what it unpacks to. Audited as `store-import`, with counts only.

It brings back pages and files, never history or trash.

---

## Not built

One thing in this area does not exist. Nothing in the code implements it, and it should not be described to users as available.

- __Sharing a store through a token__ ([#1388](https://github.com/jwilleke/ngdpbase/issues/1388)). There is no per-store Share switch. `mayActInPrivateContainer` has the branch a share would use — it requires `opts.storeShared === true` and a share issued by the owner — and no caller passes it, so every store is closed to delegates and only the owner acts in one. A delegate would also need a wrapped store DEK, and nothing wraps one for a share.

---

## How to verify

Two guards run in `npm run lint`, `npm run lint:ci` and the pre-commit hook, and both exist because nothing in the type system makes these mistakes a compile error.

`npm run lint:page-door` (`scripts/check-page-door.ts`) refuses:

- a call to `provider.savePage`, `deletePage`, `restoreDeletedPage`, `restoreStorePage`, `purgeStorePage` or `purgeExpiredStoreTrash` from anywhere but `PageManager` and the providers that implement them — a write that skips the door gets no validation, no audit and no index work, and a restore that skips it leaves the store's search index behind
- a write to a shared index (the link graph, the search index, attachment mentions, page assets) from anywhere but the manager that owns it and the page door
- a route writing a page's bytes with `fs` / `fs-extra`
- a second copy of the title character rule, which belongs in `utils/pageTitleRule.ts`

`npm run lint:context` (`scripts/check-context-discipline.ts`) refuses:

- `AsyncLocalStorage` or `node:async_hooks` anywhere in `src/` or `addons/` — with an ambient slot the call site stops showing what identity it runs under, which is the whole basis of `dekFor`
- an optional identity parameter (`ctx?: ActorContext` and friends) — mandatory and positional, or it is not a door
- a discarded one (`_ctx: ActorContext`)
- a `UserContext` interface that restates `PermissionSubject`'s fields instead of extending it — that is how `WikiContext`'s copy lost `privateStoreHandle` without failing to compile

A site that genuinely is none of these says so at the line with `page-door-ignore: <why>`; each context allowlist entry states why that site is not the defect, and a stale entry fails the run.

The behaviour itself is covered by suites named for what they hold, which are the fastest way to see a rule in action: `src/utils/__tests__/privateStore*.test.ts`, `src/providers/__tests__/{FileSystemProvider,VersioningFileProvider,BasicAttachmentProvider}*privateStore*`, `src/managers/__tests__/{PageManager,AttachmentManager,SearchManager}*private*` and `src/routes/__tests__/WikiRoutes.{storeDoor,privatePageAccess,privateStoreUnlock,privateStoreSession,myTrash}.test.ts`.
