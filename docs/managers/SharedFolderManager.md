---
name: SharedFolderManager
description: The organization's shared folders — each folder's own key, wrapped under the shared-folders key and sealed for the organization's recovery words, and the folders at /shared/{name}, opened by permission (#1775, #2124, #2125)
dateModified: '2026-10-29'
category: managers
code: src/managers/SharedFolderManager.ts
---

# SharedFolderManager

SharedFolderManager owns the organization's shared folders ([#1775](https://github.com/jwilleke/ngdpbase/issues/1775); design in [shared-folders.md](../planning/shared-folders.md)). Slice 1 ([#2124](https://github.com/jwilleke/ngdpbase/issues/2124)) built the keys and the recovery words; slice 2 ([#2125](https://github.com/jwilleke/ngdpbase/issues/2125)) the folders, `/shared/<name>`, which hold pages and files and open by permission ([Folders](#folders)). The admin screen and the rest are later slices ([Known gaps](#known-gaps)).

## What it owns

One fact, the key material, in `<ngdpbase.shared-folders.storagedir>/keys.json` (default `${FAST_STORAGE}/shared-folders`), owner-only (`0600`, folder `0700`), written whole and renamed into place:

- __Each folder's own key__ (decision 2): a random 32-byte key (DEK), wrapped under the server key with the private-store wrap (`createEncryptedStore` / `unwrapDek` in `src/utils/privateStoreCrypto.ts`). No second scheme.
- __The organization's recovery words__ (decision 4), as a recovery wrap and a key pair (`newRecoveryWords`, `newPersonKey`): the words wrap a random key, which wraps the pair's private half. Never the words themselves.
- __Each folder key's recovery copy__: the folder key sealed to that pair's public half (`sealKekCopy`, the share lockbox). Only the words open it (`unwrapKekWithMnemonic`, then `openKekCopy`).
- __The server key's fingerprint__, so a different key at start is reported, not discovered later.

Why the words do not wrap each folder key directly: the server sees the words only while showing them, once. A folder made later still has to be sealed for them, so each folder key is sealed to a public key whose private half only the words open. Every folder key is therefore kept twice, under the server key and for the words, as decision 4 requires.

Everything else it asks for:

