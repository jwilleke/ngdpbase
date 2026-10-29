# Shared folders

Folders owned by the organization, at `/shared/<name>`, opened by role or permission rather than by one user's key. Epic [#1775](https://github.com/jwilleke/ngdpbase/issues/1775). Always called "shared folders", never vaults. Terms follow [docs/GLOSSARY.md](../GLOSSARY.md) (Identities).

Status: design decided (operator, 2026-10-28). Slice 1 built ([#2124](https://github.com/jwilleke/ngdpbase/issues/2124)): the organization key, per-folder keys and the recovery words with their consent, in [SharedFolderManager](../managers/SharedFolderManager.md). Slice 2 built ([#2125](https://github.com/jwilleke/ngdpbase/issues/2125)): folders at `/shared/<name>` holding pages and files through the page and file doors, `shared-folder-read` / `shared-folder-file` scoped by the policy resource `shared/<name>`, `/shared/default` open to every signed-in user, per-folder sealed search and read audit ([SharedFolderManager, Folders](../managers/SharedFolderManager.md#folders)). Next: the admin screen ([#2126](https://github.com/jwilleke/ngdpbase/issues/2126)), then `/shared/executive` ([#2095](https://github.com/jwilleke/ngdpbase/issues/2095), [executive-hub.md](executive-hub.md)).

## Rules (from the epic)

- `/shared/default` is open to every signed-in user; every other folder only to the roles or permissions assigned to it.
- Owned by the organization, encrypted with an organization key, not any one user's.
- Never shared by link: no public or capability URLs; every access goes through the permission check.
- Every read and write is audited with who acted.

## Access is by permission (operator, 2026-10-29)

Access to a shared folder is decided by permissions, never roles. Two generic permissions, `shared-folder-read` and `shared-folder-file`, are scoped to a folder by the policy's resource (e.g. `shared/executive`), as page policies name a resource pattern. A folder lists no roles; the admin screen writes policies. Creating a folder adds no permission. Administrators read every folder (operator, 2026-10-29, [#2125](https://github.com/jwilleke/ngdpbase/issues/2125)): the shipped policy `shared-folder-admin-read` grants `shared-folder-read` on `shared/*` to the `admin` role, so an admin opens, lists and searches every folder; adding, editing and deleting in a folder (`shared-folder-file`) still needs a policy naming it. Folder page titles stay visible in the logs and the audit record.

Build order (each its own sub-issue of [#1775](https://github.com/jwilleke/ngdpbase/issues/1775)): 1 the organization key, per-folder keys and the recovery words; 2 folders holding pages and files, with permission checks, sealed search and audit; 3 the admin Shared folders screen; 4 `/shared/executive` ([#2095](https://github.com/jwilleke/ngdpbase/issues/2095)). Later: add-on folders, rotation, recovery with the words, trash and purge.

## Decisions (operator, 2026-10-28)

Each is also a comment on [#1775](https://github.com/jwilleke/ngdpbase/issues/1775).

- 1 __Where the key lives and how it is unlocked.__ A server-held key, `NGDPBASE_SHARED_FOLDERS_KEY`, in the instance `.env` beside the backup, database and credentials keys. Generated on first start, read at startup (no one types anything), and added to the backup-key confirmation in Admin → Backup so its loss is loud. It protects against a stolen backup or data volume, not against someone who already controls the server, the same protection the database and credentials have.
- 2 __One key per folder.__ Each folder has its own random key (DEK) wrapped under the server key, reusing the private-store code (`src/utils/privateStoreCrypto.ts`), not a second scheme.
- 3 __Rotation.__ On demand only, never scheduled. An admin action in Admin → Backup makes a new server key, rewraps every folder key, and writes it to `.env`; a failure part-way leaves the old key working. The new key needs re-confirming at once, loudly. Old backups need the key they were made with (as the backup key, [#1723](https://github.com/jwilleke/ngdpbase/issues/1723) D3).
- 4 __Recovery.__ 12 recovery words (BIP39), as for personal vaults, shown once when the key is first made, kept offline (e.g. with the board's papers). Each folder key is wrapped under both the server key and the words. With the server key lost, an admin enters the words in Admin → Backup; the server makes a new key and rewraps every folder key. Rotation keeps the words; making new words retires the old ones. Saving the words is a recorded consent (ConsentManager), as for personal vaults ([#1928](https://github.com/jwilleke/ngdpbase/issues/1928)): the admin shown them must acknowledge before finishing, and the record names that admin, the time and the wording version. Until one exists, admins see a banner, never a session lock.
- 5 __Losing a role.__ Access ends on the next request. Users never hold a folder key, so nothing is re-keyed. Copies already downloaded cannot be pulled back; the audit log records what was opened.
- 6 __Contents.__ Pages and files, as a personal vault holds them, through the existing page and asset doors (PageManager, AttachmentManager), so search, versions and audit behave as everywhere else.
- 7 __Search.__ Each folder keeps its own sealed search index, as a private store does. Site search includes hits from the folders the user may read and nothing at all (no titles, no hidden-result counts) from the others. Folder pages never enter the site-wide index or the shared render cache.
- 8 __Who creates folders and sets access.__ Admins only, for now, on a "Shared folders" screen under `/admin`: create, and per folder which roles or permissions read and which add or edit. Every create and access change is audited. A delegable permission (e.g. for a secretary) can come later.
- 9 __Add-on folders.__ An add-on declares its folders in its manifest, as it declares shims and receivers, naming which of its own permissions read and which file into each. Core creates the folder when the add-on first starts, owned by the organization with the add-on recorded as its source. An admin can still change its access. The add-on writes through the normal doors and cannot create a folder it did not declare.
- 10 __Ending a folder.__
  - The user who set it up leaves: nothing changes; deactivating or deleting the account ([#1765](https://github.com/jwilleke/ngdpbase/issues/1765)) leaves the folder alone.
  - An admin deletes it: to the trash, restorable for a configured number of days, then purged, destroying its key. Both steps audited. A backup taken before the purge still holds the folder and its key, so restoring it brings the folder back; old backups age out on their own schedule.
  - The add-on that declared it is disabled or removed: the folder stays, read-only, until an admin deletes it, hands it to admin-set access, or keeps it as an archive (fits [#1490](https://github.com/jwilleke/ngdpbase/issues/1490)).

## Related

- [#1382](https://github.com/jwilleke/ngdpbase/issues/1382) — private stores (the per-store key code reused here).
- [#1762](https://github.com/jwilleke/ngdpbase/issues/1762) — proxy access.
- [#1462](https://github.com/jwilleke/ngdpbase/issues/1462) / [#1622](https://github.com/jwilleke/ngdpbase/issues/1622) — the page door.
- [#2092](https://github.com/jwilleke/ngdpbase/issues/2092) — the Executive Hub, whose step 3 is the first folder.
