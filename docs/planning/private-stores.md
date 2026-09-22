---
title: Private stores
status: design ratified
lastModified: 2026-09-22
epic: 1382
---

# Private stores

Decision record for [epic #1382](https://github.com/jwilleke/ngdpbase/issues/1382). This file is the single source of truth for *what was decided*; child issues are the work items. Do not copy these tables into `TODO.md` or into command files.

__This file is temporary and is deleted when the epic closes__ ([#1416](https://github.com/jwilleke/ngdpbase/issues/1416)). It is the working source of truth __while the epic is being developed__ — a record of intentions, not of shipped behaviour. At the close of #1382 it is replaced by `docs/private-stores.md` (developer and operator, written from the code that actually exists) and `required-pages/Using-private-stores.md` (end users), and then removed. Nothing here should be cited as how the system behaves.

The epic title talks about "record-level isolation." The unit is not a row in `page-index.json` and not a FHIR resource. It is a __per-user store__ — a directory under `pages/private/{user}/{store}/` that may hold pages, ordinary files, and later a database file. Encryption and sharing are __per store__: encryption is decided by the store kind's owner (see "Who decides encryption"), sharing by the user who owns the store ([#1388](https://github.com/jwilleke/ngdpbase/issues/1388)).

YourPHR is __out of this epic__. It will be a later collection of addons that use this store through the existing addon contract ([addons developer guide](../guides/addons-developer-guide.md)).

Predecessor: [plan-private-folder.md](./plan-private-folder.md) (shipped the `private/{creator}/{uuid}.md` layout). This work adds a `{store}` segment, optional encryption, and moves binaries into the store.

## Layout

```text
pages/private/{user}/user-keys.json        # wrapped user KEK (password + recovery)
pages/private/{user}/{store}/              # one store — fully self-contained
pages/private/{user}/{store}/store.json    # kind, encrypt, created; wrapped DEK if encrypt on
pages/private/{user}/{store}/…             # the store's own indexes: pages, files, versions, trash
                                           #   (sealed with the store DEK when encrypt is on)
pages/private/{user}/{store}/{uuid}.md     # live pages
pages/private/{user}/{store}/versions/     # page version blobs
pages/private/{user}/{store}/deleted/      # trash blobs
pages/private/{user}/{store}/attachments/  # every non-page file: {uuid}.ext
```

The user-level catalogs (`user-index.json`, `user-versions.json`, `user-trash.json`) that shipped with [#1385](https://github.com/jwilleke/ngdpbase/issues/1385) are superseded by per-store indexes — see "Stores are self-contained" below. Index file names are settled in [#1400](https://github.com/jwilleke/ngdpbase/issues/1400) (files) and [#1454](https://github.com/jwilleke/ngdpbase/issues/1454) (pages, versions, trash, search).

This tree sits under the existing pages `storagedir` (`${SLOW_STORAGE}/pages` in shipped config). Folder names and catalog filenames are `ngdpbase.page.provider.filesystem.*` keys in [app-default-config.json](../../config/app-default-config.json). There is no second `${SLOW_STORAGE}/private` root and private page blobs do not live on `FAST_STORAGE`.

- Today's private pages migrate to store id `default`.
- Named stores use the __addon slug__ (`yourphr` → `private/{user}/yourphr/`). `default` is core, not an addon.
- Nothing except store directories and `user-keys.json` lives directly in `private/{user}/`.

### Stores are self-contained (2026-09-22)

Decided by the operator while planning [#1400](https://github.com/jwilleke/ngdpbase/issues/1400): __a store must be fully self-contained.__ Backing it up, deleting it or sharing it carries everything about it — including its indexes.

- __Every private store, encrypted or not, keeps its own indexes inside its own folder.__ Sealed with the store DEK when the store is encrypted, plain JSON when it is not. No index mixes sealed and plain entries.
- __The global indexes hold public items only.__ `page-index.json`, `attachment-metadata.json` and the shared search index never list a private item. This supersedes "Unencrypted `default/` stays in global `page-index.json`" (Keys) and the user-level catalogs of [#1385](https://github.com/jwilleke/ngdpbase/issues/1385).
- ~~At login the owner's session reads its stores' indexes and merges them in memory; logout drops the merge.~~ Revised 2026-09-22 ([#1454](https://github.com/jwilleke/ngdpbase/issues/1454)): a store's indexes are __read from the store when a request needs them__, for the requester's own stores only — no copy in the session. It works the same for sessions, API tokens and background jobs, never goes stale across two browsers, and holds nothing in memory it is not using. An encrypted store still needs the session's DEK. Search inside a store runs through its owner's session, so the owner can full-text search even an encrypted store — which the shared index never could.
- The effect: nobody sees a private item except its owner (or a delegate, or a share the owner issued), and that is __structural__, not a filter — the shared files contain nothing to leak.
- Work: files in __encrypted__ stores in [#1400](https://github.com/jwilleke/ngdpbase/issues/1400); unencrypted private files, pages, versions, trash and search in [#1454](https://github.com/jwilleke/ngdpbase/issues/1454) — so the global indexes are emptied of private items in one place, and nothing that works for unencrypted files today breaks in between (operator, 2026-09-22).

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
| Encrypt | Off: plaintext files (today's private pages). On: every file's contents ciphertext, one store DEK. |
| Share | Off: nothing leaves except that user. On: existing __token-share__ only, minted by that user. |

The two are independent. The whole store is encrypted or it is not — no per-file and no field-level encryption of global `page-index.json`.

__What "encrypted" hides, and what it does not (2026-09-22).__ Encryption is __per file__: each file's contents are sealed with the store DEK. It is not a single encrypted container — the store is still an ordinary folder, so anyone with disk or backup access can list it and see __how many__ items it holds, their __sizes__ and __dates__, never their contents. Names say nothing: pages are `{uuid}.md` and files `{uuid}.ext`, so a name cannot be used to confirm that a known document is present (a content-hash name could). A container per store would hide the count and sizes too; it was considered and not chosen — every write rewrites or patches one large blob, concurrent writes need locking, large files (DICOM) become slow, and one corruption loses the whole store.

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

__A kind's definition is persisted configuration, not a manifest declaration__ (2026-09-19). An addon declares its kind at install and the keys are written to config, so the definition outlives the addon: disabling or uninstalling the addon must not erase the record that a user's store of that kind is encrypted. `domainDefaults`-style merge-at-load was rejected for exactly that.

### How an addon declares its kind (2026-09-19)

The declaration goes in the addon's `package.json` `ngdpbase` block, beside the existing manifest keys:

```json
"ngdpbase": {
  "stores": [{ "id": "yourphr", "encrypt": true }]
}
```

- __`domainDefaults` is not the mechanism.__ `AddonsManager.applyDomainDefaults` (`src/managers/AddonsManager.ts`) writes through `ConfigurationManager.setRuntimeProperty` — merged config only, gone on restart, never on disk. Disable the addon and the definition evaporates while the user's encrypted bytes stay on disk with nothing left to say the store is encrypted or who owned it.
- __At first load the keys are persisted__ through `ConfigurationManager.setProperty`: written to `app-custom-config.json`, with the `config-change` audit event and actor context that path already carries. `owner` is set to the __canonical slug__, never to a value the manifest supplies.
- __After that, config wins — always.__ The door reads `ngdpbase.stores.{id}.encrypt` when it creates a user's copy; the manifest is never consulted again. A manifest is a proposal at install time and a claim with no authority afterwards.

__A later manifest that disagrees with config is ignored, logged, and shown — not fatal__ (2026-09-19). Because config wins, a manifest that flips `encrypt` changes nothing: new copies keep being created the way existing ones were, so the population cannot split. The disagreement is a stale or wrong manifest, not a live hazard, and taking a working addon down over a line of JSON punishes its users for the author's oversight. It is logged at warn and surfaced on the admin addons screen — "`yourphr` declares `encrypt: false`; this instance holds the kind as `encrypt: true` with N users; the declaration is ignored" — and the addon loads normally.

Refusing to load was considered and rejected: it was proposed to stop the user population splitting between encrypted and plaintext copies, and config precedence already prevents that.

__One case is a hard stop: an addon claiming a store id that config says another slug owns.__ That is not a stale flag, it is one addon reaching into another's data container. The claimant is denied the kind — its door returns unavailable — and it is logged loudly. The rest of that addon may run; it has no business in that store either way.

### Turning the owner off, and what the instance knows (2026-09-19)

Three states already exist and none needed inventing: __enabled__ (`ngdpbase.addons.<slug>.enabled`, read by `AddonsManager.isEnabled`, default false), __present__ (discovered under `addons-path` at boot), and __loaded__ (`register()` ran). `getStatus()` reports `{ enabled, loaded }` per addon.

| Owner state | Kind | Door |
|---|---|---|
| loaded | live | open |
| enabled, load failed | defined, config intact | closed — temporarily unavailable |
| disabled | defined, config intact | closed — the addon that owns this store is turned off |
| folder gone | defined, config intact | closed — not installed on this instance |

The config key survives all three, which is the point: a user's encrypted bytes never become bytes nobody can explain. Admin sees "kind `yourphr` — owner `yourphr` (not installed), N users have data".

__Disabling the owner is warned and confirmed, never refused__ (2026-09-19). Disable destroys nothing: the config key stays, the store stays sealed on disk, `store.json` keeps the wrapped DEK, and re-enabling returns every user to the same keys. `canDisable` gains a `warnings` arm the confirm dialog shows — "N users have data in store `yourphr`. Disabling closes their store. Data stays encrypted on disk and returns when you re-enable." — and the audit event records the count. Its existing `blockedBy` arm is unchanged: an enabled addon depending on this one is a real invariant, user data is not.

Refusing the disable was rejected: a broken or compromised addon would become impossible to turn off exactly when it must be, and the guard is walked around by editing `app-custom-config.json` or deleting the folder — with no warning read and no audit event. The hard stop belongs on the irreversible verbs instead: removing a kind's definition, or purging `pages/private/*/{store}/`, is refused while any user holds data.

__Whole-store migration is its own epic; the architecture supports it__ (2026-09-19). Changing a kind from `encrypt: false` to `true` (or back) re-writes every byte of every user's copy, so it is not part of this work. What this design keeps true for it:

- A user's `store.json` is the truth for __that user's copy__. A kind's setting is the rule applied __when a copy is created__, and changing it never silently reinterprets copies that exist.
- A copy can therefore differ from its kind, and the system must tolerate that rather than assume the kind's value.
- A migration runs __in that user's session__: only they hold the key, so encrypting or decrypting their store requires their login. No admin-side batch can do it.

__A store holds nothing until its user logs in and creates data__ (2026-09-19). A copy may be created lazily at the first write in a session that holds the key, so a kind can be defined long before any user has a byte in it — and an encrypted kind's copy never exists without a wrapped DEK.

__A kind cannot be removed while any user still has data in it__ (2026-09-19). Removal is refused until those stores are empty — the user has taken their data out ([#1387](https://github.com/jwilleke/ngdpbase/issues/1387)) or deleted it. Nothing deletes a user's store on the instance's behalf.

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
- Turning encryption on or off for an existing store is __not offered__ at first: each is a whole-store migration. It can come later if anyone asks.

__There is no instance-wide "encrypted stores offered here" switch__ (2026-09-19, superseding an earlier bullet that gave the admin that veto). Encryption is __always__ the store kind's owner's call. An admin who does not want an addon's encrypted store on their instance does not install the addon, or disables it — the lever they already have, at the level where the decision actually belongs. A switch that lets an instance overrule a kind would let an operator turn off encryption the addon declared __required__ for sensitive or regulated data, which is precisely the thing nobody may do.

The admin remains the owner of the `default` store, and decides encryption there like any other kind owner.

`store.json` carries the per-user state: `encrypt`, and the wrapped DEK once the user has keys. The kind's owner and its encryption policy live in the kind's definition in configuration, not in each user's copy. An addon declares its store kind in its manifest (see "How an addon declares its kind").

### `store.json` shape (2026-09-19)

Four fields. Written once when the copy is created, at the user's first entry through the door.

```json
{
  "kind": "yourphr",
  "encrypt": true,
  "created": "2026-09-19T14:02:11.503Z",
  "dekWrap": { "...": "algorithm, salt and the wrapped key" }
}
```

- __`kind`__ — the store kind this copy was created under. Redundant with the directory name until the kind's setting changes, and then it is the only thing that says which rule the copy was made by. The "a copy can differ from its kind" tolerance recorded above needs it; whole-store migration reads it to know what it is converting from.
- __`encrypt`__ — whether __this copy__ is sealed. The truth for the bytes beside it, never re-read from the kind.
- __`created`__ — when the user walked through the door. Also the answer to "has this user ever entered?" without opening anything else.
- __`dekWrap`__ — the data key, wrapped by the user's KEK. Absent when `encrypt` is false. Its algorithm identifiers and parameters are settled with the implementation ([#1400](https://github.com/jwilleke/ngdpbase/issues/1400)), not here.

Not in this file: the user id (it is the parent directory), the recovery words or anything derived from them, and any kind-level policy. `store.json` is per-user state and key material only.

### Recovery words: at first deliberate entry into the store (2026-09-19)

Supersedes the 2026-09-18 note below. Keys and the 12 words are created when the user __first enters the store__ — the "set up your health records" step of whatever owns it — not at login and not mid-save.

- __Every store provides this step, addon stores included.__ A store a user has never entered is a door, not a directory.
- At that step: create the user KEK from the session password if they have none, generate the 12 words, create the store's copy with its wrapped DEK, and show the words __once__ with the warning.
- By the time anything is written, the key exists. Nothing is created mid-save, and no key ever exists whose words were never shown.
- A user who never enters an encrypted store is never asked to keep recovery words, whatever kinds the instance defines.

Rejected: __at first password login when an encrypted kind is defined__ — every user on the instance would be handed words to keep, including people who never touch that addon. Rejected: __at the first content write__ — the words would appear mid-save, the worst moment to ask someone to record them, and a dismissed dialog would leave a key whose words were never seen.

### The words are confirmed before anything is committed (2026-09-19)

The words exist only while that screen renders. Afterwards the instance holds key material wrapped by them and can never re-derive them, so a user who closes the tab on a store that has already been created is left with no recovery path at all — the store is reachable only while they remember their password.

So the words are the __last gate__, not a notice:

- The door shows all 12 words with the warning.
- The user __re-enters all 12__, in order, to prove they wrote them down.
- __Only then__ are the user's keys, the store copy and its wrapped DEK written.
- __Abandon the tab and nothing exists.__ No store, no wrapped DEK, no orphan key. Entering the door again produces a fresh set of words, and the abandoned set is simply forgotten.

__A failed confirmation discards the words and generates a new set.__ The missed set is never shown again — not once, not "here they are one more time". A user who could not reproduce them did not write them down, and re-showing the same words turns the gate into a memory test they can pass by scrolling up. They confirm a __fresh__ 12 words, or they do not get a store.

__Retries are limited and configurable.__ `ngdpbase.stores.recovery.confirmretries`, default `1` — one extra attempt, so two in all, each with its own new set. Exhaust them and the door gives up: nothing was committed, so there is nothing to clean up, and the user starts over from the beginning whenever they like. `0` allows a single attempt. The count is configuration rather than a constant so an instance can be stricter or gentler.

Rejected: __create first, allow one re-show__ — the words then sit retrievable somewhere beyond the one screen for minutes, which is the property this design exists to avoid. Rejected: __create first, no re-show__ — simple and safe for the instance, and a silent data-loss trap for anyone who closes the tab.

### The door asks for the password when the user has no key (2026-09-19)

The user KEK is wrapped with the login password, and the server does not keep the password after login: login only unwraps a KEK that already exists. So when a user enters an encrypted store's door and has no `user-keys.json` yet, __the door asks for their password again__, verifies it, and uses it to create the KEK and its password wrap. A user who already has a KEK (unlocked in the session bag at login) is not asked.

The re-entry is also the right check before an action as consequential as creating key material.

Rejected: __create the KEK at every password login and add the recovery wrap at the door__ — a key would then exist whose words were never shown, which the rules above forbid, and every user would hold a key for a store they may never enter.

### Core owns the door (2026-09-19)

Every store kind provides the entry step, but __only core implements it__. Core ships one route — the store's door — that derives the user KEK if they have none, generates the 12 words, creates the store's copy with its wrapped DEK, and renders the words-once screen with the warning.

- An addon "provides" the step by __declaring its store kind and linking to the core door__. It supplies a label and a short blurb that core renders on the screen, so the step reads as the addon's ("set up your health records") without the addon handling any key material.
- An addon never sees a KEK, a DEK or a recovery word. It cannot log them, store them, or skip the warning.
- The screen that shows recovery words exists in __exactly one place__, so its wording, its once-only rule and its audit entry are reviewed once rather than per addon.
- After the door has been walked through, the addon's own pages take over as usual; the door is only for the store's creation.

Rejected: __each store kind renders its own set-up step and calls a core key API__. It buys a flow that fits the addon's look, and costs the one property that matters — an addon that reimplements the words screen wrongly is a bug we cannot see from here.

### Recovery words: at first login after an encrypted store exists (superseded 2026-09-18)

A store created for a user by an admin or an addon exists before that user has any keys, so its DEK cannot be wrapped yet. The store is written with `encrypt: true` and __no wrapped DEK__ — a pending state.

At the user's next __password__ login, the app sees a pending encrypted store and no `user-keys.json`: it creates the user KEK from that password, generates the 12 recovery words, wraps the store's DEK, and shows the words __once__, with the warning. Until that login the store holds no content, because every write into it is already refused without the key.

The words are never generated at store-creation time (the creator is not the keyholder) and never re-shown later; a user who loses both password and words loses that store's contents, and no admin can recover them.

## Keys

Do not encrypt the folder with the login password. Password change and recovery need a stable store key.

| Key | Role |
|---|---|
| User KEK | From the login password; 12-word BIP39 wrap is recovery for this. Wraps each encrypted store's DEK. (It also encrypted the user-level `user-index.json` / version / trash catalogs; those move into the stores — see "Stores are self-contained".) |
| Store DEK | Only if that store has encrypt on. Encrypts the contents of every file in `private/{user}/{store}/`, the store's own indexes included — per file, not a container (see Per-store switches). |

Login unwraps the user KEK, reads each of the user's stores' indexes (unsealing an encrypted store's with its DEK) and merges them __in memory__ with the global indexes. Never write decrypted private titles back to a global file. Logout drops the merge.

~~Unencrypted `default/` stays in global `page-index.json` as today.~~ Superseded 2026-09-22: the global indexes hold public items only ("Stores are self-contained").

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
- Flat. ~~Content-addressed (`{sha256}.ext`), same as the public pool.~~ Superseded 2026-09-22 (below): `{uuid}.ext`. No per-type folders (`images/`, `dicom/`, `json/`); type is attachment metadata (`encodingFormat`).
- The name is `attachments/`, not `blobs/` — it matches `AttachmentManager` and the public pool, and "blobs" already means version/trash content here.
- Anything an addon owns that is not an attachment (e.g. a later database file) gets its own sibling folder through that addon's provider.

- The folder name is config key `ngdpbase.page.provider.filesystem.attachmentsdir` (default `attachments`), beside `versionsdir` / `deleteddir` (approved 2026-09-15).

~~Global `attachment-metadata.json` must not list names of files in a __sealed__ store.~~ Widened 2026-09-22: it lists __no__ private file, encrypted or not ("Stores are self-contained").

### File names and duplicates (2026-09-22)

Decided by the operator while planning [#1400](https://github.com/jwilleke/ngdpbase/issues/1400).

- __A file in a private store is `{uuid}.ext`__ — a random UUID, like a page's `{uuid}.md`. The UUID is the file's id and its name on disk. Content-hash naming (`{sha256}.ext`) stays for the __public pool only__. Reason: in an encrypted store the contents are sealed, but a content-hash name would still let anyone with disk or backup access confirm that the store holds a known file, by hashing their own copy. A random name says only that a file exists.
- Applies to __all private stores__, encrypted or not — encrypted stores in [#1400](https://github.com/jwilleke/ngdpbase/issues/1400), unencrypted ones in [#1454](https://github.com/jwilleke/ngdpbase/issues/1454). Nothing to migrate: encrypted stores held no readable files before #1400, and existing unencrypted private files keep their names.
- __Duplicate detection is per store.__ The content fingerprint (SHA-256) lives in the __store's own file index__ (sealed when the store is encrypted), not in the file name. An upload whose fingerprint is already in that store returns the existing file. It never matches another store or the public pool — which also fixes a private upload silently returning the public copy of identical bytes and never landing in the store.

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
| [#1400](https://github.com/jwilleke/ngdpbase/issues/1400) | Files in an __encrypted__ store: per-store file index, `{uuid}.ext`, sealed bytes, per-store duplicates; upload, serve, page attached files, delete | [#1386](https://github.com/jwilleke/ngdpbase/issues/1386) |
| [#1454](https://github.com/jwilleke/ngdpbase/issues/1454) | __Epic__: private stores leave the shared indexes — decisions recorded there | [#1400](https://github.com/jwilleke/ngdpbase/issues/1400) (index format) |
| [#1456](https://github.com/jwilleke/ngdpbase/issues/1456) | Store page index; private URLs `/private/{owner}/{store}/{title}` | — |
| [#1457](https://github.com/jwilleke/ngdpbase/issues/1457) | Links `[store/Title]`, typeahead, migration, owner redirects | [#1456](https://github.com/jwilleke/ngdpbase/issues/1456), [#1455](https://github.com/jwilleke/ngdpbase/issues/1455) |
| [#1458](https://github.com/jwilleke/ngdpbase/issues/1458) | Per-store search | [#1456](https://github.com/jwilleke/ngdpbase/issues/1456) |
| [#1459](https://github.com/jwilleke/ngdpbase/issues/1459) | Per-store versions and trash | [#1456](https://github.com/jwilleke/ngdpbase/issues/1456) |
| [#1460](https://github.com/jwilleke/ngdpbase/issues/1460) | Unencrypted private files out of the global index | [#1456](https://github.com/jwilleke/ngdpbase/issues/1456) |

Implement [#1383](https://github.com/jwilleke/ngdpbase/issues/1383) first. [#1384](https://github.com/jwilleke/ngdpbase/issues/1384) is the key primitive; login, logout, password re-wrap, and refuse-write are separate children.
