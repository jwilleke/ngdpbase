# System categories

What a `system-category` is, what each of its fields means, what the code does with them today, and where we are taking it.

__This page is the source of truth for the target.__ [#1477](https://github.com/jwilleke/ngdpbase/issues/1477) is the record of how each decision was reached; where the two disagree, this page wins, and a new decision is made on the issue and then written here. The target is not built yet: the code still does what [Fields, as the code reads them today](#fields-as-the-code-reads-them-today) describes.

## The model

Every page carries exactly one `system-category` in its frontmatter. The #1477 model separates three questions:

- __`system-category`: what kind of page this is__, and, for private pages, which vault they go to.
- __`private`: who may see it.__ A private page is owner-only.
- __The folder is the safety line.__ `pages/` is shared; a vault folder is owner-only. Making a page public moves it to `pages/`; making it private moves it into its system-category's vault.

A system-category is not a subject. Subjects are `system-keywords` (the top-level taxonomy) and `user-keywords` (sub-classification beneath it), per #1477.

## Target configuration

Decided, not yet built. It replaces `ngdpbase.system-category` and its comment in `config/app-default-config.json`:

```json
"_comment_system_category": "What kind of page this is, and where its pages live (#1477, docs/system-category.md). storageLocation.defaultstore: the folder its public pages live in; no storageLocation means its pages are never stored on the site. storageLocation.privatestore: its vault, pages/vaults/{user}/{vaultid}/, whose last segment is the vault id; no privatestore means its pages can never be private. allowPublic / defaultPrivate: the owner's choice whether an entry may be made public, and where new entries start; a person's preference overrides defaultPrivate only when allowPublic is true. encrypt, owner: the vault's settings, decided by the owner (admin, or the add-on's slug). Exactly one entry has default: true. Add-ons declare their own system-categories in their manifest; core persists them here at first load.",
"ngdpbase.system-category": {
  "general": {
    "label": "general",
    "description": "General User pages",
    "default": true,
    "enabled": true,
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
    "description": "The minimal viable pages for a minimal site to start",
    "default": false,
    "enabled": true,
    "storageLocation": { "defaultstore": "pages/" },
    "page-badge": { "color": "bg-secondary", "label": "System", "title": "System page" }
  },
  "documentation": {
    "label": "documentation",
    "description": "End-User documentation",
    "default": false,
    "enabled": true,
    "storageLocation": { "defaultstore": "pages/" },
    "page-badge": { "color": "bg-info text-dark", "label": "Documentation", "title": "Documentation page" }
  },
  "developer": {
    "label": "developer",
    "description": "Developer documentation and technical notes, only in GitHub",
    "default": false,
    "enabled": false
  },
  "addon": {
    "label": "addon",
    "description": "Documentation about an installed add-on, seeded by it",
    "default": false,
    "enabled": true,
    "storageLocation": { "defaultstore": "pages/" },
    "page-badge": { "color": "bg-primary", "label": "Addon", "title": "Add-on page" }
  },
  "user-profile": {
    "label": "user-profile",
    "description": "User profile pages",
    "default": false,
    "enabled": true,
    "storageLocation": { "defaultstore": "pages/" },
    "page-badge": { "color": "bg-success", "label": "Profile", "title": "User profile page" }
  }
}
```

The `journal` entry is not in core configuration. The journal add-on declares it in its manifest, and core persists it into the site configuration at first load (see [System-categories that add-ons bring](#system-categories-that-add-ons-bring)):

```json
"journal": {
  "label": "journal",
  "description": "Personal journal entries — schema.org BlogPosting at JSON-LD render time (#791)",
  "default": false,
  "enabled": true,
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

Each field of a system-category entry, what it represents, and what its absence means.

| Field | Represents | Values | When absent | Decided by |
|---|---|---|---|---|
| map key (e.g. `general`) | The entry's name in configuration | Lower-case word; the same as `label` | — (required) | Core, or the add-on that declares it |
| `label` | The value a page stores as its `system-category`, and what pages are matched against | String; the same as the map key | — (required) | Core, or the add-on |
| `description` | A human explanation of what kind of page this is. Shown to people only | String | No description shown | Core, or the add-on |
| `enabled` | Whether the system-category is offered for new and saved pages | `true` / `false` | `true` | Admin |
| `default` | Whether this is the system-category a new page gets when none is given | `true` on exactly one entry, `general` | `false` | Core |
| `page-badge` | The badge shown beside the title of a page in this system-category | `{ color, label, title }`: Bootstrap badge classes, badge text, tooltip | No badge | Core, or the add-on |
| `storageLocation` | Where this system-category's pages are stored on the site | Object with `defaultstore` and optionally `privatestore` | Pages are __never stored on the site__ (they live in the repository's `docs/`); saving one is refused and none is seeded | Core, or the add-on |
| `storageLocation.defaultstore` | The folder public pages of this system-category live in | `pages/` | — (required when `storageLocation` is present) | Core |
| `storageLocation.privatestore` | This system-category's vault: the owner-only folder its private pages live in, one per user | `pages/vaults/{user}/{vaultid}/`. The vault id is the last segment; there is no separate `vaultid` field. No two entries share one | Pages of this system-category __can never be private__ | Core, or the add-on |
| `allowPublic` | Whether a user may make a page of this system-category public. Only meaningful with a `privatestore` | `true` / `false`. `encrypt: true` forces `false` | `true` | The owner |
| `defaultPrivate` | Whether a new page of this system-category starts private. With `allowPublic: true`, each person's own preference overrides it, and the editor's Private box moves a single page either way. Replaces `ngdpbase.addons.journal.defaultPrivate` | `true` / `false` | `false` | The owner |
| `encrypt` | Whether pages in this system-category's vault are sealed with the owner's key. Present only with a `privatestore`. Replaces `ngdpbase.stores.{kind}.encrypt` | `true` / `false`. `true` means always private | `false` | The owner |
| `owner` | Who decides this system-category's vault settings (`allowPublic`, `defaultPrivate`, `encrypt`). Present only with a `privatestore`. Replaces `ngdpbase.stores.{kind}.owner` | `admin` for core entries, or the add-on's `ngdpbase.slug` (#927) | `admin` | Core, or the add-on |

`general` carries what `ngdpbase.stores.default.*` holds today. The build warns at startup when more than one entry has `default: true`.

### Where a page's master copy lives

There is __no field for it__. `source` (`site` | `shipped` | `repo`) was decided earlier and built in #1503, then found redundant and dropped (operator, 2026-09-28). Each job it did is answered by something that already exists:

- __Never stored on the site__ (was `repo`): the entry has no `storageLocation`. That is `developer`.
- __Can never be private__ (was part of `shipped`): the entry has no `privatestore`. That is `system`, `documentation`, `addon` and `user-profile`.
- __Only admins may edit a shipped page__ (was part of `shipped`): the page's own `access`, which seeding sets on every page it copies from a shipped source (#1411).
- __A page on the site is a copy of a shipped original__ (was part of `shipped`): its page ID is in a shipped source (`required-pages/` or an add-on's pages). That is decided per page, not per system-category, so a `system` page someone creates on the site is not mistaken for a shipped one. How shipped pages are seeded and tracked: [The seed pipeline](platform/addon-page-handling.md#the-seed-pipeline).
- __Which system-categories ship from `required-pages/`__ (the #1377 check lists pages in one of them that are not in the release): read from the shipped files themselves. Each file in `required-pages/` carries `system-category:` in its frontmatter, and the values found there (today `system` and `documentation`) are the shipped ones. No setting names them (operator, 2026-09-28).

### Rules for owners

- __Pages an add-on generates and owns go in its own system-category and vault__ (see below). Never in `general` or the user's `default` vault: there they could not be told apart, the add-on's rules (such as `encrypt`) could not apply, and turning the add-on off, retiring it (#1490) or a takeout could not find them.
- __A `general` page an add-on helps a person create is that person's page__ (for example "new page from a template"): `general`, their `default` vault if they make it private, and no add-on rules afterwards. The add-on is a tool there, not the owner.
- __Data an add-on keeps in its own files is the system's__, not a user's, and never goes in a vault. It is readable by admins, or handed to another add-on through that add-on's hook. Forms is the model: a submission is a file under the forms add-on's `dataPath`, recorded with who submitted it, read only with `admin-system`, or passed through `registerHandler` to another add-on (calendar turns `clubhouse-reservation` submissions into reservations, under its own permissions).
- __Seeded `addon` pages are documentation about the add-on__: shipped with it, public, no vault. They are the only pages an add-on seeds.
- __Content an add-on generates goes in the add-on's own system-category__, with its own vault (`pages/vaults/{user}/{slug}/`), declared by the add-on. A personal health record add-on, for example, would declare a system-category whose vault holds everything created through it, likely with `encrypt: true`. The journal is the first such add-on.
- __The admin-only test pages__ ("Test Page: …", #1355) stay `system`: they must ship with every install, and their `test-page` system keyword is what marks them as tests.
- __An add-on's pages may be private.__ The add-on, as owner, declares for its system-category whether new pages start private (`defaultPrivate`) and whether they are encrypted (`encrypt`).
- __`encrypt: true` means the pages are always private__: an encrypted page is never public in place. So `encrypt: true` forces `allowPublic: false`, and core refuses a declaration that says otherwise.
- __`user-profile` has no vault: a profile page is public by definition.__ The editor warns the user, when they edit their profile page, that everyone who can see the site can read it.

## Where it is configured

`ngdpbase.system-category` in `config/app-default-config.json`, overridable per instance in `app-custom-config.json`. It is a map. The map key names the entry in config, and each entry's `label` is what a page stores.

### System-categories that add-ons bring

An add-on __declares__ its system-category in its manifest, and core __persists__ it into the site's configuration at first load, the way store kinds are persisted today (#1414). After that, configuration wins. It isn't merged from the add-on's `config/default-config.json`, which only applies while the add-on is loaded. So turning an add-on off, or removing it, never loses anything:

- the system-category stays valid, and is just not offered for new pages;
- its public pages still display;
- its vault shows a closed door ("turned off" or "not installed", "its data is untouched"), and sealed vaults keep their wrapped keys.

Retiring an add-on for good (moving its pages to another system-category and vault, or exporting them, then removing the entry) is [#1490](https://github.com/jwilleke/ngdpbase/issues/1490).

Shipped entries: `general` (the default), `system`, `documentation`, `developer` (disabled), `addon`, `user-profile`, `journal`.

### What each shipped system-category is for

- __`general`__: ordinary pages people write on the site. The default.
- __`system`__: __the minimal viable pages for a minimal site to start__: its own furniture and machinery, which a fresh install could not work without. Examples: LeftMenu, Footer, Welcome, PageIndex, Recent Changes, SystemInfo, `Template:PageTabs`. Not help text: a page that explains something to a reader belongs in `documentation`, even if it ships.
- __`documentation`__: help for the people using the site: how to write pages, use plugins and use features. Ships with the software.
- __`developer`__: developer notes that live in the repository's `docs/`, never on the site. Disabled.
- __`addon`__: documentation about an installed add-on, seeded by it.
- __`user-profile`__: one page per user, their profile.
- __`journal`__: journal entries. In core config today; decided to be declared by the journal add-on (#1477).

`system` and `documentation` behave the same (both ship and cannot be made private). They differ in purpose and badge, and are kept separate for that purpose (operator, 2026-09-27).

## Fields, as the code reads them today

### `label` (string, required)

The value written into a page's frontmatter as `system-category`, and the value the code compares pages against. Matching is by label, case-insensitive in the places that compare. The map key and the label are the same in every shipped entry. Keep them the same: code that looks an entry up by key and code that matches by label would otherwise disagree.

### `description` (string)

Shown to people only: in the table of `[{ConfigAccessor type='systemCategories'}]`. No behaviour depends on it.

### `enabled` (boolean, default `true`)

`false` means the system-category is __not offered and not deleted__:

- It leaves the list of valid system-categories (`ValidationManager`), so the editor, the create form and the ingest API no longer offer or accept it.
- Pages that already carry it stay on disk and still display.
- __Saving such a page is refused__: validation fails because the system-category is no longer valid. To edit it, change its system-category first. `developer` is shipped disabled; this is why a page carrying it cannot be saved.
- A disabled entry is never chosen as the default.

### `default` (boolean)

__Exactly one entry may carry it: `general`__ (operator, 2026-09-27). Nothing enforces that yet.

The system-category a new page gets when none is given: the first entry with `default: true` and not `enabled: false` (`ValidationManager.getDefaultSystemCategory`; the same rule in `WikiRoutes` when ValidationManager is unavailable). With none marked, the first enabled entry is used, then `general`.

`ngdpbase.default.system-category` (a separate top-level key, `"general"`) __has no reader__. It changes nothing; the `default: true` flag decides.

### `page-badge` (object, optional)

`{ color, label, title }`: the badge shown beside the title on a page of this system-category (`views/header.ejs`, data from `WikiRoutes`). Without it, no badge (e.g. `general`).

### `source` (`site` | `shipped` | `repo`)

__Built in #1503, decided 2026-09-28 to be removed__ (see [Where a page's master copy lives](#where-a-pages-master-copy-lives)). Today every reader goes through `ValidationManager.getCategorySource()`:

| Value | What the code does |
|---|---|
| `site` | Nothing special |
| `shipped` | Cannot be made private. Editing is admin-only, marks the page user-modified and notifies admins. Listed by the #1377 check. Badge "required-pages" in the table |
| `repo` | Saving is refused. Never seeded. Hidden from the editor's list |

A missing or unknown value reads as `site`, with a startup warning naming the entry.

### `storageLocation`

Not read today. The shipped entries no longer carry it. It becomes the pair of folders (`defaultstore`, `privatestore`) in #1504.

## Related settings that are not per system-category

- `ngdpbase.stores.{kind}.owner` and `.encrypt`: the __vault__ settings (#1414). Only `default` exists today (`owner: admin`, `encrypt: false`). An add-on may declare its own kind in `package.json` `ngdpbase.stores`. Decided to move onto the system-category entry.
- `ngdpbase.stores.recovery.confirmretries`: __per person__. A user has one key, and one set of 12 recovery words, for all their vaults.
- `ngdpbase.stores.import.maxsize`: __per instance__. The largest takeout an import will hold in memory.

## Terms

- __system-category__: an entry in `ngdpbase.system-category`; what kind of page. A page carries exactly one.
- __Vault__: a user's owner-only folder of private pages. Today `pages/private/{user}/{vaultid}/`; decided: `pages/vaults/{user}/{vaultid}/`.
- __Vault kind__ (called a "store kind" in #1414): the site-wide definition of a vault (owner, encrypt). Its id, the __vaultid__, is the last segment of the system-category's `privatestore`: defining `journal` once gives every user `pages/vaults/{user}/journal/`. A user has at most one vault per kind.

## How we get there (#1477)

- __Done (#1508):__ the unread `ngdpbase.storageLocation.*` block is gone from the default config.
- __Built (#1503), now to be undone:__ `source: site | shipped | repo` replaced the old `storageLocation` words. It is removed again, each of its jobs moving to what [Where a page's master copy lives](#where-a-pages-master-copy-lives) names.
- __`storageLocation` becomes the pair of folders__ (`defaultstore`, `privatestore`), with `allowPublic` and `defaultPrivate` beside it.
- __The vault settings move onto the system-category entry.__ `encrypt` and `owner` sit beside `storageLocation`, so one entry says what kind of page it is, where its private pages go, whether they are sealed and who decides. An admin defines a new vault by adding or editing a system-category; there is no separate "create store kind" screen (#1414 closed on that basis).
- __Vaults move from `pages/private/` to `pages/vaults/`__, and page names and URLs follow (`/vaults/jim/default/Diary`). Old `/private/…` URLs redirect permanently, and stored links are rewritten once.
- __Option 1 stays the rule__: a vault is owner-only. An encrypted page is never public in place; going public decrypts it and moves it to `pages/`.
- __The journal is the first system-category with its own vault__ (`pages/vaults/{user}/journal/`, named by the add-on's slug), declared and owned by the journal add-on. `ngdpbase.addons.journal.dataPath` goes (it only locates a retired sidecar), and so does `ngdpbase.addons.journal.defaultPrivate` (now the entry's `defaultPrivate`).
