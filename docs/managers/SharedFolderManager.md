---
name: SharedFolderManager
description: The organization's shared folders — each folder's own key, wrapped under the shared-folders key and sealed for the organization's recovery words (#1775, #2124)
dateModified: '2026-10-29'
category: managers
code: src/managers/SharedFolderManager.ts
---

# SharedFolderManager

SharedFolderManager owns the organization's shared folders ([#1775](https://github.com/jwilleke/ngdpbase/issues/1775); design in [shared-folders.md](../planning/shared-folders.md)). Slice 1 ([#2124](https://github.com/jwilleke/ngdpbase/issues/2124)) is built: the keys and the recovery words. Folders themselves, their routes, permissions, search and the admin screen are later slices, and they come to this manager ([Known gaps](#known-gaps)).

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
| Who may act | the PDP (`admin-system` in this slice) |
| The admin's "I have saved the words" | ConsentManager, scope `shared-folders-recovery-words` |
| Whether the shared-folders key is saved off the server | BackupManager (`ngdpbase.backup.shared-folders-key-saved-fingerprint`) |
| The audit records | AuditManager (`shared-folder-words-create`, `shared-folder-key-create`) |

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
| `openFolderKey(ctx, folderId)` | the folder's key, with the server key |
| `openFolderKeyWithWords(ctx, folderId, words)` | the folder's key, with the words: what recovery will use |

Every method takes the caller's context and asks the PDP for `admin-system` (`SharedFolderRefusedError` when refused). Slice 2 changes `openFolderKey` to ask `shared-folder-read` on the folder. `openFolderKeyWithWords` derives the words' key with PBKDF2 (2048 rounds), as the personal recovery words do; it is only for recovery, never a page read.

## Backup and restore

`backupFolders()` declares the folder as the part `shared-folders`, optional so a backup from before #2124 still restores. The archive is encrypted under the backup key like every part. The server key comes back with the instance `.env` in the same backup (it is not one of the lines a restore keeps from the live file), so a restored `keys.json` and its key match. A backup taken without the backup key leaves `.env` out: restored on a new server, its `keys.json` is under a key that server does not have, and the folders open again only with the recovery words (a later slice).

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `ngdpbase.shared-folders.storagedir` | `${FAST_STORAGE}/shared-folders` | where `keys.json` is kept |
| `ngdpbase.shared-folders.words-pending-minutes` | `15` | how long words shown wait for the tick before they are discarded |

## Known gaps

- Slice 2 ([#1775](https://github.com/jwilleke/ngdpbase/issues/1775) build order): folders holding pages and files through the page and asset doors, the `shared-folder-read` / `shared-folder-file` permissions, sealed search and audit. Until then nothing calls `createFolderKey` or `openFolderKey` outside tests.
- Slice 3: the admin Shared folders screen. Slice 4: `/shared/executive` ([#2095](https://github.com/jwilleke/ngdpbase/issues/2095)).
- Later: rotation of the server key (decision 3), recovery with the words after a lost key and making a new set of words (decision 4), add-on folders (decision 9), trash and purge (decision 10).
- A set confirmed and then asked again by a new wording version, whose admin is gone, cannot be discarded once it protects folder keys: its reminder stays until replacing a confirmed set is built (a later slice). An unconfirmed set protecting no folder can always be discarded.
- A backup taken without the backup key leaves `.env` out, so its `keys.json` needs the recovery words on a new server (recovery is a later slice).

## See also

- [ConsentManager](ConsentManager.md#the-shared-folders-recovery-words), [BackupManager](BackupManager.md)
- [private-stores.md](../private-stores.md) — the key code reused here
- [backup-restore-guide.md](../guides/backup-restore-guide.md), [bootstrap-developer-guide.md](../guides/bootstrap-developer-guide.md)
- The help page Shared Folders Recovery Words (`required-pages/`, slug `shared-folders-recovery-words`)
