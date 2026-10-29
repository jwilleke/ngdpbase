---
name: Private stores
description: Developer and operator reference for private stores — layout, kinds, keys, access, pages, links, search, trash and files
dateModified: 2026-10-25
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
private/{user}/{store}/footnotes/{uuid}.json   a page's footnotes
private/{user}/{store}/comments/{uuid}/        a page's comments, one {id}.json each
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
| `footnotesDir` | `ngdpbase.page.provider.filesystem.footnotesdir` | `footnotes` |
| `commentsDir` | `ngdpbase.page.provider.filesystem.commentsdir` | `comments` |
| `files.userkeys` | `ngdpbase.page.provider.filesystem.private.files.userkeys` | `user-keys.json` |
| `files.userindex` | `ngdpbase.page.provider.filesystem.private.files.userindex` | `user-index.json` |
| `files.storemeta` | `ngdpbase.page.provider.filesystem.private.files.storemeta` | `store.json` |
| `files.storepages` | `ngdpbase.page.provider.filesystem.private.files.storepages` | `pages-index.json` |
| `files.storefiles` | `ngdpbase.page.provider.filesystem.private.files.storefiles` | `files-index.json` |
| `files.storesearch` | `ngdpbase.page.provider.filesystem.private.files.storesearch` | `search-index.json` |
| `files.storedeleted` | `ngdpbase.page.provider.filesystem.private.files.storedeleted` | `deleted-index.json` |
| `files.storemigrations` | `ngdpbase.page.provider.filesystem.private.files.storemigrations` | `migrations.json` |

Every path is joined by a helper in the same module — `privateStoreRoot`, `privatePageFilePath`, `privateVersionDirectory`, `privateDeletedDirectory`, `privateStoreAttachmentsDir`, `privateStoreNotesDir`, `storeMetaPath`, `storePageIndexPath`, `storeFileIndexPath`, `storeSearchIndexPath`, `storeDeletedIndexPath`, `storeMigrationsPath` — and every join validates its segments. A store id must be a plain lowercase slug (`[a-z0-9]+(-[a-z0-9]+)*`, `assertStoreId`); a user name must be exactly one path segment (`assertPathSegment`). Neither can be a path, so neither can leave the container.

`pathContainsPrivateRoot()` measures from the pages directory rather than searching the absolute path for `/private/`, which on macOS matched every page under `/private/var`.

---

## Store kinds and the door