| Fact | Owner |
| --- | --- |
| Who may act | the PDP: `admin-system` for the words and to make a folder; `shared-folder-read` / `shared-folder-file` on the folder for everything in it |
| A folder's pages, their history, trash and search index | PageManager, through the page door |
| A folder's files | AttachmentManager, through the file door |
| The admin's "I have saved the words" | ConsentManager, scope `shared-folders-recovery-words` |
| Whether the shared-folders key is saved off the server | BackupManager (`ngdpbase.backup.shared-folders-key-saved-fingerprint`) |
| The audit records | AuditManager (`shared-folder-words-create`, `shared-folder-key-create`, `shared-folder-create`, `shared-folder-read`; the writes are the page and file doors' own) |

## The server key

`NGDPBASE_SHARED_FOLDERS_KEY` (decision 1) lives in the instance `.env` beside the backup, database and credentials keys. `bootstrap-env.ts` generates it on first start when nothing supplies it (`ensureInstanceEnvSecret`), and SharedFolderManager reads it once, at start; nobody types anything. The wrap key is derived from it with HKDF-SHA256 (`sharedFoldersWrapKey`, `src/utils/sharedFoldersKey.ts`), so a value an operator set in any form works. It is never a config key, never logged, never recorded.

At start the manager is degraded (dashboard outage) when:

- the key is not set: nothing can be made or opened;
- the key is not the one `keys.json` was made under (its fingerprint differs): nothing opens until the saved `.env` is put back and the site restarted. With the key lost for good, recovery with the words is a later slice.

It protects against a stolen backup or data volume, not against someone who already controls the server, like the database and credentials keys.

## The recovery words

Made on an admin's action, on Admin → Backup ("Make the recovery words"), not at first start or with the first folder:

- At first start no one is there to see them; they would have to sit on disk until an admin looked, which defeats keeping them off the server.
- The first folder (slice 2) would bundle two steps; a folder cannot be made until the words exist and are confirmed (`createFolderKey` refuses), so slice 2 sends the admin here first.

The steps:

- `prepareRecoveryWords(ctx)` makes 12 BIP39 words and returns them with a token. Nothing is saved: the words wait in memory, for that admin only, for `ngdpbase.shared-folders.words-pending-minutes` (default 15). A second call replaces them.
- The page (`views/admin-shared-folders-words.ejs`, `no-store`) shows them once with the required tick from `_recovery-words-consent.ejs` and the wording's version.
- `POST /admin/backup/shared-folders/words/save` refuses without the tick, or when the wording's version changed: the words are discarded (`discardRecoveryWords`), never shown again, and nothing is saved. With it, `saveRecoveryWords(ctx, token)` records `shared-folder-words-create` (on-failure refuse) and then writes them, naming the admin they were shown to (`shownTo`). The route then records the consent (`how: setup`), bound to the set of words (`recoveryWordsInfo().wordsId`).
- A second set is refused while one is saved. An __unconfirmed__ set can be discarded (below); replacing a __confirmed__ set, which retires the old one, is a later slice.

### Confirmed before any folder key (operator, 2026-10-29)

- `createFolderKey` refuses until the words are __confirmed__: the admin shown them has a consent for this set at the wording's current version (`recoveryWordsConfirmed()`, which asks ConsentManager each time; false without the wording page). Made is not enough, so no folder key is ever protected only by words nobody saved. A new wording version asks again, and until the confirmation is renewed no new folder key is made; existing ones are unaffected.
- `discardUnconfirmedWords(ctx)`: any holder of `admin-system` may discard a set the admin shown it has not confirmed (`POST /admin/backup/shared-folders/words/discard`, "Discard these words" on Admin → Backup), then make a new set and confirm it themselves. That is how a reminder nobody can clear (the words lost, or that admin's account deleted) is always cleared. Recorded as `shared-folder-words-discard` (on-failure refuse) before the words are removed. Refused for a confirmed set, and for a set any folder key is sealed for (`protectsFolders`): such a set was confirmed when the key was made, and discarding it would leave those keys without their recovery copy.

### The confirmation and the banner

Only the admin shown the words can confirm saving them; nobody else saw them. Until that admin's consent exists for this set at the wording's current version (`sharedFoldersWordsState`, `src/utils/sharedFoldersWordsConsent.ts`), holders of `admin-system` see a banner on the home page, `/admin` and `/admin/backup` (`res.locals.sharedFoldersWordsNotice`, set by `src/middleware/recoveryWordsNotice.ts`). The admin who saw the words is linked to `/consent?scope=shared-folders-recovery-words`; the others to Admin → Backup, which names who was shown them, and are told they can discard the set and make their own (unless it protects folder keys). It never holds a request, and never shows to a token, a share link or a proxy. The wording is the required page `shared-folders-recovery-words`; raising its `version:` asks again.

## Folders

A folder is the one fact this manager adds in slice 2: its name, with its key in `keys.json`. What it holds is kept by the page and file doors, as a vault's is ([private-stores.md](../private-stores.md#shared-folders)): `pages/vaults/shared-folders/<name>/`, the reserved container `shared-folders` (`SHARED_FOLDER_OWNER` in `src/utils/privateStorePath.ts`; no account may take the name), laid out as a vault, its `store.json` saying it is sealed and holding no wrapped key. A page in it is named `shared/<name>/<title>`, which is also its URL. So pages are written and versioned by `PageManager.savePage`, files by `AttachmentManager.uploadAttachment`, each folder keeps its own sealed page, file and search indexes, and nothing of it enters the site-wide index, the link graph or the shared render cache (`isSharedIndexable` is false for the name).

- __Making one.__ `createFolder(ctx, name)`: `admin-system`; refused until the recovery words are confirmed (it makes the key with `createFolderKey`); `shared-folder-create` is recorded first (on-failure refuse). On Admin → Backup, "Make a shared folder" (`POST /admin/backup/shared-folders/folders`). `/shared/default` is made when the words are saved and confirmed there (`ensureDefaultFolder`). Until the Shared folders screen (slice 3), a new folder other than `default` opens to nobody until a policy names it.
- __Who opens it.__ Every read asks `shared-folder-read`, every add, edit or delete `shared-folder-file`, of the PDP with the caller's context, with the folder as the policy resource (type `shared-folder`, `shared/<name>`; `permitsInSharedFolder` in `src/utils/sharedFolderAccess.ts`). A folder lists no roles. The shipped policy `shared-folder-default` grants both on `shared/default` to `vault-owner`, the role every account is given: every signed-in user, never anonymous. A share link is refused before the PDP is asked, and no share action is allowed in a folder: there are no share links into folders. The vault owner rule (`mayActInPrivateContainer`) admits nobody to the container, and the vault policy (`vault-owner-permissions`) never decides a folder page (`walkPageTiers` decides it by the folder permission alone).
- __The key.__ The server holds every folder's key (decision 1). It reaches the store I/O (`dekFor`) only for a context the PDP has permitted on that folder, remembered against that context object (`sharedFolderKeyFor`). The session middleware asks `foldersReadableBy` for every request's subject, so a grant removed ends access on the next request (decision 5); a boot job, a share link or an anonymous visitor nothing asked about reads nothing in a folder.
- __Routes.__ `GET /shared` (the folders the reader may open), `GET /shared/<name>` (its pages; `?new=<title>` opens the editor), and `/shared/<name>/<title>` with `edit`, `save`, `delete`, `history` and `diff`, each behind `WikiRoutes.sharedPageRoute`: the folder permission for the action, a 404 like a missing page when refused, then the same handlers and page door as any page. Files are uploaded onto a folder's page and served at `/attachments/<id>` to its readers.
- __Search.__ Site search adds the matches from each folder the reader may open, from its own sealed index (`PageManager.searchSharedFolderPages`, merged by `SearchManager`); a folder they may not open gives no row, title or count (decision 7).
- __Audit.__ Every read is recorded as `shared-folder-read` (on by default, `continue`): a page viewed or its history, by the route; a file served, by AttachmentManager. Writes are recorded by the doors that make them (`page-create`, `page-edit`, `page-delete`, `asset-upload`, `asset-delete`), each with who acted.

## Methods

| Method | For |
| --- | --- |
| `recoveryWordsInfo()` | the words as made (`wordsId`, `madeAt`, `shownTo`, `protectsFolders`), never the words; null before |
| `unavailableReason()` | why the keys cannot be used now, or null |
| `prepareRecoveryWords(ctx)` | make the words to show once; returns `{ token, words }` |
| `saveRecoveryWords(ctx, token)` | save them after the tick; returns `wordsId` |
| `discardRecoveryWords(ctx)` | forget unsaved words |
| `recoveryWordsConfirmed()` | whether the admin shown the words confirmed them, at the current wording |
| `discardUnconfirmedWords(ctx)` | discard saved words nobody confirmed (any admin) |
| `createFolderKey(ctx, folderId)` | make a folder's key, under the server key and for the words; needs confirmed words |
| `openFolderKey(ctx, folderId)` | the folder's key, with the server key, for a caller permitted `shared-folder-read` on it |
| `folderNames()` | the folders there are |
| `createFolder(ctx, name)` | make a folder: its key and its sealed place for pages (`admin-system`) |
| `ensureDefaultFolder(ctx)` | make `/shared/default` once the words are confirmed |
| `mayInFolder(ctx, action, name)` | the PDP's answer for a page or file action in a folder |
| `foldersReadableBy(ctx)` | the folders `ctx` may open; opens their keys to it |
| `recordRead(ctx, name, what)` | record a read (`shared-folder-read`) |
| `openFolderKeyWithWords(ctx, folderId, words)` | the folder's key, with the words: what recovery will use |

Every method takes the caller's context. The words and `createFolder` ask the PDP for `admin-system`; `openFolderKey`, `mayInFolder` and `foldersReadableBy` ask the folder permission (`SharedFolderRefusedError` when refused). `openFolderKeyWithWords` derives the words' key with PBKDF2 (2048 rounds), as the personal recovery words do; it is only for recovery, never a page read.

## Backup and restore

`backupFolders()` declares the folder as the part `shared-folders`, optional so a backup from before #2124 still restores. A folder's contents are under the pages folder, in the `shared-folders` container, so the pages part backs them up as it backs up every vault: bytes as on disk, sealed stays sealed (`collectUser`, `attachmentFilesBackup`). The archive is encrypted under the backup key like every part. The server key comes back with the instance `.env` in the same backup (it is not one of the lines a restore keeps from the live file), so a restored `keys.json` and its key match. A backup taken without the backup key leaves `.env` out: restored on a new server, its `keys.json` is under a key that server does not have, and the folders open again only with the recovery words (a later slice).

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `ngdpbase.shared-folders.storagedir` | `${FAST_STORAGE}/shared-folders` | where `keys.json` is kept |
| `ngdpbase.shared-folders.words-pending-minutes` | `15` | how long words shown wait for the tick before they are discarded |

## Known gaps

- Slice 3 ([#2126](https://github.com/jwilleke/ngdpbase/issues/2126)): the admin Shared folders screen, which lists folders, makes one and writes its access policies. Until then a folder other than `default` opens only through a policy written in configuration, and folders are made on Admin → Backup. Slice 4: `/shared/executive` ([#2095](https://github.com/jwilleke/ngdpbase/issues/2095)).
- A folder page's trash is never purged by age: retention runs under a job context, which holds no folder key, so a deleted folder page stays in the folder's trash until it is purged by hand. Deleting a whole folder (trash and purge, decision 10) is a later slice.
- Files reach a folder only by upload onto one of its pages; the attachment browser and the asset search list the requester's own vaults and the shared pool, not folders.
- A proxy acting for a user reaches the folders the PDP permits the subject it acts as, bounded by the grant's ceiling; no folder-specific proxy rule exists.
- Titles of folder pages are not struck from logs and audit records, unlike a vault's: the audit record names what was opened (decision 5).
- Later: rotation of the server key (decision 3), recovery with the words after a lost key and making a new set of words (decision 4), add-on folders (decision 9), trash and purge (decision 10).
- A set confirmed and then asked again by a new wording version, whose admin is gone, cannot be discarded once it protects folder keys: its reminder stays until replacing a confirmed set is built (a later slice). An unconfirmed set protecting no folder can always be discarded.
- A backup taken without the backup key leaves `.env` out, so its `keys.json` needs the recovery words on a new server (recovery is a later slice).

## See also

- [ConsentManager](ConsentManager.md#the-shared-folders-recovery-words), [BackupManager](BackupManager.md)
- [private-stores.md](../private-stores.md) — the key code reused here
- [backup-restore-guide.md](../guides/backup-restore-guide.md), [bootstrap-developer-guide.md](../guides/bootstrap-developer-guide.md)
- The help page Shared Folders Recovery Words (`required-pages/`, slug `shared-folders-recovery-words`)
