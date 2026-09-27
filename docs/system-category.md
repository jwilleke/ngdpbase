# System categories

What a `system-category` is, what each of its settings does today (read from the code, not from older docs), and what #1477 has decided it becomes. The decision record is [#1477](https://github.com/jwilleke/ngdpbase/issues/1477); where this page and the issue disagree, the issue's latest decision wins and this page is to be corrected.

## The model

Every page carries exactly one `system-category` in its frontmatter. The #1477 model separates three questions:

- __Category: what kind of page this is__, and, for private pages, which vault they go to.
- __`private`: who may see it.__ A private page is owner-only.
- __The folder is the safety line.__ `pages/` is shared; a vault folder is owner-only. Making a page public moves it to `pages/`; making it private moves it into its category's vault.

A category is not a subject. Subjects are `system-keywords` (the top-level taxonomy) and `user-keywords` (sub-classification beneath it), per #1477.

## Where it is configured

`ngdpbase.system-category` in `config/app-default-config.json`, overridable per instance in `app-custom-config.json`. It is a map. The map key names the entry in config, and each entry's `label` is what a page stores.

__Today__ (what ships and what the code reads now; `storageLocation` is still the behaviour switch):

```json
"journal": {
  "label": "journal",
  "description": "Personal journal entries — schema.org BlogPosting at JSON-LD render time (#791)",
  "default": false,
  "storageLocation": "regular",
  "enabled": true,
  "page-badge": { "color": "bg-info", "label": "Journal", "title": "Journal entry" }
}
```

