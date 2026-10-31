---
name: SharedFolderManager
description: The organization's shared folders — each folder's own key, wrapped under the shared-folders key and sealed for the organization's recovery words, and the folders at /shared/{name}, opened by permission and given to roles on Admin → Shared folders; the words shown once with Download and Print, typed back, and replaced by a new set (#1775, #2124, #2125, #2126, #2144)
dateModified: '2026-10-30'
category: managers
code: src/managers/SharedFolderManager.ts
---

# SharedFolderManager

SharedFolderManager owns the organization's shared folders ([#1775](https://github.com/jwilleke/ngdpbase/issues/1775); design in [shared-folders.md](../planning/shared-folders.md)). Slice 1 ([#2124](https://github.com/jwilleke/ngdpbase/issues/2124)) built the keys and the recovery words; slice 2 ([#2125](https://github.com/jwilleke/ngdpbase/issues/2125)) the folders, `/shared/<name>`, which hold pages and files and open by permission ([Folders](#folders)); slice 3 ([#2126](https://github.com/jwilleke/ngdpbase/issues/2126)) the admin Shared folders screen ([Who may read and file](#who-may-read-and-file-2126)). The rest are later slices ([Known gaps](#known-gaps)).

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
| The audit records | AuditManager (`shared-folder-words-create`, `shared-folder-words-replace`, `shared-folder-words-discard`, `recovery-words-export`, `shared-folder-key-create`, `shared-folder-create`, `shared-folder-access-change`, `shared-folder-read`; the writes are the page and file doors' own) |
| Who may read and file in each folder, as policies | ConfigurationManager (`ngdpbase.access.policies`), written by `setFolderAccess` for the Shared folders screen (#2126) |

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

The steps, the same two as the store door's ([#2144](https://github.com/jwilleke/ngdpbase/issues/2144)):

- `prepareRecoveryWords(ctx)` makes 12 BIP39 words and returns them with a token. Nothing is saved: the words wait in memory, for that admin only, for `ngdpbase.shared-folders.words-pending-minutes` (default 15). A second call replaces them.
- __Shown once.__ `POST /admin/backup/shared-folders/words` renders the words step of `views/admin-shared-folders-words.ejs` (`no-store`): the 12 words and a copy box, with __Download as a file__ and __Print__ (`_recovery-words-show.ejs`, shared with the store door). Both post the token to `…/words/download` or `…/words/print`; `pendingRecoveryWords(ctx, token, how)` records `recovery-words-export` (who, `set: shared-folders`, the set's id, `how`; never the words; on-failure refuse) and hands back the words still waiting, which the route sends as a plain text file (attachment) or a print view (`recovery-words-print.ejs`), both `no-store`, nothing kept. The sheet (`src/utils/recoveryWordsFile.ts`) names the site (`ngdpbase.application-name`, `ngdpbase.application.base-url`), when the words were made in the server's local time, the numbered words, what they are for and that the server does not keep them; no key material. Once saved, the words are gone and cannot be downloaded or made again.
- __Typed back.__ "I have written them down" opens `GET …/words/confirm` (`waitingWords(ctx)`, never the words): all 12 typed back (`_recovery-words-typeback.ejs`, read by `WikiRoutes.typedRecoveryWords`, as the store door does) and the required tick from `_recovery-words-consent.ejs` with the wording's version; the button is "I have saved them — finish".
- `POST …/words/save` saves nothing without the tick, when the wording's version changed, or when the words typed do not match (`SharedFolderWordsMismatchError`, compared with `sameMnemonic`): it says so and shows the confirm step again while the words wait. With all three, `saveRecoveryWords(ctx, token, typed)` records `shared-folder-words-create` (on-failure refuse) and then writes them, naming the admin they were shown to (`shownTo`). The route then records the consent (`how: setup`), bound to the set of words (`recoveryWordsInfo().wordsId`). "Cancel" or "Start over" (`POST …/words/cancel`, `discardRecoveryWords`) forgets the words; nothing is saved.
- A second set is refused while one is saved (`prepareRecoveryWords`). An __unconfirmed__ set can be discarded (below); any saved set is replaced with a new set (below).

### A new set of words (#2144)

On Admin → Backup, "Make a new set of recovery words" (`POST /admin/backup/shared-folders/words/new`), shown once a set is confirmed or protects folder keys:

- `prepareNewRecoveryWords(ctx)` needs `admin-system` and a fresh sign-in: the PDP is asked `config-manage` too, the step-up permission Admin → Backup's key pages ask, so a sign-in older than `ngdpbase.auth.step-up.max-age-minutes` is sent to `/auth/reauth` first (the route asks it with `permitted`, so the prompt is the usual one). The new words wait as the first set does, marked with the set they replace.
- Shown, downloaded or printed, and typed back exactly as the first set; until then nothing changes and the old words keep working. Cancelled, abandoned or expired, the old set stays.
- `saveRecoveryWords` asks the fresh sign-in again, then, in one step under the keys file's lock: every folder key is opened with the server key and its recovery copy sealed for the new words; `shared-folder-words-replace` is recorded (who, the new set, the set it replaces, how many folder keys; on-failure refuse); and the new set and the sealed copies are written as one file, renamed into place. The old words then open nothing. A failure anywhere before the rename (a key that will not open, the record, the write) leaves the old file and the old words as they were. Refused when the saved set changed while the new one waited.
- The route records the consent again for the new set (`how: new-words`), naming the admin who made it; the banner and Admin → Backup then follow the new set. This is also how a set nobody can confirm any more, one that protects folder keys and so cannot be discarded, is cleared.
- A backup taken before the new set still holds `keys.json` as it was, with the folder keys sealed for the old words; restoring it brings the old words back with it.

### Confirmed before any folder key (operator, 2026-10-29)

- `createFolderKey` refuses until the words are __confirmed__: the admin shown them has a consent for this set at the wording's current version (`recoveryWordsConfirmed()`, which asks ConsentManager each time; false without the wording page). Made is not enough, so no folder key is ever protected only by words nobody saved. A new wording version asks again, and until the confirmation is renewed no new folder key is made; existing ones are unaffected.
- `discardUnconfirmedWords(ctx)`: any holder of `admin-system` may discard a set the admin shown it has not confirmed (`POST /admin/backup/shared-folders/words/discard`, "Discard these words" on Admin → Backup), then make a new set and confirm it themselves. That is how a reminder nobody can clear (the words lost, or that admin's account deleted) is always cleared. Recorded as `shared-folder-words-discard` (on-failure refuse) before the words are removed. Refused for a confirmed set, and for a set any folder key is sealed for (`protectsFolders`): such a set was confirmed when the key was made, and discarding it would leave those keys without their recovery copy.

### The confirmation and the banner

Only the admin shown the words can confirm saving them; nobody else saw them. Until that admin's consent exists for this set at the wording's current version (`sharedFoldersWordsState`, `src/utils/sharedFoldersWordsConsent.ts`), holders of `admin-system` see a banner on the home page, `/admin` and `/admin/backup` (`res.locals.sharedFoldersWordsNotice`, set by `src/middleware/recoveryWordsNotice.ts`). The admin who saw the words is linked to `/consent?scope=shared-folders-recovery-words`; the others to Admin → Backup, which names who was shown them, and are told they can discard the set and make their own (unless it protects folder keys). It never holds a request, and never shows to a token, a share link or a proxy. The wording is the required page `shared-folders-recovery-words`; raising its `version:` asks again.

## Folders

A folder is the one fact this manager adds in slice 2: its name, with its key in `keys.json`. What it holds is kept by the page and file doors, as a vault's is ([private-stores.md](../private-stores.md#shared-folders)): `pages/vaults/shared-folders/<name>/`, the reserved container `shared-folders` (`SHARED_FOLDER_OWNER` in `src/utils/privateStorePath.ts`; no account may take the name), laid out as a vault, its `store.json` saying it is sealed and holding no wrapped key. A page in it is named `shared/<name>/<title>`, which is also its URL. So pages are written and versioned by `PageManager.savePage`, files by `AttachmentManager.uploadAttachment`, each folder keeps its own sealed page, file and search indexes, and nothing of it enters the site-wide index, the link graph or the shared render cache (`isSharedIndexable` is false for the name).

- __Making one.__ `createFolder(ctx, name)`: `admin-system`; refused until the recovery words are confirmed (it makes the key with `createFolderKey`); `shared-folder-create` is recorded first (on-failure refuse). On Admin → Backup, "Make a shared folder" (`POST /admin/backup/shared-folders/folders`). The shipped folders, `/shared/default` and `/shared/executive` (`SHIPPED_SHARED_FOLDERS`), are made when the words are saved and confirmed there (`ensureShippedFolders`), and at every start for a site whose words are confirmed (`ensureShippedFoldersAtBoot`, under the system context, after the required pages are seeded; best-effort, idempotent), so a site that confirmed its words before `/shared/executive` existed gets it on its next start ([#2095](https://github.com/jwilleke/ngdpbase/issues/2095)). A new folder is opened by administrators (`shared-folder-admin`) and read by the holders of the executive policy (`shared-folder-executive-read`), and by nobody else until a policy names it: the Shared folders screen writes one ([Who may read and file](#who-may-read-and-file-2126)). The screen makes folders too (`POST /admin/shared-folders`), as Admin → Backup's form does; both call `createFolder`.
- __Who opens it.__ Every read asks `shared-folder-read`, every add, edit or delete `shared-folder-file`, of the PDP with the caller's context, with the folder as the policy resource (type `shared-folder`, `shared/<name>`; `permitsInSharedFolder` in `src/utils/sharedFolderAccess.ts`). A folder lists no roles. The shipped policy `shared-folder-default` grants both on `shared/default` to `vault-owner`, the role every account is given: every signed-in user, never anonymous. The shipped policy `shared-folder-admin` grants `shared-folder-read` and `shared-folder-file` on `shared/*` to `admin` (operator, 2026-10-30, [#2095](https://github.com/jwilleke/ngdpbase/issues/2095)): an admin opens, lists, searches, adds, edits and deletes in every folder. `shared-folder-executive-read` grants `shared-folder-read` on `shared/*` and `shared-folder-executive-file` grants `shared-folder-file` on `shared/executive` to `executive`: an executive reads every folder and files only in `/shared/executive` (and `/shared/default`, as every account). A user's own vault is not a folder and none of these opens it. Because reading opens a folder's key, the page door asks `shared-folder-file` itself (`PageManager.savePage`, including a move from or to a folder, and `deletePage`; `assertMayFileInSharedFolder`), so no route that writes, the raw editor included, reaches the store for a reader who may not file. A share link is refused before the PDP is asked, and no share action is allowed in a folder: there are no share links into folders. The vault owner rule (`mayActInPrivateContainer`) admits nobody to the container, and the vault policy (`vault-owner-permissions`) never decides a folder page (`walkPageTiers` decides it by the folder permission alone).
- __The key.__ The server holds every folder's key (decision 1). It reaches the store I/O (`dekFor`) only for a context the PDP has permitted on that folder, remembered against that context object (`sharedFolderKeyFor`). The session middleware asks `foldersReadableBy` for every request's subject, so a grant removed ends access on the next request (decision 5); a boot job, a share link or an anonymous visitor nothing asked about reads nothing in a folder.
- __Routes.__ `GET /shared` (the folders the reader may open), `GET /shared/<name>` (its pages; `?new=<title>` opens the editor), and `/shared/<name>/<title>` with `edit`, `save`, `delete`, `history` and `diff`, each behind `WikiRoutes.sharedPageRoute`: the folder permission for the action, a 404 like a missing page when refused, then the same handlers and page door as any page. Files are uploaded onto a folder's page and served at `/attachments/<id>` to its readers. An upload whose page name is under `shared/<name>/` goes into folder `<name>`, whether or not the page is saved yet, never the public pool (operator, 2026-10-29): `AttachmentManager.uploadAttachment` takes the folder from the name, not from a saved page, and asks `shared-folder-file` on it before any bytes are stored, so a reader who may not file (an executive in any folder but `executive` and `default`) is refused.
- __Search.__ Site search adds the matches from each folder the reader may open, from its own sealed index (`PageManager.searchSharedFolderPages`, merged by `SearchManager`); a folder they may not open gives no row, title or count (decision 7).
- __Audit.__ Every read is recorded as `shared-folder-read` (on by default, `continue`): a page viewed or its history, by the route; a file served, by AttachmentManager. Writes are recorded by the doors that make them (`page-create`, `page-edit`, `page-delete`, `asset-upload`, `asset-delete`), each with who acted.

## Who may read and file (#2126)

Admin → Shared folders (`/admin/shared-folders`, `views/admin-shared-folders.ejs`; decision 8) lists every folder, makes one, and sets, role by role, who may read each folder and who may file in it. A folder lists no roles: the screen writes policies.

- `setFolderAccess(ctx, name, { read, file })` writes the site's own policies `shared-folder-access-<name>-read` (`shared-folder-read` on `shared/<name>`) and `shared-folder-access-<name>-file` (`shared-folder-file`), priority 60, allow, one `role` subject per role, into `ngdpbase.access.policies` through `ConfigurationManager.setProperty`. The prefix is the screen's: no shipped policy has it (`shared-folder-executive-read` is on `shared/*`). A policy under one of a folder's two ids that the screen did not write (an add-on's, or the site's own in any other shape, a deny say) is listed under the folder, marked, and saving that folder is refused, naming it, until it is renamed or removed in Admin → Configuration: never hidden, never overwritten, a deny never turned into an allow. A policy whose list is empty is removed; removing the site's last entry takes the key out of the custom file (`undefined`), never an empty list, which would replace every shipped policy.
- Only the site's entries (the custom layer, `getCustomProperty`) are written, every one kept as it is, an entry without an `id` included; the shipped and add-on policies stay beneath them, now and after a restart (`setProperty` leaves in force what a restart would merge).
- `admin-system`, asked of the PDP with the caller's context, by each route (`adminSharedFolders`, `adminSharedFoldersMake`, `adminSharedFolderAccess`) and again here. Changing access also asks `config-manage`, as every configuration write does: step-up, so a sign-in that is not fresh goes to `/auth/reauth` and comes back, and an agent token is refused. The route asks it, and `setFolderAccess` asks it again. Refused for a folder or a role that does not exist, and for `anonymous`: a folder is never public. The roles offered are `ngdpbase.roles.definitions` but `anonymous` (`grantableRoles()`).
- Recorded as `shared-folder-access-change` (who, the folder, the roles before and after for each; on-failure refuse) once the write has succeeded, under one lock so two admins saving at once on this screen lose neither's change. A write that fails is recorded as a failure, with the error. A record that cannot be written puts the policies back, so the change does not stand without it. ConfigurationManager records the configuration change as well. Nothing is written or recorded when nothing changed.
- `folderAccess(ctx, name)` returns the roles the screen's policies name and, for display, the other policies in force that reach the folder, matched by PolicyEvaluator's own `matchesAction` and `matchesResource`, as the PDP matches them (an empty action list or `*` reaches both permissions, deny included). Each is shown with its subjects as written (`role:editor`, `job:nightly`); one with no subjects is shown as everyone, anonymous visitors included. The PDP decides every access; the screen only shows.
- Access ends on the next request after a role is taken away (decision 5): `foldersReadableBy` asks the PDP for every request.

## Methods

| Method | For |
| --- | --- |
| `recoveryWordsInfo()` | the words as made (`wordsId`, `madeAt`, `shownTo`, `protectsFolders`), never the words; null before |
| `unavailableReason()` | why the keys cannot be used now, or null |
| `prepareRecoveryWords(ctx)` | make the words to show once; returns `{ token, words }` |
| `prepareNewRecoveryWords(ctx)` | make a new set to replace the saved one (`admin-system`, fresh sign-in); returns `{ token, words }` |
| `waitingWords(ctx)` | the words waiting for `ctx` (`token`, `replacing`), never the words; null when none |
| `pendingRecoveryWords(ctx, token, how)` | the waiting words to download or print, recorded first (`recovery-words-export`) |
| `saveRecoveryWords(ctx, token, typed)` | save them once all 12 are typed back (a new set re-seals every folder key); returns `wordsId` |
| `discardRecoveryWords(ctx)` | forget unsaved words (a set they were to replace stays) |
| `recoveryWordsConfirmed()` | whether the admin shown the words confirmed them, at the current wording |
| `discardUnconfirmedWords(ctx)` | discard saved words nobody confirmed (any admin) |
| `createFolderKey(ctx, folderId)` | make a folder's key, under the server key and for the words; needs confirmed words |
| `openFolderKey(ctx, folderId)` | the folder's key, with the server key, for a caller permitted `shared-folder-read` on it |
| `folderNames()` | the folders there are |
| `createFolder(ctx, name)` | make a folder: its key and its sealed place for pages (`admin-system`) |
| `ensureShippedFolders(ctx)` | make `/shared/default` and `/shared/executive` once the words are confirmed; returns those made now |
| `ensureShippedFoldersAtBoot()` | the same at start, under the system context; logs and never blocks start-up |
| `mayInFolder(ctx, action, name)` | the PDP's answer for a page or file action in a folder |
| `foldersReadableBy(ctx)` | the folders `ctx` may open; opens their keys to it |
| `recordRead(ctx, name, what)` | record a read (`shared-folder-read`) |
| `folderAccess(ctx, name)` | who the Shared folders screen lets read and file in a folder, and the other policies that reach it (`admin-system`) |
| `grantableRoles()` | the roles a folder's access may name: every role but `anonymous` |
| `setFolderAccess(ctx, name, access)` | write the folder's policies for the roles given, recorded once written (`admin-system`, fresh sign-in); returns whether anything changed |
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

- The Shared folders screen gives a folder to roles only. A policy naming a job, or a deny, is written in Admin → Configuration; the screen lists it under the folder but does not change it. Its list of other policies is for display and reads resource patterns as the evaluator does; the PDP decides.
- The screen's lock covers the screen only. Admin → Configuration writes `ngdpbase.access.policies` without it, so a save on each at the same moment loses one, with no error.
- No delegable permission to set a folder's access yet (decision 8: e.g. for a secretary); the screen is `admin-system` only.
- A shipped folder is made at start or when the words are saved. A wording version raised and then confirmed again on `/consent` makes no folder until the next start.
- A folder page's trash is never purged by age: retention runs under a job context, which holds no folder key, so a deleted folder page stays in the folder's trash until it is purged by hand. Deleting a whole folder (trash and purge, decision 10) is a later slice.
- Files reach a folder only by upload onto one of its pages; the attachment browser and the asset search list the requester's own vaults and the shared pool, not folders.
- A proxy acting for a user reaches the folders the PDP permits the subject it acts as, bounded by the grant's ceiling; no folder-specific proxy rule exists.
- Titles of folder pages are not struck from logs and audit records, unlike a vault's: the audit record names what was opened (decision 5).
- Later: rotation of the server key (decision 3), recovery with the words after a lost key (decision 4), add-on folders (decision 9), trash and purge (decision 10).
- A new set's fresh sign-in is asked as `config-manage`, the step-up permission Admin → Backup's key pages ask; there is no step-up permission of the words' own.
- A backup taken without the backup key leaves `.env` out, so its `keys.json` needs the recovery words on a new server (recovery is a later slice).

## See also

- [ConsentManager](ConsentManager.md#the-shared-folders-recovery-words), [BackupManager](BackupManager.md)
- [private-stores.md](../private-stores.md) — the key code reused here
- [backup-restore-guide.md](../guides/backup-restore-guide.md), [bootstrap-developer-guide.md](../guides/bootstrap-developer-guide.md)
- The help page Shared Folders Recovery Words (`required-pages/`, slug `shared-folders-recovery-words`)
