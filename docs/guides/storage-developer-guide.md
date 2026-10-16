---
name: Storage developer guide
description: Where an add-on's pages, files and data live — declaring a system-category with its own vault, the fields that decide privacy and encryption, writing through the doors, and the gaps
dateModified: 2026-10-16
category: guides
relatedModules: [ValidationManager, PageManager, AttachmentManager, ShareManager, DatabaseManager]
---

# Storage developer guide

What a developer, above all an add-on author, has to know about where things are stored. The design is [system-category.md](../system-category.md); this page is the practice.

## Where each kind of thing goes

| What | Where | Who it belongs to |
| --- | --- | --- |
| Pages the add-on __seeds__ (its own documentation) | System-category `addon`, public, no vault | The add-on |
| Content the add-on __generates for a person__ (journal entries, health records, their files) | The add-on's __own system-category__, with its __own vault__ `pages/vaults/{user}/{vaultid}/` | That person |
| A `general` page the add-on only helps someone create (a template) | `general`, and the person's `default` vault if they make it private | That person; no add-on rules afterwards |
| Data the add-on keeps for itself (submissions, ledgers, indexes) | Its own database (`DatabaseManager.openAddonDatabase`) or files under its own `dataPath`; never a vault | The system; read with `admin-system`, or handed to another add-on through a hook |

