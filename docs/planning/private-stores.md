---
title: Private stores
status: design ratified
lastModified: 2026-09-15
epic: 1382
---

# Private stores

Decision record for [epic #1382](https://github.com/jwilleke/ngdpbase/issues/1382). This file is the single source of truth for *what was decided*; child issues are the work items. Do not copy these tables into `TODO.md` or into command files.

The epic title talks about "record-level isolation." The unit is not a row in `page-index.json` and not a FHIR resource. It is a __per-user store__ — a directory under `pages/private/{user}/{store}/` that may hold pages, ordinary files, and later a database file. Encryption and sharing are __per store__, chosen by the user.

YourPHR is __out of this epic__. It will be a later collection of addons that use this store through the existing addon contract ([addons developer guide](../guides/addons-developer-guide.md)).

Predecessor: [plan-private-folder.md](./plan-private-folder.md) (shipped the `private/{creator}/{uuid}.md` layout). This work adds a `{store}` segment, optional encryption, and moves binaries into the store.

## Layout

```text
pages/private/{user}/user-keys.json        # wrapped user KEK (password + recovery)
pages/private/{user}/user-index.json       # catalog of encrypted-store pages (user KEK)
pages/private/{user}/user-versions.json    # history catalog (user KEK)
pages/private/{user}/user-trash.json       # trash catalog (user KEK)
pages/private/{user}/{store}/              # one store
pages/private/{user}/{store}/store.json    # encrypt on/off; wrapped DEK if encrypt on
pages/private/{user}/{store}/{uuid}.md     # live pages
pages/private/{user}/{store}/versions/     # page version blobs
pages/private/{user}/{store}/deleted/      # trash blobs
pages/private/{user}/{store}/attachments/  # every non-page file: {sha256}.ext
```

This tree sits under the existing pages `storagedir` (`${SLOW_STORAGE}/pages` in shipped config). Folder names and catalog filenames are `ngdpbase.page.provider.filesystem.*` keys in [app-default-config.json](../../config/app-default-config.json). There is no second `${SLOW_STORAGE}/private` root and private page blobs do not live on `FAST_STORAGE`.

- Today's private pages migrate to store id `default`.
- Named stores use the __addon slug__ (`yourphr` → `private/{user}/yourphr/`). `default` is core, not an addon.
- Nothing except store directories and the user-level catalogs lives directly in `private/{user}/`.

## Access

Decided 2026-09-15. `pages/private/{user}/` and every store below it is a __security container owned by that user__. Nobody else has access to anything in it — pages, titles, files, history, trash — __unless the user delegates permissions__. This holds whether or not the store is encrypted.

- __No admin bypass.__ The admin wiki role gets no read, list, search, edit, or upload access to another user's private folder. This supersedes the admin read in [plan-private-folder.md](./plan-private-folder.md) (1.5, 1.12).
- Encryption is extra protection on top, not the access rule. An unencrypted store is exactly as closed to other users as an encrypted one.
- Operator filesystem access (instance backups, disk) is outside the wiki and is not a delegation. Only encryption protects against it.
- The user does not grant access; the user __delegates permissions__. A delegate acts with a subset of the owner's own permissions on the container, and only while the owner still holds them — the existing token-share model (the issuer must still hold the action). Nothing is delegated by role.
- A delegate only reaches a store whose Share switch is on ([#1388](https://github.com/jwilleke/ngdpbase/issues/1388)). Until that switch exists every store is Share Off, so only the owner acts in it. An encrypted store also needs its DEK, which a delegate carries only once a share can wrap one.
- Allow and deny go through the one door ([security-posture.md](../security-posture.md) P2): `canAccess` on the page, decided at ACLManager's private-page check (Tier 0, `PageManager.checkPrivatePageAccess`), with the capability from `hasPermission`. A refusal is recorded as `authorization-deny` like every other. A file in a store, which is not a page, gets the same rule through `ACLManager.canAccessPrivateContainer`. The rule itself is one function, `mayActInPrivateContainer` (`src/utils/privateStoreAccess.ts`): an authenticated session of the owner, a job acting for the owner, or a share the owner issued once the store's Share switch is on.
- Where it applies: page views and edits, page lists, both search providers (a private page's frontmatter `audience` grants nothing), uploads onto a private page, private-file serving (the file's `creator`, not whoever may view a linked page), and admin bulk keyword changes (another user's private page is left unchanged). When privacy cannot be established, the check refuses.

## Per-store switches

| Switch | Meaning |
|---|---|
| Encrypt | Off: plaintext files (today's private pages). On: whole store ciphertext, one store DEK. |
| Share | Off: nothing leaves except that user. On: existing __token-share__ only, minted by that user. |

The two are independent. The whole store is encrypted or it is not — no per-file and no field-level encryption of global `page-index.json`.

PHR-style addons should __default encrypt on__ and warn at least once if the user turns it off. `default` may stay off so existing private pages do not silently require a mnemonic.

### The store kind, and where it is defined (2026-09-19)

A __store kind__ is instance-wide; a user's directory under it is that user's security container. Encryption belongs to the __kind__, set by whoever owns it — the admin for `default`, the addon for its own store. Bob's and Jane's copies of a kind are __both__ encrypted or __both__ not; a user never chooses, and nobody can turn it off for one user. There is therefore no per-store "required" flag: the kind's definition is the rule.

__Store kinds are defined in configuration__, outside the provider namespace (`ngdpbase.stores.{id}.*`): which kinds exist, whether a kind is encrypted, and who owns it.

```json
"ngdpbase.stores.default.encrypt": false,
"ngdpbase.stores.default.owner": "admin",
"ngdpbase.stores.yourphr.encrypt": true,
"ngdpbase.stores.yourphr.owner": "yourphr"
```

`owner` is `admin`, or an addon's __slug__ — the canonical addon identity from its `package.json` ([#927](https://github.com/jwilleke/ngdpbase/issues/927)), the same id as the registry key and `ngdpbase.addons.<slug>.enabled`. `admin` is therefore a __reserved slug__: an addon may not claim it, and one that does is refused at load (2026-09-19).

Changing a kind's setting governs __stores created afterwards__; switching an existing store is a whole-store migration and is not offered.

- __Layout keys stay with the provider__ (`ngdpbase.page.provider.filesystem.*`: `privateroot`, `versionsdir`, `deleteddir`, `attachmentsdir`, catalogue filenames). They describe how this filesystem provider lays bytes out; another provider would not have a `deleted` folder. A store definition never names a path — the provider maps a store id to a location.
- __`store.json` keeps per-user state and key material only__: that this user's copy is encrypted, and the wrapped DEK. Keys are data, never configuration.

### Layout stays user-first (2026-09-19)

`private/{user}/{store}/` stays as [#1383](https://github.com/jwilleke/ngdpbase/issues/1383) migrated it; `store.{id}/{user}/` was considered and rejected.

Takeout decides it. Everything of one user is one subtree — wrapped keys, catalogues, and every store's pages, versions, trash and files — so a user's takeout is "copy this directory" and erasure is "delete this directory". For an encrypted store the bundle is self-contained: ciphertext travels with that user's own wrapped keys, decryptable with their password or their 12 words, without the instance ([#1387](https://github.com/jwilleke/ngdpbase/issues/1387)).

Store-first would suit per-kind operations (uninstall an addon and drop its store for everyone, back up or count one kind), but the user's keys and catalogues would have no natural home, splitting a person's data across two shapes and making takeout and erasure a walk that can miss something. Those per-kind operations are admin-side, rare, and a directory walk here.

### Who decides encryption (2026-09-18)

- __The store kind's owner decides__, in the kind's definition (see above). The end user is never asked an abstract "encrypt?" question — by then the answer follows from what the store is for.
- __The `default` store is the admin's call__, instance-wide.
- __Every other store is created by an admin or by an addon__: those two are the only creators.
- __Sensitive or regulated data MUST be encrypted.__ An addon holding it declares encryption __required__, and no one can turn it off for that store.
- The admin decides whether encrypted stores are offered on this instance at all.
- Turning encryption on or off for an existing store is __not offered__ at first: each is a whole-store migration. It can come later if anyone asks.

`store.json` carries the per-user state: `encrypt`, and the wrapped DEK once the user has keys. The kind's owner and its encryption policy live in the kind's definition in configuration, not in each user's copy. An addon declares its store kind; today nothing in the manifest can say so.

### Recovery words: at first login after an encrypted store exists (2026-09-18)

A store created for a user by an admin or an addon exists before that user has any keys, so its DEK cannot be wrapped yet. The store is written with `encrypt: true` and __no wrapped DEK__ — a pending state.

At the user's next __password__ login, the app sees a pending encrypted store and no `user-keys.json`: it creates the user KEK from that password, generates the 12 recovery words, wraps the store's DEK, and shows the words __once__, with the warning. Until that login the store holds no content, because every write into it is already refused without the key.

The words are never generated at store-creation time (the creator is not the keyholder) and never re-shown later; a user who loses both password and words loses that store's contents, and no admin can recover them.

## Keys

Do not encrypt the folder with the login password. Password change and recovery need a stable store key.

| Key | Role |
|---|---|
| User KEK | From the login password; 12-word BIP39 wrap is recovery for this. Encrypts `user-index.json` / version / trash catalogs and wraps each encrypted store's DEK. |
| Store DEK | Only if that store has encrypt on. Encrypts every byte in `private/{user}/{store}/`. |

Login unwraps the user KEK, decrypts the user catalogs, merges them __in memory__ with global `page-index.json`. Never write decrypted private titles back to the global file. Logout drops the merge.

Unencrypted `default/` stays in global `page-index.json` as today.

Twelve-word recovery is the user's property: copy, download, print, paste into email (including to a lawyer). Warn __at least once__ whenever the words are shown; __do not obstruct__. The app never emails the words itself. Never log password, words, DEK, or KEK.

Admin wiki role does __not__ unwrap a sealed store (and has no access to an unsealed one either — see Access). Lost password __and__ lost words → backup __restores__ the files and they stay __unreadable__.

### Not on PageManager

There can be more than one PageManager (or page provider / engine) in a process. Encryption and keys are never fields on PageManager, never express-session JSON, and never field-level in `page-index.json`. They live only on:

1. __The store__ — encrypt on/off is a property of `pages/private/{user}/{store}/`. Ciphertext lives in that directory. Whole store or not.
2. __The user__ — the KEK is the user's (password wrap + 12-word recovery). It wraps each encrypted store's DEK.
3. __The unlocked session bag__ — DEK/KEK bytes exist in server memory keyed by session id (a process-level Map), so every PageManager/provider in the process uses the same unlock. Logout drops the bag entry. The bag is reached from the caller's context, never ambiently (see Context, below).

This is not client-side zero-knowledge: the server holds those bytes only while that session is unlocked.

This epic does __not__ add a RecordManager that talks to all providers. Architecture ([ARCHITECTURE.md](../../ARCHITECTURE.md), [MANAGERS-OVERVIEW.md](../architecture/MANAGERS-OVERVIEW.md)): one concern → one manager → its provider. Pages write through PageManager; files through AttachmentManager. Keys stay on the store, the user KEK, and the process session bag (`src/utils`). RecordManager is a later YourPHR/shared-DB idea, not [#1382](https://github.com/jwilleke/ngdpbase/issues/1382).

We still want __one__ implementation of key unwrap and encrypt-on-write: `src/utils/privateStoreCrypto.ts` + `privateStoreUnlock.ts` (session bag). PageManager (pages) and AttachmentManager (files) are the HTTP/work doors; they call those helpers. Providers encrypt bytes when given a DEK; they do not invent a second policy. Routes and scripts must not unwrap keys or write sealed stores around the managers ([#1389](https://github.com/jwilleke/ngdpbase/issues/1389)). Duplicating wrap/assert in WikiRoutes, VersioningFileProvider, and AttachmentManager independently is the defect we are avoiding — not solved by a manager that talks to search, users, or audit.

### Context, not ambient session

Decided 2026-09-15, under [security-posture.md](../security-posture.md) P1 (every call that decides, records, or acts takes a context, mandatory and positional; `AsyncLocalStorage` is refused) and [audit-posture.md](../audit-posture.md).

| Step | Decides, records, or acts? | Takes |
|---|---|---|
| Unlock at login, lock at logout, re-wrap on password change | Acts | the context |
| Look up which store keys this caller holds | Decides — holding the DEK is what lets an encrypted read or write proceed | the context |
| Read or write an encrypted page or file | Acts | the context |
| Encrypt or decrypt bytes with a given key (`privateStoreCrypto.ts`) | Neither — pure computation | data (key and bytes) |

- The request context carries an opaque __session handle__, set only where the request subject is built. It is provenance — which session this came from — like `ipAddress` or `viaToken`, resolved live at use: after logout the bag is gone, the lookup finds nothing, and the action is refused. It is not a snapshot of authority.
- The handle is __random, not the session id__ (decided 2026-09-15): created at password login, stored on the session as `privateStoreHandle`, the key the process bag is looked up by, and dropped at logout. The subject reaches views, addon hooks and logs; the session id is what the session store and session revocation key on, while the handle opens only the key lookup, and it does not change when the session id is regenerated. A bearer-token or share request carries no handle.
- The context never carries key bytes. Keys stay in the process bag, reached by handle, so a forwarded or spread context cannot leak them.
- The handle never goes into an audit record; `actorOf()` names its fields and must not gain this one.
- A `JobContext` has no handle, so a background job cannot read or write an encrypted store — the server holds those bytes only while a session is unlocked.
- The key lookup takes the context (`dekFor(ctx, owner, store)`) and requires the bag to belong to the store's owner. `AsyncLocalStorage` and `runWithPrivateStoreSession` are gone (removed 2026-09-16): there is no ambient slot to fall back on, so a caller with no context reaches no keys.
- Page operations — `getPage`, `getPageContent`, `getPageMetadata`, `getPageByUUID`, `getPageBySlug`, `pageExists`, `savePage`, `deletePage`, `restoreVersion` — take the context positionally at PageManager and at the page provider. The optional `options.actorContext` is gone. The provider decides from the context it is handed, not from the page's `author` metadata.
- A caller with no person behind it says so rather than borrowing one: boot and seeding pass a `JobContext`, index and catalog builds pass the anonymous subject (public pages only), and `ApiContext` carries the request's subject for addons to forward (`ctx.subject`) instead of rebuilding one from its fields.

### Store placement is on BasePageProvider

Decided 2026-09-15. `BasePageProvider` is the base of every page provider (`FileSystemProvider`, `VersioningFileProvider`, a later database provider), so what every page provider needs is written once there — not per subclass, and not on `BaseProvider`, which carries only what every provider shares.

| Piece | Home |
|---|---|
| Folder names and root (`storagedir`, `privateroot`, `defaultstoreid`, `versionsdir`, `deleteddir`, `attachmentsdir`) | `ConfigurationManager` — the only source, for pages and attachments alike |
| Joining them into paths, with store-id validation inside the join (a plain slug, never a path) | `src/utils/privateStorePath.ts`, used by both sides |
| Which store a page belongs to — one rule per save (the store named in the save if valid, else the store in the index, else `defaultstoreid`) — and the encrypted-store write check, taking the `ActorContext` | `BasePageProvider` |
| Pages as files inside the store (`{uuid}.md`, `versions/`, `deleted/`) | `FileSystemProvider`, inherited by `VersioningFileProvider` |
| Which store an attachment goes to | `AttachmentManager`: the page owner's store, or the uploader's for a page-less private upload |
| Writing the attachment's bytes to `{store}/attachments/` | `BasicAttachmentProvider`, path from configuration and the same helpers |
| Who may act in a container | ACLManager Tier 0 via `canAccess` (Access, above) |

A save decides its store once: `VersioningFileProvider` resolves it and hands it to `FileSystemProvider`, so the page file, its history, and the encryption check can never name different stores.

A save that names a different store for a page that already exists is __refused__ (decided 2026-09-15). Moving a page and its history between stores is a feature of its own — for an encrypted store it means re-encrypting under another DEK — and is not part of this epic.

## Files in the store

The store is the container. PDFs, images, DICOM, FHIR JSON/XML, and other imports land in `private/{user}/{store}/attachments/`, not `attachments/private/{user}/`. NCM still applies only to markdown that is a page. Existing import/upload doors stay; the __destination__ is the store.

Decided 2026-09-15 ([#1386](https://github.com/jwilleke/ngdpbase/issues/1386)):

- Files live in `{store}/attachments/`, never loose in the store root beside `{uuid}.md`. An uploaded `.md` file in the root would be scanned as a page.
- The page scan skips `attachments/` as it skips `versions/` and `deleted/`.
- Flat and content-addressed (`{sha256}.ext`), same as the public pool. No per-type folders (`images/`, `dicom/`, `json/`); type is attachment metadata (`encodingFormat`).
- The name is `attachments/`, not `blobs/` — it matches `AttachmentManager` and the public pool, and "blobs" already means version/trash content here.
- Anything an addon owns that is not an attachment (e.g. a later database file) gets its own sibling folder through that addon's provider.

- The folder name is config key `ngdpbase.page.provider.filesystem.attachmentsdir` (default `attachments`), beside `versionsdir` / `deleteddir` (approved 2026-09-15).

Global `attachment-metadata.json` must not list names of files in a __sealed__ store.

### When an attachment is private

Decided 2026-09-15 ([#1398](https://github.com/jwilleke/ngdpbase/issues/1398)). The rule lives at one door, `AttachmentManager.uploadAttachment`, so the upload dialog, the page-import image fetch, and import sidecar files all follow it.

| Case | Result |
|---|---|
| New upload onto a private page | Always private. The page forces it; an unticked box does not make it public. Lands in the __page author's__ store, the page's own store. Only the owner, or a delegate of the owner, can upload onto it. |
| Existing non-private asset attached or linked to a private page | Stays public. Linking never moves or re-flags an existing attachment. |
| Upload with no page, or onto a public page | The upload dialog's Private checkbox decides. Ticked: the uploader's store. Unticked: public attachments pool. |

__The author owns the page and every attachment uploaded onto it__ (decided 2026-09-15). A delegate who uploads onto the owner's private page adds to the owner's store, never their own; anyone else is refused (see Access). A page-less private upload belongs to the uploader. Owner is the page-index `creator` (the page's `author`), not the last editor.

## Backups

- __Admin__ backups include `private/{user}/` as it sits on disk. Encrypted stores stay encrypted. Admin is assumed to run backups; they are not a keyholder.
- __Users__ may download/backup their data, encrypted or not — their choice. Warn at least once on a plaintext download; do not obstruct. Users own their keys.
- Version/trash __catalogs__ at user level; __blobs__ in the store so a share token wrapping one store DEK can include that store's history only.

## Audit

Use the existing audit system. Do not add a second logger. Standing rules for write doors, secrets in records, manager versus provider, and bypasses: [audit-posture.md](../audit-posture.md) and [security-posture.md](../security-posture.md).

`page-read` already has an emitter (`auditPageView` on the view route) and ships `enabled: false` because it is volume ([#1203](https://github.com/jwilleke/ngdpbase/issues/1203)). `PageManager.getPage` is the wrong door (internal reads). Store pages viewed in the wiki use that route; an instance that wants view records turns the __configuration__ switch on.

Mutations, shares, exports, and instance backups already have event names. A whole-store user download only needs a new `{target}-{action}` if it is not already `page-export` or `backup-create`. Never put keys in a record.

## Addons and sqlite

Addons register as they do today (`package.json` `ngdpbase` manifest, `register(engine, config)`, slug identity). Store id = slug. Config stays under `ngdpbase.addons.<slug>.*`.

sqlite/SQLCipher is a __database provider__ (named in PageManager docs, not implemented). This epic's filesystem store does not wait on it. A later provider may place a DB file *in* the store directory.

## Out of scope

- YourPHR product, FHIR semantics, a bundled PHR app
- Database / SQLCipher provider
- Clinician access except user-minted share tokens
- Field-level encryption of `page-index.json`
- A second audit stack
- Per-file encryption inside a store

## Child issues

Filed under [epic #1382](https://github.com/jwilleke/ngdpbase/issues/1382). Each issue is one concern.

| Issue | Concern | Blocked by |
|---|---|---|
| [#1383](https://github.com/jwilleke/ngdpbase/issues/1383) | Path `{store}/` + migrate to `default/` | — |
| [#1384](https://github.com/jwilleke/ngdpbase/issues/1384) | User KEK, store DEK, 12-word recovery | [#1383](https://github.com/jwilleke/ngdpbase/issues/1383) |
| [#1385](https://github.com/jwilleke/ngdpbase/issues/1385) | `user-index` / version / trash catalogs | [#1383](https://github.com/jwilleke/ngdpbase/issues/1383), [#1384](https://github.com/jwilleke/ngdpbase/issues/1384) |
| [#1386](https://github.com/jwilleke/ngdpbase/issues/1386) | Files live in the store | [#1383](https://github.com/jwilleke/ngdpbase/issues/1383) |
| [#1387](https://github.com/jwilleke/ngdpbase/issues/1387) | Admin backup as-on-disk; user download | [#1383](https://github.com/jwilleke/ngdpbase/issues/1383) |
| [#1388](https://github.com/jwilleke/ngdpbase/issues/1388) | Token-share + per-store share flag | [#1383](https://github.com/jwilleke/ngdpbase/issues/1383) |
| [#1389](https://github.com/jwilleke/ngdpbase/issues/1389) | Save/import/upload through managers | [#1383](https://github.com/jwilleke/ngdpbase/issues/1383) |
| [#1391](https://github.com/jwilleke/ngdpbase/issues/1391) | Unlock user KEK into the process session bag on password login | [#1384](https://github.com/jwilleke/ngdpbase/issues/1384) |
| [#1392](https://github.com/jwilleke/ngdpbase/issues/1392) | Drop the session bag on logout | [#1391](https://github.com/jwilleke/ngdpbase/issues/1391) |
| [#1393](https://github.com/jwilleke/ngdpbase/issues/1393) | Password change re-wraps the KEK envelope; mnemonic wrap unchanged | [#1384](https://github.com/jwilleke/ngdpbase/issues/1384) |
| [#1394](https://github.com/jwilleke/ngdpbase/issues/1394) | Refuse sealed-store write without DEK (PageManager + AttachmentManager doors; relates to [#1391](https://github.com/jwilleke/ngdpbase/issues/1391)) | [#1384](https://github.com/jwilleke/ngdpbase/issues/1384) |
| [#1396](https://github.com/jwilleke/ngdpbase/issues/1396) | Explicit `private` / `store` on `uploadAttachment` | [#1386](https://github.com/jwilleke/ngdpbase/issues/1386) |
| [#1398](https://github.com/jwilleke/ngdpbase/issues/1398) | Upload dialog Private checkbox; new upload onto a private page is forced private | [#1396](https://github.com/jwilleke/ngdpbase/issues/1396) |

Implement [#1383](https://github.com/jwilleke/ngdpbase/issues/1383) first. [#1384](https://github.com/jwilleke/ngdpbase/issues/1384) is the key primitive; login, logout, password re-wrap, and refuse-write are separate children.