A __store kind__ (a vault kind) is instance-wide; a user's directory under it is that user's container. Since [#1505](https://github.com/jwilleke/ngdpbase/issues/1505) a kind is a __system-category entry that declares a vault__, `storageLocation.privatestore` (see [system-category.md](system-category.md)); `ngdpbase.stores.{kind}` no longer defines kinds and nothing reads it. `storeKindFromConfig()` in `src/utils/privateStoreDoor.ts` returns, for a vault id:

- `id` — the vault id, the last folder of the entry's `privatestore` (`general` → `default`, `journal` → `journal`, `capture` → `capture`);
- `encrypt` — the entry's `encrypt`, read strictly as a boolean (the string `"true"` is not a switch);
- `owner` — the entry's `owner`, `admin` when absent.

`owner` is `admin` for the site's own system-categories, or the slug of the add-on that declared one. The owner decides `encrypt` (operator, 2026-09-29) and its declaration stands: a health-record add-on that declares its vault `encrypt: true` keeps it sealed. The end user is never asked, and the value is copied into that user's `store.json` when their copy is created, so changing the entry later does not reinterpret copies that already exist.

Add-ons no longer declare kinds in `package.json` `ngdpbase.stores` (removed in #1505, unused by any add-on); an add-on declares its own system-category instead ([#1507](https://github.com/jwilleke/ngdpbase/issues/1507)). What remains under `ngdpbase.stores.*` are two settings that are not about any one vault: `recovery.confirmretries` (per user) and `import.maxsize` (per site).

`storeDoorState` (a pure function in `src/utils/privateStoreDoor.ts`) says whether a kind's door is open: always for the site's own, only while the owning add-on is loaded for an add-on's.

### The door

A user's copy of a kind is created when they walk through its door — never at login, never mid-save. The routes are in `src/routes/WikiRoutes.ts`:

| Route | What it does |
|---|---|
| `GET /stores/:kind` | The door. `step: 'ready'` when the user already has a copy, otherwise `intro-plain` or `intro-sealed` |
| `POST /stores/:kind` | Walk through. Creates at once, or shows the words screen |
| `GET /stores/:kind/confirm` | Type the words back. Never shows them |
| `POST /stores/:kind/confirm` | The last gate: a match commits, a miss shows a new set |

An addon's kind is served only while that addon is loaded (`AddonsManager.storeOwnerState`, `storeDoorState`). Failed to load, turned off, or not installed, every door route answers `503` with `step: 'closed'` and the reason, and creates nothing. Nothing is removed in any state, and turning the addon back on reopens the store with every user's keys as they were. Turning it off is warned, never refused: `AddonsManager.storeDisableWarnings` counts the users holding a copy of each kind it owns, for the Disable confirmation and the success message.

`GET /admin/stores` (admin view access) lists every kind: owner, whether copies are encrypted, whether its door is open and, if not, why, and how many users hold a copy (`countStoreCopies`). Counts only, never a user's name or anything inside a store. Defining a kind from the admin interface is not built; a site-owned kind is still two configuration keys.

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

The confirm step also asks "I've saved my recovery words and understand they are the only way back" ([#1928](https://github.com/jwilleke/ngdpbase/issues/1928), `views/_recovery-words-consent.ejs`). `POST /stores/:kind/confirm` refuses to finish without the tick, or when the wording's version changed since the form was shown (`WikiRoutes.recoveryWordsSaved`), before the words are checked, so they stay pending and nothing is written. After the commit it is recorded as a consent (`ConsentManager`, scope `recovery-words`, `how: store-door`), bound to the new set of words by `recoveryWordsId(envelope)` (a digest of the recovery wrap: a password change keeps it, a new set of words changes it). A record that cannot be written never undoes the vault; the reminder banner asks instead ([ConsentManager.md](managers/ConsentManager.md#the-recovery-words)).

### The commit

`commitStoreCopy()` writes `user-keys.json` first when this commit creates the user's KEK, then `store.json`. Both are written with the `wx` flag, so an existing file is a refusal rather than an overwrite — replacing a `store.json` would lose the wrapped DEK and with it every byte of the store. If the `store.json` write fails after a new key file was written, the key file is removed: a key never outlives the store it was made for.

`store.json` is a `StoreFileRecord` (`src/utils/privateStoreMeta.ts`): `kind`, `encrypt`, `created`, and `dekWrap` when sealed. Per-user state and key material only — never policy. A missing `store.json` reads as `encrypt: false`, but that alone never decides that a vault is plain: see "The kind is asked as well as `store.json`" below.

The `store-create` audit event (`AUDIT_EVENT.STORE_CREATE`) is recorded __before__ anything is created, and its emitter is configured `on-failure: refuse`, so a record that cannot be written stops the creation. Its metadata carries the store id, the `encrypt` flag and whether a key was created — never the words and never a key. Severity is `high` for a sealed store, `medium` otherwise.

---

## Encryption and keys

Implemented in `src/utils/privateStoreCrypto.ts`. Nothing here is a manager method, and nothing here touches HTTP.

- __User KEK__ — 32 random bytes. Wrapped twice with AES-256-GCM: once by a key derived from the login password with scrypt (`N: 16384, r: 8, p: 1`, 16-byte random salt), once by a key derived from a 12-word BIP39 English phrase. The envelope on disk is `{ version: 1, kdf, passwordWrap, recoveryKdf, recoveryWrap, personKey }`.
- __Recovery phrase__ — 128 bits of entropy plus a 4-bit checksum, rendered as 12 words from `src/utils/bip39English.ts`. The wrap key is the first 32 bytes of `pbkdf2(mnemonic, "mnemonic", 2048, 64, sha512)`. Comparison at the confirm screen is normalised (NFKD, lower case, single-spaced) and constant time.
- __Store DEK__ — 32 random bytes per encrypted store, wrapped by the user KEK and kept in that store's `store.json`. `createEncryptedStore()` makes it; `unwrapDek()` opens it.
- __User key pair__ ([#1762](https://github.com/jwilleke/ngdpbase/issues/1762) slice 5) — an ECDH P-256 pair, `personKey: { publicKey, privateWrap }`: the public half readable, the private half wrapped by the user KEK. It is the share lockbox's pair (`shareLockbox.ts`), so a copy sealed to it uses the same ECDH + HKDF-SHA-256 + AES-256-GCM steps. `createUserKeys()` makes it at enrolment; a user enrolled earlier gets one the first time their store is unlocked (`unlockWithKek` writes it back, every wrap of the KEK unchanged). It lets the owner of a store hand a proxy a copy of their KEK while the proxy is offline.

A password change re-wraps the envelope's `passwordWrap` and leaves `recoveryWrap` untouched (`rewrapPassword()`), which is why the 12 words keep working after a password change. The KEK itself never changes, so the user key pair (`personKey`) and every proxy key copy of that KEK stay valid too. `UserManager.updateUser` calls `rewrapUserKeysOnPasswordChange()` on the way through, and no-ops when the user has no envelope.

### What is sealed, and how

A file in an encrypted store is written by `sealBytes()`: the ASCII magic `NGDPSEAL1`, a 12-byte IV, the 16-byte GCM tag, then the ciphertext. The magic lets a reader tell a sealed file from a plaintext one without trying the key (`isSealedBytes()`); the format is binary, so page text and attachment bytes share it.

`src/utils/privateStoreFiles.ts` is the one place that turns "the DEK encrypts every byte in this store" into file I/O. A caller asks for the store's `StoreFileIO` through its context and every read and write it then makes is ciphertext at rest exactly when the store is encrypted:

- `storeFileIO(ctx, { pagesDirectory, owner, store, layout })` returns `PLAIN_FILE_IO` for an unencrypted store, and a sealed I/O when the store is encrypted and this context holds its DEK. An encrypted store whose DEK the context does not hold is __refused for reads as well as writes__, so a locked store never falls back to plaintext.
- `storeFileIOForPath()` does the same from a path, for callers that have a file rather than a store.
- `readStoreTextSync()` is the synchronous read a page lookup needs; a locked store reads as `null`, never in the clear.

### The kind is asked as well as `store.json`

Whether a vault is sealed is asked of both its kind (the system-category's `encrypt`) and its copy (`store.json`) ([#1834](https://github.com/jwilleke/ngdpbase/issues/1834)). The configured layout (`privateStoreLayoutFromConfig`) carries the sealed kinds as `sealedVaults`, and `storeFileIO`, `storeFileIOForPath`, `readStoreTextSync` and `assertContextCanWriteStore` all take that layout as a required argument, so no caller can ask without the kind. `readVaultSealState` in `src/utils/privateStoreMeta.ts` gives the answer:

| Kind | `store.json` | State | Reads and writes |
| --- | --- | --- | --- |
| not sealed | none, or `encrypt: false` | `plain` | plain, as before |
| any | `encrypt: true` | `sealed` | sealed with the DEK; refused without it |
| sealed | none | `unopened` | refused (`SealedVaultRefusedError`): the owner opens the vault door first, which creates the sealed copy |
| sealed | `encrypt: false` or unreadable | `mismatch` | refused, logged as an error |

A refused write writes nothing: no page, no `pages-index.json`, no `search-index.json`. A save is refused rather than routed through the door, because the door creates a copy only when the user walks through it, never mid-save; the editor answers 409 with "open it at `/stores/{kind}` first. Nothing was saved." A refused read is answered as a locked store's is — nothing — so plaintext left in a sealed kind's vault is never served as if it were sealed (`readStoreTextSync` logs it once per vault).

At startup `PageManager` looks for vaults of a sealed kind that hold files in the clear (`findUnsealedVaults`: a folder with files but no `store.json`, or a `store.json` that is not sealed) and reports each by owner and vault: an error in the log, the degraded-subsystem banner and a system notification. Nothing is moved, sealed or deleted; an administrator decides what to do with the files, and the owner then opens the vault. The legacy private-attachment migration, the boot listing of plain stores' pages (`indexPlainStorePages`) and `ShareManager.isEncryptedVault` treat a sealed kind's vault as sealed too.

Every file in a store goes through that I/O — the page files, their version blobs, the trash blobs, the attachments, its pages' footnotes and comments, and all five indexes. `store.json` is the one exception and cannot be sealed: it holds the wrapped DEK needed to open everything else.

### Moving bytes into or out of a vault

Bytes that change place go through both sides' I/O too, never a bare `fs.move` ([#1836](https://github.com/jwilleke/ngdpbase/issues/1836)):

- __History__ (`VersioningFileProvider` when a page changes place, between the public area and a vault, or between vaults): both I/Os are resolved first, so a vault that refuses (locked, or a sealed kind that hasn't been opened) refuses the whole save, before the page or its history moves. `moveStoreFolder()` reads each file as its source stores it and writes it as its destination does: sealed with the new vault's DEK going in, opened coming out, re-sealed between two sealed vaults. Two plain sides are still a rename. The copy is staged beside the destination and renamed into place when it's complete; the source is removed last.
- __Footnotes and comments__ ([#1839](https://github.com/jwilleke/ngdpbase/issues/1839)): when a page changes place, the page door (`PageManager.reconcileSharedIndexes`) moves them after the page, with `movePageNotes()` in `src/utils/pageNotes.ts`: a page's footnotes file through `moveStoreFile()`, its comment folder through `moveStoreFolder()`, read as the source stores them and written as the destination does. A rename in place moves nothing. A move that fails is logged as an error, and the startup check below then names what was left outside.
- __A page's files__ ([#1842](https://github.com/jwilleke/ngdpbase/issues/1842)): when a page changes place, the page door (`PageManager.reconcileSharedIndexes`) moves the files it uses after the page, with `AttachmentManager.movePageAttachments()`. Details under [Files](#files).
- __Adopted attachments__ (`BasicAttachmentProvider.adoptRecordIntoStore`): into a sealed store, the shared pool's bytes are written through the location's I/O and the shared copy removed. Bytes already in a sealed store's folder in the clear are sealed where they are. The boot migration still skips sealed stores, since it holds no key.
- __Paths with no key__ only write bytes that are already sealed into a vault that `vaultMustBeSealed()` says is sealed (its kind, or its `store.json`, or an unreadable `store.json`), and refuse anything else. These are the backup restore (`FileSystemProvider.restore`), the legacy page and history migrations, and putting back a pre-#1456 public tombstone whose `deletedFrom` is in a vault. A restore decides per vault before it writes anything: the kind, the `store.json` on disk, or the one in the backup. Into a sealed vault it writes only sealed files and a sealed `store.json`. A backup's `store.json` that isn't sealed never replaces a sealed one, because that would lose the wrapped DEK. Skipped files are counted in one error line.
- __Required-pages sync ids__ (`adminSyncRequiredPages`) must each be one path segment, because each one becomes `{id}.md` or `versions/{id}`. Otherwise the request is refused with 400 before anything is written.

At startup `findPlaintextInSealedVaults` checks every sealed vault (sealed `store.json`) for files whose first bytes aren't the `sealBytes` magic, leaving out `store.json` and empty files. It reports each vault with its owner, the file count and the folders (`versions`, `attachments`, `.` for the root), using the same log error, banner and notification as `findUnsealedVaults`. Nothing is read beyond each file's first 64 bytes, and nothing is moved, sealed or deleted.

### Footnotes and comments

A vault page's footnotes and comments are kept in its vault ([#1839](https://github.com/jwilleke/ngdpbase/issues/1839), operator 2026-10-16): `{store}/footnotes/{uuid}.json` and `{store}/comments/{uuid}/{id}.json`, read and written through the vault's store I/O. They are sealed exactly when its pages are, a locked vault refuses them for reads as well as writes, and a sealed kind's vault that hasn't been opened refuses them with `SealedVaultRefusedError`, as it refuses a save. A public page's stay where they were, in `ngdpbase.footnotes.storagedir` and `ngdpbase.comments.storagedir`.

`src/utils/pageNotes.ts` holds the rule. Where a page's notes are is decided by the page's __name__ (`pageNotesPath`): a vault page is in no shared index, so its uuid alone says nothing about where it is. `FootnoteManager` and `CommentManager` take the page as `{ name, uuid }` and the caller's context on every call.

Who may read them is who may read the page. The routes (`/api/footnotes/:uuid…`, `/api/comments/:uuid…`) take the page's name as `?page=`, read the page as the requester (`PageManager.readPage`), require it to be the page the uuid names, and answer 404 otherwise; adding, editing and deleting a footnote also asks the editor's write door. Until #1839 the read routes and the comment routes asked nothing about the page, so anyone who knew a uuid could read a private page's comments and footnotes. The plugins render only inside a page view, which has already been decided, and render nothing when the vault can't be opened.

At startup, `FootnoteManager` and `CommentManager` each look for vault pages whose notes are still in their public folder (`findVaultPageNotesOutside`): written there in the clear before #1839. A vault page is known by its file name, `{uuid}.md`, live or in `deleted/`, so the check needs no key and reads no page. Each one is reported by owner, vault and page uuid, never title: an error in the log, the manager's degraded state (the subsystem banner) and a system notification. The check itself moves, seals and deletes nothing, and those files are no longer shown on the page; "Move into vault" moves them in ([Repairing what earlier moves left outside](#repairing-what-earlier-moves-left-outside), #1842).

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
- __`POST /private-store/unlock`__: the same unlock after a server restart, which drops the bag while the session cookie survives. Reuses the session's handle if it has one, mints one if not (kept only once an unlock succeeds). Takes either the password or, as `words`, the 12 recovery words ([#1453](https://github.com/jwilleke/ngdpbase/issues/1453)): `unlockPrivateStoresWithMnemonic()` unwraps the same KEK through the envelope's recovery wrap, and both paths share `unlockWithKek()` for everything after. Both ask the sign-in throttle first and record a failure the same way (`secretCheckBlocked`, `recordFailedSecret`); the words are never logged or recorded.
- __`POST /recover-password`__ ([#1452](https://github.com/jwilleke/ngdpbase/issues/1452)): a forgotten password, reset with the 12 words. Open to anyone, like the sign-in form. `UserManager.resetPasswordWithRecoveryWords` refuses an unknown, inactive or external account; `resetPasswordWrapWithMnemonic()` unwraps the KEK with the words and replaces only the password wrap (`rewrapPasswordWithKek` — the KEK and the recovery wrap are unchanged, so every store's DEK wrap stays valid); then `updateUser` sets the sign-in password, which records the change. Every failure gets one answer, counts against the sign-in throttle, and a throttled caller is refused even with the right words. Nothing is unlocked: the user signs in with the new password afterwards.
- __Logout__ (`processLogout`): `lockPrivateStores(handle)` zeroes the KEK and every DEK and deletes the bag entry, and `dropPendingWords(handle)` zeroes any uncommitted door KEK — both before express-session JSON is gone.

`privateStoreLockedFor()` in `src/utils/privateStoreLock.ts` answers "is this signed-in user's store locked?" from the user's own key file and their own bag, never from any page: while locked the catalog is itself encrypted, so the server does not know which pages are in it and must not pretend to. `getCommonTemplateData` puts the answer in `privateStoreLocked`, and `views/header.ejs` shows the banner that links to `/private-store/unlock`. It is only ever true for a store's own owner in their own session.

### Proxy key copies

Someone acting for the owner under a proxy grant ([#1762](https://github.com/jwilleke/ngdpbase/issues/1762) slice 5, operator decisions 2026-10-12) opens the owner's encrypted stores through a copy of the owner's KEK that the owner made:

- __Made only by the owner, while unlocked.__ A grant the owner makes for themselves with `vault-proxy`, while their store is unlocked, seals a copy of their KEK to the proxy's public key (`sealKekCopyFor`) and stores it in the grant's credentials row; the grant reads `vault: 'copy'`. The proxy may be offline. It is refused, in plain words, when the owner's encrypted store is locked or the proxy has no key pair yet (no private store of their own, or not unlocked since key pairs existed). An administrator's grant never carries a copy (`vault: 'never'`), and a proxy re-delegating can never add `vault-proxy`. An owner with no encrypted store needs nothing unlocked: the grant opens only their unencrypted vaults (`vault: 'none'`), and does not gain a copy if they make an encrypted store later — they give access again.
- __Opened only by the proxy, while acting and unlocked.__ When the session acts for the owner and the proxy's own store is unlocked, `AuthManager.subjectActingFor` opens the copy (`openKeyCopy`): the proxy's KEK unwraps their private key, which opens the copy, which opens each of the owner's encrypted stores' DEKs. They are held inside the proxy's OWN bag (`copy`), never a bag of the owner's, and the subject's claim carries `viaProxy.keyHandle` naming that bag. Opening is recorded once as `proxy-switch` with reason `vault-opened`, naming both users. A copy that does not open is not retried for that bag.
- __Reached only through `dekFor`.__ `dekFor` and `unlockedStoreIdsFor` answer from the copy only when the claim is a `proxy` claim carrying `vault-proxy` and no token or share, the bag at `keyHandle` belongs to the claim's actor, and the copy there was opened under that grant for the user the subject represents. `kekFor`, `hasUnlockedKey` and `userIndexFor` stay the owner's: a proxy never creates a vault, re-wraps a key or adopts the legacy catalog.
- __Wiped__ on switching back or to someone else, on any request that finds the grant dead (revoked, expired, an account inactive, proxy access off), on revoke or account deletion in every session that opened it (`dropKeyCopiesOfGrant`), and with the proxy's own keys at sign-out or session end (`lockPrivateStores`).
- __Deleted__ with the grant: the sealed copy is in the row, and revoking removes the row.
- __KEK rotation.__ There is none today: a password change and a reset with the recovery words keep the KEK, so copies stay valid. Anything that replaces a KEK must drop every copy of the old one (re-mark the grants `vault: 'none'`) rather than leave a copy that opens nothing or opens stale stores; the owner then gives access again.

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

- a context acting `viaShare` (a share link) passes only when its issuer is the owner, the caller names a vault (`opts.vault`), and the link names that vault (#1388). A question about the owner's container as a whole (their list of vaults, their trash, their takeout) names no vault, so a link never passes it
- a context acting `viaProxy` (someone acting for the owner, [#1762](https://github.com/jwilleke/ngdpbase/issues/1762)) carries the owner's username, so it passes only when the claim is a `proxy` (not `impersonation`), carries no token or share, and its grant carries `vault-proxy`; then the rule below. The PDP re-reads the grant on every decision. An encrypted store opens to it only through the key copy its grant carries (#1762 slice 5, "Proxy key copies" below)
- otherwise the context must be a job acting for the owner, or an authenticated session (`isAuthenticated === true`) whose username is the owner

No role reaches in. An anonymous visitor without a link never matches, even a page whose recorded owner is `Anonymous`.

The `PolicyInformationPoint` applies it in two places:

- __Tier 0 of the page tiers__ (`walkPageTiers`). For a page it calls `PageManager.checkPrivatePageAccess(ctx, name)`, which parses the private page name and ends in `mayActInPrivateContainer`. Tier 0 only refuses ([#1539](https://github.com/jwilleke/ngdpbase/issues/1539)): a refusal ends the walk, and no later tier can grant what Tier 0 denied. A subject it admits still faces policy, asked with the page's `vault`, so the owner's rights in their own vaults come from a policy on the `vault` resource type — the shipped `vault-owner-permissions`, held through the `vault-owner` role that every account is given (`ngdpbase.user.account-roles`). Frontmatter `audience` grants nothing on a private page: Tier 1 is skipped there.
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

A private page's slug is `vaults--{owner}-{store}-{title-slug}` (`private--` until #1507; each vault's pages are re-saved once at boot to take the new form, `vault-slugs` in its `migrations.json`), made by `ValidationManager.generatePrivateSlug` and suffixed `-2`, `-3`… against the owner's own readable stores only (`privateSlugFor`). A locked store is not readable and not consulted, and nothing about another user is ever read.

### The page door

Every page write goes through `PageManager.savePage` — validation, metadata normalisation, conflict checks, the provider write, the shared-index reconciliation and the audit record. `npm run lint:page-door` fails the build on a caller that reaches past it.

The door refuses a name under the private prefix that does not read as `private/{owner}/{store}/{title}`, and on a rename it names the renamed page by its new path rather than its bare title.

`PageManager.reconcileSharedIndexes` skips every private name: `isSharedIndexable(identifier)` is false for a private name and for anything the anonymous subject cannot resolve, and the link graph, the shared search index, attachment mentions and page assets all consult it. The parse cache asks the same question ([#1423](https://github.com/jwilleke/ngdpbase/issues/1423)): a sealed page's HTML would otherwise stay in a process-wide map after its owner logged out.

### The Private box

`FileSystemProvider.privatePlacement()` decides where a save lands:

- a page is private when the save says `private: true`, or when the name is a private name and the save did not say `private: false`
- the owner is the name's owner, else the save's `author`; a private page with no owner is refused
- the store is the one named by the page's name or the save, else the store the page is in now (found by uuid among the owner's stores), else `defaultstoreid`

So ticking the Private box on a public page moves it into the author's default store, and unticking it on a private page moves it back out to the public space. `BasePageProvider.resolvePrivatePageStore()` refuses a save that names a different store for a page that already lives in one, unless the save is an explicit move (#1505): `PageManager.movePageToVault(pageName, toVault, ctx)` moves a page into another of its owner's vaults under the same title, taking its history and index entry with it and keeping its `lastModified` and `editor`; the audit record is a rename from the old path to the new. A page never moves out of an encrypted vault into one that is not, since that would write it in the clear.

At boot, captures made before #1505 (a `general` page with the system keyword `capture`, in its author's default vault) are moved into the capture vault with `system-category: capture`, once per vault (`capture-vault` in the vault's `migrations.json`). Only the vaults the system can open are visited, so captures in an encrypted vault stay where they are; the capture page still finds them there.

Then every other private page made before #1505 is placed (#1507): a page in its owner's default vault whose system-category declares a different vault moves there, once per vault (`category-vaults`). Journal entries are the case this serves. A page in any vault other than the default was put there on purpose and is left alone.

The store is never written into frontmatter — the path records it, and a copy could disagree with where the file is. `private: true` is written only on a private page.

Before any private byte is written, `BasePageProvider.assertPrivateStoreWritable()` calls `assertContextCanWriteStore()`, which refuses a write into an encrypted store the context holds no DEK for, and a write into a sealed kind's vault that has no sealed `store.json` (#1834).

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
- `PageManager.searchSharedFolderPages(ctx, folders, query)` reads the shared folders' indexes the same way, only for the folders the PDP permits `shared-folder-read` to `ctx` ([#2125](https://github.com/jwilleke/ngdpbase/issues/2125), [Shared folders](#shared-folders)); `SearchManager` merges both.

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

The audit record of an upload into, or a delete from, an __encrypted__ store names the file by its id and the store (owner and store id), never its original name, page or size ([#2048](https://github.com/jwilleke/ngdpbase/issues/2048)). A plain store's and the shared pool's records keep the name. Rows written before the change are left as they are.

The rule (operator, 2026-10-16): __an upload is either an attachment, on a page, or a saved file. Every attachment of a vault page is stored in that vault__ ([#1842](https://github.com/jwilleke/ngdpbase/issues/1842)). The upload limits are the configured ones, `ngdpbase.attachment.allowedtypes` and `ngdpbase.attachment.maxsize`, whatever the destination.

__A page's files follow the page__ ([#1842](https://github.com/jwilleke/ngdpbase/issues/1842)). When a page moves into a vault (the Private box), out of one, or between two (`movePageToVault`), `AttachmentManager.movePageAttachments()` moves the files it uses:

- Which files: those whose mentions name the page where it was, and those its content references (`[{Image src='…'}]`, `[{ATTACH src='…'}]`, `/attachments/{id}`), looked up in the vault it left first, then the shared pool.
- Each one is copied under the __same id__, because that id is the `/attachments/{id}` URL in the page, through both sides' store I/O: sealed going into a sealed vault, opened coming out into the shared pool, re-sealed between two sealed vaults. The copy is made first and the source handled after it, so a failure leaves two copies, never none.
- The source: a file no other page there uses is removed. A shared-pool file is removed with its record and its cached thumbnails, so no public copy is left. A file another page still uses stays for it, without this page's mention. Who else uses a shared-pool file is read from its mentions (`poolFileShare`), each one of:
  - the page itself, by its name now or before the move, or its uuid: dropped from the record
  - a public page that exists now, asked of `PageManager` by exact title (any case), slug or uuid, never by role: a sharer, and the pool copy stays for it
  - another vault page: kept until that page's own repair takes the file, so its bytes are never removed from under it (the startup check names that vault meanwhile)
  - stale, a public name no page has any more (renamed, made private, deleted; often this page's own former public title): dropped, and it keeps nothing
- So a shared-pool file is removed when its mentions name no public page that exists now and no other vault page. One with sharers is copied in and left in the pool for them, with this page's and the stale mentions dropped. One with no mentions at all, which only the content references, is copied in and left in the pool, never taken from a page whose mention was never recorded.
- A page made public brings its vault files into the shared pool, readable by its new audience like any public attachment, and the vault's name leaves any shared record that named it.
- Refusal: both sides' I/O is resolved before any file moves, so a locked vault, or a sealed kind's vault that hasn't been opened, moves nothing. The page's own save meets the same refusal first (`SealedVaultRefusedError`, or the locked-store error), so a refused move leaves the page and its files where they were.

`attachToPage(id, vaultPage)` with a shared-pool file copies the file into the page's vault under the same id, asking what an upload onto that page asks (the page's edit door, then `asset-upload` in the vault). The shared record is not told about the vault page.

__Who could read a vault page's shared-pool file__ (before #1842): anyone the shared pool serves. `GET /attachments/{id}` and its thumbnail ask only the site-wide `asset-read`, which the shipped policies give to anonymous visitors; the attachment browser and asset search (the editors' surface, `asset-upload`) list the shared pool with the file's name. Whether the vault page itself could be read was never asked. So a file a page took into a vault stayed readable by anyone with its id, and findable by name by any editor. (`/media` serves the media library, not attachments.)

At startup, after the boot migration, `AttachmentManager.reportVaultPagesUsingPoolFilesAtBoot()` looks for what earlier moves left (`findVaultPagesUsingPoolFiles`): shared records whose mentions name a vault page, and, in each vault that isn't sealed, pages whose content references a shared-pool file the vault doesn't hold, and pages using a file the vault does hold whose pool copy under the same id is still there with no public page that exists now among its mentions (the copy an earlier repair left when it took a stale mention for a sharer: jimstest, 2026-10-17). Such a held file that no page's content or title claims is counted for the vault as "pages named by shared records". Each is reported by owner, vault and page uuid (never a title or a file name), with the same log error, degraded state and system notification as the vault checks above. The check itself moves, copies and deletes nothing. A sealed vault's pages can't be read without their owner's key, so they are not checked.

### Repairing what earlier moves left outside

"Move into vault" ([#1842](https://github.com/jwilleke/ngdpbase/issues/1842)) moves what the two checks above report into the vault, one reported item at a time, or every item the caller may with "Repair all I can". `PageManager.repairVaultPage` orchestrates it, as the page door orchestrates a move, and each manager moves its own data with the code its moves already use:

- __Files__: `AttachmentManager.movePoolFilesIntoVault` takes the shared-pool files the page uses (its mentions, and what its content references that the vault doesn't hold) by `movePageAttachments`' rule: copied in under the same id through the vault's I/O, sealed when the vault is, and the pool copy removed (record, bytes, cached thumbnails) when no public page that exists now uses it. A file other public pages use stays in the pool for them, without the vault page's mention or stale ones (written through `setPoolMentions`, so it is on disk). Running it again is safe and finishes the job: a file the vault already holds under the same id whose pool copy has no live public sharer loses that copy (counted as moved), and one whose pool copy public pages still use is left alone (counted as nothing). An item for "pages named by shared records" repairs each page of that vault a shared record names, and each page a held file with such a leftover pool copy names.
- __Footnotes and comments__: `FootnoteManager.moveOutsideFootnotesIntoVault` and `CommentManager.moveOutsideCommentsIntoVault` (`moveOutsideNotesIntoVault()` in `src/utils/pageNotes.ts`) move them in like `movePageNotes()`. Where the vault already has some, written since #1839, the two are merged and the vault's own entries win. The page must be one of that vault (`{uuid}.md`, live or in its trash), so no public page's notes can be pulled into a vault by naming its uuid.
- __Order__: the vault side is written before the source is removed, so a failure leaves two copies, never none.

Who may:

- __The vault's owner__, in their own session: the container rule, then `page-edit` in the vault (`vault-owner`). A sealed vault needs its key, so it must be unlocked; a locked one is refused with "unlock it first".
- __Someone holding `admin-system`__, for a vault that isn't sealed: the reach of the boot migration (#1460), which already writes into unsealed vaults with no owner present. The administrator sees only owner, vault, page uuid and counts, never the content.
- __Nobody else for a sealed vault.__ Asked by anyone but its owner, it is refused ("only {owner} can move these into it") and nothing changes. A sealed kind's vault that isn't sealed yet is refused for everyone until its owner opens it.

Each repair is recorded as `vault-repair` (on-failure refuse) before anything moves: who, owner, vault, page uuid, and the counts (files moved, files copied, footnotes, comment files), never a title or a file name. Afterwards the three checks run again and keep what they found; a subsystem whose findings are gone leaves the degraded state the check set, so the banner clears without a restart. A different fault the subsystem reported meanwhile stays.

Where: the admin dashboard lists every item under the subsystem banner, with "Move into vault" where the administrator may and the reason where they may not. The owner sees their own on their profile, with "Move all into my vaults". Both are CSRF-protected form posts to `POST /vault-repair` and `POST /vault-repair/all`.

What each row shows (operator, 2026-10-17): to whoever may read the page, its title linked to the page and each outside file's name linked to the URL that serves it today (`/attachments/{id}`), so the owner can check what will move; footnotes and comments are only said to be there. `listVaultRepairs(ctx, { details: true })` asks only for rows of the reader's own vaults (the container rule), finds the page through the vault stores the reader can open, so a sealed vault shows nothing without its owner's key, and reads it as the reader through `mayShowPage` then `readPage`, the same door as viewing it (an unrecorded affordance first, so a refusal never records a page name). The file list is `AttachmentManager.poolFilesOfVaultPage`, the same files the move takes. Anyone else, another administrator included, sees owner, vault, page uuid and counts only. Titles and file names are shown, never logged, notified or recorded. Drawn by `views/_vault-repair-pages.ejs` on both pages.

The condition for a store's own catalogue is "this page is in a private store", not "the store is sealed": encryption decides whether the bytes are ciphertext at rest, not who owns the catalogue.

`BasicAttachmentProvider.storeFileInStore()` writes the bytes through the store's `StoreFileIO` and keeps a SHA-256 `fingerprint` in the store's index. Duplicate detection is __per store__: an upload whose fingerprint is already in that store returns the existing entry and adds the page to its `mentions`. It never matches another store and never the public pool, which also fixes a private upload silently returning the public copy of identical bytes.

Reading back, `AttachmentManager.ownPrivateStores()` applies the container rule first, then lists every store in that container from the folder (`privateStoreIdsOf` — which stores exist is a question about a folder, not about keys), and opens each through `storeFileIO`, skipping the encrypted ones it holds no DEK for rather than reading them in the clear. `findOwnStoreFile()` asks the PIP again, per file, before anything is handed back, so ownership is checked before a store is opened and again before a byte leaves. A store file is presented to templates through `storeFileMetadata()`, which carries the legacy aliases but never `filePath`.

---

__Unused files__ ([#1517](https://github.com/jwilleke/ngdpbase/issues/1517)). The profile page lists, per vault, the files no current page of that vault uses (`AttachmentManager.listOwnUnusedVaultFiles`: the file's mentions name no page the vault holds), such as one whose page was deleted, or one that stayed for a page that has since left the vault. Only the owner's own vaults are read; an encrypted vault this session cannot open is shown as locked. Deleting one goes through the attachment door (`DELETE /attachments/:id`), so it needs `asset-delete`, which the shipped policies give to editors and above.

## Takeout and backup

Two ways out, which differ in kind ([#1387](https://github.com/jwilleke/ngdpbase/issues/1387)):

- __Instance backup__ (admin, a job). Private files ride in the backup document as base64, bytes as on disk: ciphertext stays ciphertext, `user-keys.json` travels, and no administrator becomes a keyholder. Restore writes them back as bytes.
- __Takeout__ (the owner, `GET`/`POST /my/takeout`). `PageManager.buildOwnStoreTakeout` → `buildStoreTakeout` in `src/utils/privateStoreExport.ts`, packed by `src/utils/zipArchive.ts`. Decrypted, built in memory, never staged on disk; a locked store is refused, never exported empty.

A takeout holds, under one `{store}/` folder:

- each page as `{title}.md` with its full frontmatter, uuid included
- each file under `attachments/` by the name it was uploaded with
- its pages' footnotes and comments, decrypted, as `footnotes/{uuid}.json` and `comments/{uuid}/{id}.json`, keyed by the page uuid in each page's frontmatter ([#1839](https://github.com/jwilleke/ngdpbase/issues/1839)). A pages-only takeout carries them too
- `files-index.json` — the store's file index, decrypted, holding only the files in the archive, each record's `fileName` rewritten to its path in the archive. It is kept because it is the only record of a file's id, which is what `/attachments/{id}` on a page names; without it a takeout's links point at nothing (operator, 2026-09-25)

It carries no `versions/`, `deleted/`, `pages-index.json`, `search-index.json`, `deleted-index.json`, `migrations.json`, `store.json` or `user-keys.json`. A takeout is a copy you can read, not a restore.

### Importing a takeout

`POST /my/takeout/import` ([#1472](https://github.com/jwilleke/ngdpbase/issues/1472)) takes a takeout back into one of the requester's own stores, on this instance or another. The door is `ImportManager.importOwnStoreTakeout`; `src/utils/privateStoreImport.ts` reads the takeout and `readZip` in `src/utils/zipArchive.ts` unpacks it, both in memory. Not `importPages`: that reads a server-side directory and converts every page.

- Refused before any write when the store is not the requester's, does not exist (the default store always does), or is encrypted and locked in this session.
- Files first, through `AttachmentManager.uploadAttachment` into the store; `/attachments/{oldId}` links in the pages are pointed at the ids the store holds, using `files-index.json`.
- Pages through `PageManager.savePage`, uuid kept, so a sealed store encrypts on write.
- Idempotent: a uuid already in the store is skipped (`unchanged`, or `changed-since-takeout` when the body differs — the live page wins); a uuid used elsewhere on the site is skipped as `uuid-elsewhere`, naming the page only when the requester may view it; a title held by a different page lands beside it as `Title (imported)`.
- Every file comes in, even one whose pages were skipped; files no page now in the store links to are named in the importer's report and counted (never named) in the log and audit record (operator, 2026-09-25).
- Each import saves its report as a private page in the target store, `{date time}-import-report` (e.g. `2026-09-25 11:40:12-import-report`): every page's outcome (linked), the files, the unlinked and the ignored. It is sealed exactly when the store is, so it names what the log and audit record may only count (operator, 2026-09-25). A re-import changes none of the imported content, but adds its own report page.
- Capped by `ngdpbase.stores.import.maxsize` (256 MB), which bounds both the upload and what it unpacks to. Audited as `store-import`, with counts only.

It brings back pages and files, never history or trash, and not yet a takeout's footnotes and comments: they are listed as ignored.

---

## Sharing a vault by link

The owner of a vault can share chosen pages, or the whole vault, through a read-only link ([#1388](https://github.com/jwilleke/ngdpbase/issues/1388)). __How it works is [sharing.md](sharing.md#vault-links)__, the source of truth for all sharing. What matters here, inside the vault:

- the vault rule above lets a link in only to a vault it names, and only when the caller names that vault; the owner's container as a whole never admits one
- a link shows only current pages and the files they use, never history, and a file no covered page uses is not shared
- a link to an encrypted vault opens nothing yet: it carries no key. The agreed key-per-item design is in [sharing.md](sharing.md#decided-not-yet-built)

---

## Shared folders

The organization's shared folders ([#2125](https://github.com/jwilleke/ngdpbase/issues/2125), [SharedFolderManager](managers/SharedFolderManager.md#folders)) use this container code: each folder is a vault of the reserved container `shared-folders` (`SHARED_FOLDER_OWNER`), at `pages/vaults/shared-folders/{folder}/`, laid out as above. Its pages are named `shared/{folder}/{title}`, which `parsePrivatePageName` reads as that container's (`vaults/shared-folders/…` is not a name), and `pageUrl` links to `/shared/…`. Three things differ from a user's vault:

- __Who may act__: never the owner rule. `mayActInPrivateContainer` refuses everyone for the container; `permitsInVault` asks `shared-folder-read` or `shared-folder-file` on the folder instead (`permitsInSharedFolder`), and the page tiers decide a folder page by that alone, never by the `vault` policy.
- __The key__: the server's, from SharedFolderManager, never in a session bag. `dekFor` hands it only to a context the PDP has permitted on the folder (`sharedFolderKeyFor`). `store.json` says the folder is sealed and holds no wrapped key.
- __No share links__: a share subject is refused before the PDP is asked, and a vault link can be issued only by a vault's owner, which no account is here.

Everything else above applies as it is: the page and file doors, history, trash, the per-folder page, file and search indexes, sealing, and the instance backup.

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
