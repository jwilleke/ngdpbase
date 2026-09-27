# System categories

What a `system-category` is, what each of its settings does today (read from the code, not from older docs), and where we are taking it.

__This page is the source of truth for the target.__ [#1477](https://github.com/jwilleke/ngdpbase/issues/1477) is the record of how each decision was reached; where the two disagree, this page wins, and a new decision is made on the issue and then written here. The target is not built yet: the code still does what "Settings, as the code reads them today" describes.

## The model

Every page carries exactly one `system-category` in its frontmatter. The #1477 model separates three questions:

- __Category: what kind of page this is__, and, for private pages, which vault they go to.
- __`private`: who may see it.__ A private page is owner-only.
- __The folder is the safety line.__ `pages/` is shared; a vault folder is owner-only. Making a page public moves it to `pages/`; making it private moves it into its category's vault.

A category is not a subject. Subjects are `system-keywords` (the top-level taxonomy) and `user-keywords` (sub-classification beneath it), per #1477.

## Target configuration

Decided, not yet built. It replaces `ngdpbase.system-category` and its comment in `config/app-default-config.json`:

```json
"_comment_system_category": "What kind of page this is, and where its pages live (#1477, docs/system-category.md). source: where the master copy lives: site (created here), shipped (required-pages/ in the release, or seeded by an add-on) or repo (the repository's docs/, never stored here). storageLocation.defaultstore: where its public pages live. storageLocation.privatestore: its vault, pages/vaults/{user}/{vaultid}/, whose last segment is the vault id; no privatestore means its pages can never be private. allowPublic / defaultPrivate: the owner's choice whether an entry may be made public, and where new entries start; a person's preference overrides defaultPrivate only when allowPublic is true. encrypt, owner: the vault's settings, decided by the owner (admin, or the add-on's slug). Exactly one entry has default: true. Add-ons declare their own categories in their manifest; core persists them here at first load.",
"ngdpbase.system-category": {
  "general": {
    "label": "general",
    "description": "General User pages",
    "default": true,
    "enabled": true,
    "source": "site",
    "storageLocation": {
      "defaultstore": "pages/",
      "privatestore": "pages/vaults/{user}/default/"
    },
    "allowPublic": true,
    "defaultPrivate": false,
    "encrypt": false,
    "owner": "admin"
  },
  "system": {
    "label": "system",
    "description": "Pages an instance must have to start up and run: its furniture and machinery",
    "default": false,
    "enabled": true,
    "source": "shipped",
    "storageLocation": { "defaultstore": "pages/" },
    "page-badge": { "color": "bg-secondary", "label": "System", "title": "System page" }
  },
  "documentation": {
    "label": "documentation",
    "description": "End-User documentation",
    "default": false,
    "enabled": true,
    "source": "shipped",
    "storageLocation": { "defaultstore": "pages/" },
    "page-badge": { "color": "bg-info text-dark", "label": "Documentation", "title": "Documentation page" }
  },
  "developer": {
    "label": "developer",
    "description": "Developer documentation and technical notes, only in GitHub",
    "default": false,
    "enabled": false,
    "source": "repo"
  },
  "addon": {
    "label": "addon",
    "description": "Pages seeded by an installed add-on",
    "default": false,
    "enabled": true,
    "source": "shipped",
    "storageLocation": { "defaultstore": "pages/" },
    "page-badge": { "color": "bg-primary", "label": "Addon", "title": "Add-on page" }
  },
  "user-profile": {
    "label": "user-profile",
    "description": "User profile pages",
    "default": false,
    "enabled": true,
    "source": "site",
    "storageLocation": { "defaultstore": "pages/" },
    "page-badge": { "color": "bg-success", "label": "Profile", "title": "User profile page" }
  }
}
```

The `journal` entry is not in core configuration. The journal add-on declares it in its manifest, and core persists it into the site configuration at first load (see [Categories that add-ons bring](#categories-that-add-ons-bring)):

```json
"journal": {
  "label": "journal",
  "description": "Personal journal entries — schema.org BlogPosting at JSON-LD render time (#791)",
  "default": false,
  "enabled": true,
  "source": "site",
  "storageLocation": {
    "defaultstore": "pages/",
    "privatestore": "pages/vaults/{user}/journal/"
  },
  "allowPublic": true,
  "defaultPrivate": true,
  "encrypt": false,
  "owner": "journal",
  "page-badge": { "color": "bg-info", "label": "Journal", "title": "Journal entry" }
}
```

### The fields

- __`source`__ replaces today's `storageLocation` words one for one: `regular` → `site`, `required` → `shipped`, `github` → `repo`. Every behaviour those words drive today moves to it first.
- __`storageLocation.defaultstore`__: where public pages of the category live (`pages/`).
- __`storageLocation.privatestore`__: its vault, `pages/vaults/{user}/{vaultid}/`. The vault id is the path's last segment; there is no separate `vaultid` field. No two categories may share a `privatestore`. __No `privatestore` means the category's pages can never be private__ (today's rule for shipped pages).
- __`allowPublic`__ (the owner's choice): whether a user may make an entry public. With `false`, every entry stays in the vault.
- __`defaultPrivate`__ (the owner's choice): where new entries start. With `allowPublic: true`, each person's preference overrides it, and the editor's Private box moves a single entry either way. Replaces `ngdpbase.addons.journal.defaultPrivate`.
- __`encrypt` and `owner`__: the vault's settings, present only on entries that have a vault. They replace `ngdpbase.stores.{kind}.encrypt` / `.owner`; `general` carries what `ngdpbase.stores.default.*` holds today. `owner` is `admin` for core categories, or the add-on's `ngdpbase.slug` (#927).
- __`default: true`__: exactly one entry, `general`. The build warns at startup when more than one is marked.
- `label`, `description`, `enabled` and `page-badge` keep their meaning (below).

### Rules for owners

- __An add-on's pages may be private.__ The add-on, as owner, declares for its category whether new pages start private (`defaultPrivate`) and whether they are encrypted (`encrypt`).
- __`encrypt: true` means the pages are always private__: an encrypted page is never public in place. So `encrypt: true` forces `allowPublic: false`, and core refuses a declaration that says otherwise.
- __`user-profile` has no vault: a profile page is public by definition.__ The editor warns the user, when they edit their profile page, that everyone who can see the site can read it.

### Still open

- __The catch-all `addon` entry__ (pages an add-on seeds, e.g. its help): does it get a vault, or does an add-on that wants private pages declare its own category (as the journal does)?
- __The admin-only test pages__ ("Test Page: …"): stay `system`, or move to `documentation`.

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

The target shape is under [Target configuration](#target-configuration).

### Categories that add-ons bring

An add-on __declares__ its category in its manifest, and core __persists__ it into the site's configuration at first load, the way store kinds are persisted today (#1414). After that, configuration wins. It isn't merged from the add-on's `config/default-config.json`, which only applies while the add-on is loaded. So turning an add-on off, or removing it, never loses anything:

- the category stays valid, and is just not offered for new pages;
- its public pages still display;
- its vault shows a closed door ("turned off" or "not installed", "its data is untouched"), and sealed vaults keep their wrapped keys.

Retiring an add-on for good (moving its pages to another category and vault, or exporting them, then removing the entry) is [#1490](https://github.com/jwilleke/ngdpbase/issues/1490).

Shipped entries: `general` (the default), `system`, `documentation`, `developer` (disabled), `addon`, `user-profile`, `journal`.

### What each shipped category is for

- __`general`__: ordinary pages people write on the site. The default.
- __`system`__: the pages an instance __must have to start up and run at its most basic__: its own furniture and machinery, which a fresh install could not work without. Examples: LeftMenu, Footer, Welcome, PageIndex, Recent Changes, SystemInfo, `Template:PageTabs`. Not help text: a page that explains something to a reader belongs in `documentation`, even if it ships.
- __`documentation`__: help for the people using the site: how to write pages, use plugins and use features. Ships with the software.
- __`developer`__: developer notes that live in the repository's `docs/`, never on the site. Disabled.
- __`addon`__: pages an installed add-on seeds (its own help and screens).
- __`user-profile`__: one page per user, their profile.
- __`journal`__: journal entries. In core config today; decided to be declared by the journal add-on (#1477).

`system` and `documentation` behave the same today (both ship and cannot be made private). They differ in purpose and badge, and are kept separate for that purpose (operator, 2026-09-27).

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
- __Vault kind__ (called a "store kind" in #1414): the site-wide definition of a vault (owner, encrypt). Its id, the __vaultid__, is the last segment of the category's `privatestore`: defining `journal` once gives every user `pages/vaults/{user}/journal/`. A user has at most one vault per kind.
- __Source__: the replacement for today's `storageLocation` switch, meaning where a page's master copy lives (`site`, `shipped`, `repo`). Not to be confused with a vault kind.

## How we get there (#1477)

- __The switch moves to its own field__, `source: site | shipped | repo`, replacing `regular | required | github` one for one. Every reader in the table above moves to it first, and a guard proves none still compares `storageLocation` to one of the old words.
- __Then `storageLocation` becomes the pair of places__ (`defaultstore`, `privatestore`), with `allowPublic` and `defaultPrivate` beside it.
- __The vault settings move onto the category.__ `encrypt` and `owner` sit beside `storageLocation`, so one entry says what kind of page it is, where its private pages go, whether they are sealed and who decides. An admin defines a new vault by adding or editing a category; there is no separate "create store kind" screen (#1414 closed on that basis).
- __Vaults move from `pages/private/` to `pages/vaults/`__, and page names and URLs follow (`/vaults/jim/default/Diary`). Old `/private/…` URLs redirect permanently, and stored links are rewritten once.
- __Option 1 stays the rule__: a vault is owner-only. An encrypted page is never public in place; going public decrypts it and moves it to `pages/`.
- __The journal is the first category with its own vault__ (`pages/vaults/{user}/journal/`, named by the add-on's slug), declared and owned by the journal add-on. `ngdpbase.addons.journal.dataPath` goes (it only locates a retired sidecar), and so does `ngdpbase.addons.journal.defaultPrivate` (now the category's `defaultPrivate`).