__Decided (#1477), not yet built.__ The switch moves to `source`. `storageLocation` becomes the place a new page of the category goes when nothing says otherwise. `vaultid` names the vault its private pages use (`pages/vaults/{user}/{vaultid}/`):

```json
"general": {
  "label": "general",
  "default": true,
  "source": "site",
  "storageLocation": "pages/",
  "vaultid": "default"
},
"journal": {
  "label": "journal",
  "default": false,
  "source": "site",
  "storageLocation": "pages/vaults/{user}/journal/",
  "vaultid": "journal",
  "page-badge": { "color": "bg-info", "label": "Journal", "title": "Journal entry" }
}
```

- `general` pages go to `pages/` by default; one made private goes to `pages/vaults/{user}/default/`.
- `journal` entries go to the journal vault by default; one made public goes to `pages/`.
- `vaultid` is unique across all categories, core and add-on.
- A category an add-on brings is added by the add-on, and its `vaultid` is the add-on's id: the `ngdpbase.slug` in its `package.json` (the canonical add-on identity, #927). The vault's `encrypt` and `owner` are decided by that owner.
- Exactly one entry carries `default: true` (`general`).

Shipped entries: `general` (the default), `system`, `documentation`, `developer` (disabled), `addon`, `user-profile`, `journal`.

## Settings, as the code reads them today

### `label` (string, required)

The value written into a page's frontmatter as `system-category`, and the value the code compares pages against. Matching is by label, case-insensitive in the places that compare (e.g. `PageManager.ts:1558`). The map key and the label are the same in every shipped entry. Keep them the same: code that looks an entry up by key and code that matches by label would otherwise disagree.

### `description` (string)

Shown to people only: in the categories table of `[{ConfigAccessor type='systemCategories'}]` (`ConfigAccessorPlugin.ts:1027`). No behaviour depends on it.

### `enabled` (boolean, default `true`)

`false` means the category is __not offered and not deleted__:

- It leaves the list of valid categories (`ValidationManager.ts:216`), so the editor, the create form and the ingest API no longer offer or accept it.
- Pages that already carry it stay on disk and still display.
- __Saving such a page is refused__: validation fails because the category is no longer valid. To edit it, change its category first. `developer` is shipped disabled; this is why a page carrying it cannot be saved.
- A disabled entry is never chosen as the default.

### `default` (boolean)

__Exactly one entry may carry it: `general`__ (operator, 2026-09-27). Nothing enforces that yet; the build should warn at startup when more than one entry is marked.

The category a new page gets when none is given: the first entry with `default: true` and not `enabled: false` (`ValidationManager.getDefaultSystemCategory`, `ValidationManager.ts:434`; the same rule in `WikiRoutes.ts:1868` when ValidationManager is unavailable). With none marked, the first enabled entry is used, then `general`.

`ngdpbase.default.system-category` (a separate top-level key, `"general"`) __has no reader__. It changes nothing; the `default: true` flag decides.

### `page-badge` (object, optional)

`{ color, label, title }`: the badge shown beside the title on a page of this category (`views/header.ejs:207-212`, data from `WikiRoutes.ts:1323`). `color` is Bootstrap badge classes, `label` the badge text, `title` its tooltip. Without it, no badge (e.g. `general`).

### `storageLocation` (today: `regular` | `required` | `github`)

__Today this is a behaviour switch, not a place. Decided: it becomes the path (see below); the switch moves to `source` first.__ The code branches on the exact word:

| Value | Meaning | What the code does |
|---|---|---|
| `regular` | An ordinary site page | Nothing special |
| `required` | Shipped with the software, in `required-pages/` | Cannot be made private (`PageManager.ts:1558`). Editing marks the page user-modified (`WikiRoutes.ts:4019`, `:4139`). Listed as a shipped-page category (`WikiRoutes.ts:1937`). Checked for orphans (#1377, `WikiRoutes.ts:12139`). Badge "required-pages" in the categories table |
| `github` | Lives in the repo's `docs/`, never in the site's pages | Saving is refused (`FileSystemProvider.ts:744`). Never seeded (`PageManager.ts:841`, `:1000`). Hidden from the editor's category list (`WikiRoutes.ts:1966`) |

A missing value reads as `regular` (`ValidationManager.ts:406`).

## Related settings that are not per category

- `ngdpbase.stores.{kind}.owner` and `.encrypt`: the __vault__ settings (#1414). `owner` is who controls the vault kind (`admin`, or the add-on that declared it); `encrypt` is whether its pages are sealed with the owner's key. Only `default` exists today (`owner: admin`, `encrypt: false`). An add-on may declare its own kind in `package.json` `ngdpbase.stores`. Decided to move onto the category (below).
- `ngdpbase.stores.recovery.confirmretries`: __per person__. A user has one key, and one set of 12 recovery words, for all their vaults.
- `ngdpbase.stores.import.maxsize`: __per instance__. The largest takeout an import will hold in memory.

## Terms

- __Category__: an entry in `ngdpbase.system-category`; what kind of page.
- __Vault__: a user's owner-only folder of private pages. Today `pages/private/{user}/{vaultid}/`; decided: `pages/vaults/{user}/{vaultid}/`.
- __Vault kind__ (called a "store kind" in #1414): the site-wide definition of a vault (owner, encrypt). __`vaultid` is the kind's id__: defining `journal` once gives every user `pages/vaults/{user}/journal/`. A user has at most one vault per kind.
- __Source__ (decided, name to be confirmed): the replacement for today's `storageLocation` switch, meaning where a page's master copy lives. Not to be confused with a vault kind.

## Decided target (#1477), not yet built

- __The switch moves to its own field.__ Proposed as `source: site | shipped | repo`, replacing `regular | required | github` one for one. Every reader in the table above moves to it first, and a guard proves none still compares `storageLocation` to one of the old words.
- __Then `storageLocation` becomes a path__: where a new page of the category goes by default (`pages/` for `general`, `pages/vaults/{user}/journal/` for `journal`), and `vaultid` names the vault its private pages use.
- __The vault settings move onto the category.__ `encrypt` and `owner` sit beside `storageLocation`, so one entry says what kind of page it is, where its private pages go, whether they are sealed and who decides. An admin defines a new vault by adding or editing a category; there is no separate "create store kind" screen (#1414 closed on that basis).
- __Vaults move from `pages/private/` to `pages/vaults/`__, and page names and URLs follow (`/vaults/jim/default/Diary`). Old `/private/…` URLs redirect permanently, and stored links are rewritten once.
- __Option 1 stays the rule__: a vault is owner-only. An encrypted page is never public in place; going public decrypts it and moves it to `pages/`.
- __The journal is the first category with its own vault__ (`pages/vaults/{user}/journal/`, `vaultid: journal` = the add-on's slug), owned by the journal add-on. `ngdpbase.addons.journal.dataPath` goes: it only locates a retired sidecar.
