---
title: Private stores
status: design ratified
lastModified: 2026-09-14
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
pages/private/{user}/{store}/              # live pages, files, version blobs, trash blobs
pages/private/{user}/{store}/store.json    # encrypt on/off; wrapped DEK if encrypt on
```

- Today's private pages migrate to store id `default`.
- Named stores use the __addon slug__ (`yourphr` → `private/{user}/yourphr/`). `default` is core, not an addon.
- Nothing except store directories and the user-level catalogs lives directly in `private/{user}/`.

## Per-store switches

| Switch | Meaning |
|---|---|
| Encrypt | Off: plaintext files (today's private pages). On: whole store ciphertext, one store DEK. |
| Share | Off: nothing leaves except that user. On: existing __token-share__ only, minted by that user. |

The two are independent. The whole store is encrypted or it is not — no per-file and no field-level encryption of global `page-index.json`.

PHR-style addons should __default encrypt on__ and warn at least once if the user turns it off. `default` may stay off so existing private pages do not silently require a mnemonic.

## Keys

Do not encrypt the folder with the login password. Password change and recovery need a stable store key.

| Key | Role |
|---|---|
| User KEK | From the login password; 12-word BIP39 wrap is recovery for this. Encrypts `user-index.json` / version / trash catalogs and wraps each encrypted store's DEK. |
| Store DEK | Only if that store has encrypt on. Encrypts every byte in `private/{user}/{store}/`. |

Login unwraps the user KEK, decrypts the user catalogs, merges them __in memory__ with global `page-index.json`. Never write decrypted private titles back to the global file. Logout drops the merge.

Unencrypted `default/` stays in global `page-index.json` as today.

Twelve-word recovery is the user's property: copy, download, print, paste into email (including to a lawyer). Warn __at least once__ whenever the words are shown; __do not obstruct__. The app never emails the words itself. Never log password, words, DEK, or KEK.

Admin wiki role does __not__ unwrap a sealed store. Lost password __and__ lost words → backup __restores__ the files and they stay __unreadable__.

### Not on PageManager

There can be more than one PageManager (or page provider / engine) in a process. Encryption and keys are never fields on PageManager, never express-session JSON, and never field-level in `page-index.json`. They live only on:

1. __The store__ — encrypt on/off is a property of `pages/private/{user}/{store}/`. Ciphertext lives in that directory. Whole store or not.
2. __The user__ — the KEK is the user's (password wrap + 12-word recovery). It wraps each encrypted store's DEK.
3. __The unlocked session bag__ — DEK/KEK bytes exist in server memory keyed by session id (a process-level Map), so every PageManager/provider in the process uses the same unlock. Logout drops the bag entry.

This is not client-side zero-knowledge: the server holds those bytes only while that session is unlocked.

This epic does __not__ add a RecordManager that talks to all providers. Architecture ([ARCHITECTURE.md](../../ARCHITECTURE.md), [MANAGERS-OVERVIEW.md](../architecture/MANAGERS-OVERVIEW.md)): one concern → one manager → its provider. Pages write through PageManager; files through AttachmentManager. Keys stay on the store, the user KEK, and the process session bag (`src/utils`). RecordManager is a later YourPHR/shared-DB idea, not [#1382](https://github.com/jwilleke/ngdpbase/issues/1382).

We still want __one__ implementation of key unwrap and encrypt-on-write: `src/utils/privateStoreCrypto.ts` + `privateStoreUnlock.ts` (session bag). PageManager (pages) and AttachmentManager (files) are the HTTP/work doors; they call those helpers. Providers encrypt bytes when given a DEK; they do not invent a second policy. Routes and scripts must not unwrap keys or write sealed stores around the managers ([#1389](https://github.com/jwilleke/ngdpbase/issues/1389)). Duplicating wrap/assert in WikiRoutes, VersioningFileProvider, and AttachmentManager independently is the defect we are avoiding — not solved by a manager that talks to search, users, or audit.

## Files in the store

The store is the container. PDFs, images, FHIR JSON/XML, and other imports land in `private/{user}/{store}/`, not `attachments/private/{user}/`. NCM still applies only to markdown that is a page. Existing import/upload doors stay; the __destination__ is the store.

Global `attachment-metadata.json` must not list names of files in a __sealed__ store.

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

Implement [#1383](https://github.com/jwilleke/ngdpbase/issues/1383) first. [#1384](https://github.com/jwilleke/ngdpbase/issues/1384) is the key primitive; login, logout, password re-wrap, and refuse-write are separate children.
