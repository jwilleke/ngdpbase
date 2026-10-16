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

A system-category is an entry in `ngdpbase.system-category`. An add-on declares its own in its `config/default-config.json`. That file is merged into the site's configuration one entry at a time (#1220). The site's own `app-custom-config.json` is applied last and wins.

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
- __`owner`__: set it to your add-on's `ngdpbase.slug`. The owner's `encrypt` and `defaultPrivate` are the declaration that stands (operator, 2026-09-29): a health-record add-on that declares `encrypt: true` keeps it sealed. Without `owner` the entry belongs to `admin`.
- __`shareMaxDays`__: the longest a new share link into the vault may last. The vault's owner picks any lifetime up to it, and can extend a live link by up to 24 hours at a time. Default 15.
- __`enabled`__: whether people can choose the category when creating or moving a page. Visibility only: whether a page may be edited is policy. Set `false` when only the add-on assigns the category.
- __`default`__: never `true` on an add-on's entry. Exactly one entry, `general`, is the default.
- __`page-badge`__: optional `{ color, label, title }`, shown beside the page title.
- __`source`__: legacy (`site`, `shipped`, `repo`), still read but decided to be removed. Leave it out, or use `site`.

### Value types are exact

`defaultPrivate` and `encrypt` are compared as booleans. The string `"true"` is __not__ `true`:

- `"defaultPrivate": "true"` makes pages start __public__;
- `"encrypt": "true"` leaves the vault __unsealed__.

Nothing warns about either yet. Write `true`, `false` or `"choice"` exactly.

## Writing pages and files

- __Pages__ go through `PageManager`, with the caller's context. A private page's name is `vaults/{owner}/{vaultid}/{title}`. `npm run lint:page-door` fails on any other page write.
- __Files__ (PDFs, images, DICOM) go through `AttachmentManager`. A file uploaded onto a private page goes into that page's vault. A vault's files are just files, under the vault's own access controls.
- __Never__ write into `pages/` or `pages/vaults/` directly. The doors apply encryption, the owner checks, the audit record and the indexes.
- An encrypted vault needs its owner's key, unlocked by their sign-in. A write without it is refused, never written in the clear. Whether a vault is sealed is fixed when it is created (its `store.json`), so decide `encrypt` before the first page is written.

## Access, sharing and proxies

Vault access is the same for every vault, core's or an add-on's. Add nothing vault-specific.

- Only the vault's owner gets past the private-container check. Policies can name `vault` as a resource type (#1539).
- __Share links__ into a vault are issued by `ShareManager`, limited by the category's `shareMaxDays`.
- __Proxy access__ (#1762): someone acting for the owner reaches the vault under their grant; an encrypted vault's key copy is sealed to them (`vault-proxy`).
- An add-on's own records in a database follow the access-control model in [#1431](https://github.com/jwilleke/ngdpbase/issues/1431#issuecomment-6193262203): the add-on's manager is the PEP and asks the PDP.

## Known gaps

- __Turning the add-on off removes its category__ ([#1559](https://github.com/jwilleke/ngdpbase/issues/1559)). The add-on's `config/default-config.json` only contributes while the add-on is enabled. Disable it, and its system-category is gone from configuration, so its pages and vault contents can't be reached until it is enabled again. The decided target is a category that stays readable while its add-on is off, marked with its `owner`.
- __The owner's declaration isn't enforced yet.__ It was decided that the owner's `encrypt` and `defaultPrivate` stand. Today a site's `app-custom-config.json` is merged last and could override them.
- __Mistyped values aren't refused.__ A string where a boolean belongs is read as `false`, silently (see [Value types are exact](#value-types-are-exact)).
- __Backups don't cover add-on databases yet__ ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723)). Vault pages sit under `pages/`, which the page backup walks. That vault files (PDFs, images) are covered too hasn't been checked; do it before relying on it.
- __The journal still lives in core config__ ([#1507](https://github.com/jwilleke/ngdpbase/issues/1507)), waiting on #1559.

## Checklist

- [ ] Generated content is in the add-on's own system-category, never `general`
- [ ] The vault id (last segment of `privatestore`) is the add-on's slug and unique
- [ ] `owner` is the add-on's slug
- [ ] `defaultPrivate` is `true`, `false` or `"choice"`; `encrypt` is a boolean
- [ ] `encrypt` decided before the first page is written
- [ ] Every page write goes through `PageManager`, every file through `AttachmentManager`
- [ ] The add-on's own data is in its database or `dataPath`, never a vault