Never put an add-on's own content in `general` or a person's `default` vault. There it can't be told apart from the person's own pages, the add-on's rules (such as `encrypt`) don't apply, and turning the add-on off, retiring it ([#1490](https://github.com/jwilleke/ngdpbase/issues/1490)) or a takeout can't find it.

## Declaring a system-category with a vault

A system-category is an entry in `ngdpbase.system-category`. An add-on declares its own in its `config/default-config.json`. That file is merged into the site's configuration one entry at a time (#1220), and the site's own `app-custom-config.json` is applied last. For `ngdpbase.system-category` two things differ ([#1559](https://github.com/jwilleke/ngdpbase/issues/1559), details in [system-category.md](../system-category.md#system-categories-that-add-ons-bring)):

- __It is read whether or not the add-on is enabled.__ Turned off, the category stays (not offered, `enabled: false`): its pages keep resolving and its vault door says "turned off", its data untouched. If the add-on is removed, its category goes with its files.
- __The owner's fields stand.__ `owner`, `encrypt`, `defaultPrivate` and `shareMaxDays` are the add-on's; the site's file cannot change them (it gets a warning). The site decides the rest.

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

The journal's entry in `config/app-default-config.json` has the same shape, and is the working reference.

### The fields an add-on sets

- __Map key and `label`__: keep them the same word. A page stores the `label` as its `system-category`, and some code looks entries up by key, some by label.
- __`storageLocation.defaultstore`__: `pages/`, where public pages of the category live.
- __`storageLocation.privatestore`__: the vault, `pages/vaults/{user}/{vaultid}/`. `{user}` is the page owner's username. The last segment is the vault id: use the add-on's slug, and never one another entry uses. Without a `privatestore`, pages of the category can never be private.
- __`defaultPrivate`__: whether a new page starts private. Exactly one of:
  - `true` (the boolean): always private, no preference offered;
  - `false` (the boolean, the default): always public, no preference offered;
  - `"choice"` (the string): each person's own preference, `<category>.defaultPrivate`; someone who hasn't set it starts private.

  The editor's Private box can still move a single page, where policy allows.
- __`encrypt`__: whether the vault's pages and files are sealed with the owner's key. `true` means always private: an encrypted page is never public in place.
- __`owner`__: your add-on's `ngdpbase.slug`, or leave it out: core stamps it. The owner's `encrypt` and `defaultPrivate` are the declaration that stands (operator, 2026-09-29): a health-record add-on that declares `encrypt: true` keeps it sealed. Any other `owner` (including `admin`) is refused.
- __`shareMaxDays`__: the longest a new share link into the vault may last. The vault's owner picks any lifetime up to it, and can extend a live link by up to 24 hours at a time. Default 15.
- __`enabled`__: whether people can choose the category when creating or moving a page. Visibility only: whether a page may be edited is policy. Set `false` when only the add-on assigns the category.
- __`default`__: never `true` on an add-on's entry (such an entry is refused). Exactly one entry, `general`, is the default.
- __`page-badge`__: optional `{ color, label, title }`, shown beside the page title.
- __`source`__: legacy (`site`, `shipped`, `repo`), still read but decided to be removed. Leave it out, or use `site`.

### Value types are exact

`defaultPrivate` and `encrypt` are compared as booleans. The string `"true"` is __not__ `true`:

- `"defaultPrivate": "true"` makes pages start __public__;
- `"encrypt": "true"` leaves the vault __unsealed__.

So a wrong type is refused. An add-on's entry with one is left out entirely, with a startup warning and an admin notification naming the entry and the field. __The add-on itself is then not loaded__: none of its routes, plugins or other configuration keys apply, and `/admin/addons` shows it as not loaded with the reason. It loads again once its file is fixed. Write `true`, `false` or `"choice"` exactly. The same refusal applies to an entry whose `owner` isn't the add-on's slug, whose key is a site entry's or another add-on's, whose vault id another entry already uses, that sets `default: true`, or whose `privatestore` is malformed.

The same mistake in one of the site's own entries (core's, or the site's `app-custom-config.json`) is not refused: the site keeps running and the value is still read as false. Startup logs an error, and admins get the dashboard's non-dismissible "subsystem not working" banner and a system notification. Both name the entry, the field, the bad value and what it is read as.

## Writing pages and files

- __Pages__ go through `PageManager`, with the caller's context. A private page's name is `vaults/{owner}/{vaultid}/{title}`. `npm run lint:page-door` fails on any other page write.
- __Files__ (PDFs, images, DICOM) go through `AttachmentManager`. An upload is either an attachment, on a page, or a saved file; __every attachment of a vault page is stored in that vault__ (operator, 2026-10-16, [#1842](https://github.com/jwilleke/ngdpbase/issues/1842)). A file uploaded onto a vault page goes into its vault, a shared file attached to one is copied in, and when a page moves into a vault, out of one or between two its files move with it under the same id ([private-stores.md](../private-stores.md#files)). A vault's files are just files, under the vault's own access controls. Never point a vault page at a file in the shared pool: the pool serves it to anyone with `asset-read`.
- __Footnotes and comments__ go through `FootnoteManager` and `CommentManager`, naming the page as `{ name, uuid }` with the caller's context. A vault page's are kept in its vault and sealed with it; the name, not the uuid, says where ([#1839](https://github.com/jwilleke/ngdpbase/issues/1839), [private-stores.md](../private-stores.md#footnotes-and-comments)). Never key anything belonging to a vault page by uuid alone in a folder outside the vault.
- __Never__ write into `pages/` or `pages/vaults/` directly. The doors apply encryption, the owner checks, the audit record and the indexes.
- An encrypted vault needs its owner's key, unlocked by their sign-in. A write without it is refused, never written in the clear. Whether a vault is sealed is fixed when it is created (its `store.json`), so decide `encrypt` before the first page is written.
- A vault of an `encrypt: true` category can't be written until its owner has opened it at `/stores/{vaultid}`, which creates the sealed copy. Before that a save is refused, and the editor tells them to open the vault first. A vault whose `store.json` isn't sealed under an `encrypt: true` category is refused too, and reported to admins at startup. Store I/O asks both the category and `store.json` ([#1834](https://github.com/jwilleke/ngdpbase/issues/1834)); details in [private-stores.md](../private-stores.md#the-kind-is-asked-as-well-as-storejson).
- Moving files into or out of a vault goes through store I/O as well, never a bare `fs.move`/`fs.copy`/`fs.writeFile`. Use `moveStoreFolder()` (history), the location's `io.writeBytes` (attachments), or refuse the move with `vaultMustBeSealed()` when there's no key (restore, legacy migrations) ([#1836](https://github.com/jwilleke/ngdpbase/issues/1836)).

## Access, sharing and proxies

Vault access is the same for every vault, core's or an add-on's. Add nothing vault-specific.

- Only the vault's owner gets past the private-container check. Policies can name `vault` as a resource type (#1539).
- __Share links__ into a vault are issued by `ShareManager`, limited by the category's `shareMaxDays`.
- __Proxy access__ (#1762): someone acting for the owner reaches the vault under their grant; an encrypted vault's key copy is sealed to them (`vault-proxy`).
- An add-on's own records in a database follow the access-control model in [#1431](https://github.com/jwilleke/ngdpbase/issues/1431#issuecomment-6193262203): the add-on's manager is the PEP and asks the PDP.

## Known gaps

- __Removing the add-on removes its category__ ([#1490](https://github.com/jwilleke/ngdpbase/issues/1490)). The category is read from the add-on's files, so with them gone its pages carry an unknown system-category and its vault door answers "no such store". The data stays on disk. Retiring an add-on properly is #1490.
- __Backups don't cover add-on databases yet__ ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723)). Vault pages sit under `pages/`, which the page backup walks. That vault files (PDFs, images) are covered too hasn't been checked; do it before relying on it.
- __Plaintext written before [#1834](https://github.com/jwilleke/ngdpbase/issues/1834)__: a page saved into an `encrypt: true` vault before its door was opened was stored in the clear. Such vaults are closed and listed at startup; moving or sealing their files is still an administrator's job, with no tool for it yet.
- __Plaintext moved into sealed vaults before [#1836](https://github.com/jwilleke/ngdpbase/issues/1836)__: a page made private into a sealed vault kept its history in the clear, and adopted attachments landed in the clear. New moves are sealed. What is already on disk is listed at startup (owner, vault, count and folder), and nothing re-seals it yet.
- __A backup taken before a vault was sealed can't put its files back into it__ (#1836). Its plaintext files, and a `store.json` that isn't sealed, are skipped and logged as an error. Restoring that vault means opening the old backup's contents through the page door.
- __Footnotes and comments written before [#1839](https://github.com/jwilleke/ngdpbase/issues/1839)__ on vault pages are in `data/footnotes/` and `data/comments/`, in the clear. They are no longer shown on the page, and each is listed at startup (owner, vault, page uuid); nothing moves or seals them yet.
- __Files moved into vaults before [#1842](https://github.com/jwilleke/ngdpbase/issues/1842)__ stayed in the shared pool, served to anyone with `asset-read`. Vault pages still using them are listed at startup (owner, vault, page uuid); nothing copies them in yet. Pages in sealed vaults can't be checked without their owner's key, so only shared records that name a sealed vault's page are found there.
- __A takeout's footnotes and comments are not imported__ (#1839). The takeout carries them, decrypted, and the import lists them as ignored.
- __Operator scripts that walk `pages/` recursively__ (`migrate-private-field`, `migrate-vocabulary-slice1`, `migrate-user-pages-category`, `repair-jspwiki-frontmatter`, `migrate-page-acl-to-frontmatter`) also go into vaults. They can't read sealed files, so they leave them alone, but they do rewrite plaintext in vaults that aren't sealed. `migrate-page-created` used to rewrite sealed files too, and now skips them (#1836).
- __`ImportManager` `targetDir`__ writes raw files to any folder it is given, and no caller passes it today. Pointing it into a vault would bypass store I/O (#1836).
- __The journal still lives in core config__ ([#1507](https://github.com/jwilleke/ngdpbase/issues/1507)); since #1559 it can move to the add-on's own file.

## Checklist

- [ ] Generated content is in the add-on's own system-category, never `general`
- [ ] The vault id (last segment of `privatestore`) is the add-on's slug and unique
- [ ] `owner` is the add-on's slug
- [ ] `defaultPrivate` is `true`, `false` or `"choice"`; `encrypt` is a boolean
- [ ] `encrypt` decided before the first page is written
- [ ] Every page write goes through `PageManager`, every file through `AttachmentManager`
- [ ] The add-on's own data is in its database or `dataPath`, never a vault
