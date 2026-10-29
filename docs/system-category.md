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
"_comment_system_category": "What kind of page this is, and where its pages live (#1477, docs/system-category.md). storageLocation.defaultstore: the folder its public pages live in; no storageLocation means its pages are never stored on the site. storageLocation.privatestore: its vault, pages/vaults/{user}/{vaultid}/, whose last segment is the vault id; no privatestore means its pages can never be private. defaultPrivate: whether a new entry starts private: true (always), false (never), or choice (each user's preference, private until they set it). encrypt: whether the vault's pages are sealed; true means always private. comments, footnotes: false turns off the Comments or Footnotes tab for its pages and refuses new ones; a page's own comments: or footnotes: frontmatter wins, and unset is on (#1951). Who may make an entry public, and who may change these settings, is policy (docs/access-policies.md), not a field here. Exactly one entry has default: true. Add-ons declare their own system-categories in their own config/default-config.json; core reads them live from the installed add-ons' files and never persists them here.",
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
    "defaultPrivate": false,
    "encrypt": false,
    "shareMaxDays": 15
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
    "enabled": false,
    "storageLocation": { "defaultstore": "pages/" },
    "page-badge": { "color": "bg-success", "label": "Profile", "title": "User profile page" }
  },
  "capture": {
    "label": "capture",
    "description": "Pages made by the capture bookmarklet",
    "default": false,
    "enabled": false,
    "storageLocation": {
      "defaultstore": "pages/",
      "privatestore": "pages/vaults/{user}/capture/"
    },
    "defaultPrivate": "choice",
    "encrypt": false,
    "shareMaxDays": 15
  }
}
```

The `journal` entry is not in core configuration. The journal add-on declares it in its own `config/default-config.json` (built, #1507), and core reads it from there live, whether the add-on is on or off (see [System-categories that add-ons bring](#system-categories-that-add-ons-bring)):

```json
"journal": {
  "label": "journal",
  "description": "Personal journal entries — schema.org BlogPosting at JSON-LD render time (#791)",
  "default": false,
  "enabled": true,
  "owner": "journal",
  "storageLocation": {
    "defaultstore": "pages/",
    "privatestore": "pages/vaults/{user}/journal/"
  },
  "defaultPrivate": "choice",
  "encrypt": false,
  "shareMaxDays": 15,
  "page-badge": { "color": "bg-info", "label": "Journal", "title": "Journal entry" }
}
```

### The fields

Each field of a system-category entry, what it represents, and what its absence means.

| Field | Represents | Values | When absent | Decided by |
|---|---|---|---|---|
| map key (e.g. `general`) | The entry's name in configuration | Lower-case word; the same as `label` | — (required) | Core, or the add-on that declares it |
| `label` | The value a page stores as its `system-category`, and what pages are matched against | String; the same as the map key | — (required) | Core, or the add-on |
| `description` | A human explanation of what kind of page this is. Shown on screen only | String | No description shown | Core, or the add-on |
| `enabled` | Whether users can see and choose the system-category at all. `false` means users never see it: it is not offered when creating a page, nor when moving a page to another system-category or store. It is __only__ visibility: whether a page carrying it can be edited or saved is a policy decision (`hasPermission` / `canAccess`, the page's `access`), never this flag | `true` / `false` | `true` | Admin |
| `default` | Whether this is the system-category a new page gets when none is given | `true` on exactly one entry, `general` | `false` | Core |
| `page-badge` | The badge shown beside the title of a page in this system-category | `{ color, label, title }`: Bootstrap badge classes, badge text, tooltip | No badge | Core, or the add-on |
| `storageLocation` | Where this system-category's pages are stored on the site | Object with `defaultstore` and optionally `privatestore` | Pages are __never stored on the site__ (they live in the repository's `docs/`); saving one is refused and none is seeded | Core, or the add-on |
| `storageLocation.defaultstore` | The folder public pages of this system-category live in | `pages/` | — (required when `storageLocation` is present) | Core |
| `storageLocation.privatestore` | This system-category's vault: the owner-only folder its private pages live in, one per user | `pages/vaults/{user}/{vaultid}/`. The vault id is the last segment; there is no separate `vaultid` field. No two entries share one | Pages of this system-category __can never be private__ | Core, or the add-on |
| `defaultPrivate` | Whether a new page of this system-category starts private (operator, 2026-09-28). `true`: always private; `false`: always public; with either, no preference is offered to users. `choice`: each user sets it in their preferences (one preference per system-category), and a user who has not set it starts private. Either way the editor's Private box moves a single page, where policy allows. Replaces `ngdpbase.addons.journal.defaultPrivate` and the journal's own `journal.defaultPrivate` preference | `true` / `false` / `choice` | `false` | Core, or the add-on; changing it is policy |
| `encrypt` | Whether pages in this system-category's vault are sealed with the page owner's key. Present only with a `privatestore`. Replaces `ngdpbase.stores.{kind}.encrypt` | `true` / `false`. `true` means always private | `false` | The entry's `owner` |
| `owner` | Who decides about this system-category's vault (operator, 2026-09-29): its `encrypt` and `defaultPrivate` are the owner's declaration, and they stand. A health-record add-on that declares its vault `encrypt: true` keeps it sealed; an admin cannot turn that off. Replaces `ngdpbase.stores.{kind}.owner` | `admin` for the site's own entries, or the declaring add-on's `ngdpbase.slug` (#927) | `admin` | Core, or the add-on |
| `comments` | Whether pages of this system-category offer core's Comments (#1951). `false`: no Comments tab, no comment list, and the server refuses posting or deleting a comment. A page's own `comments:` frontmatter wins over it, either way. See [`comments`, `footnotes`](#comments-footnotes) | `true` / `false` | On | The entry's `owner`; on the site's own entries, the admin |
| `footnotes` | Whether pages of this system-category offer core's Footnotes (#1951). `false`: no Footnotes tab, and the server refuses adding, editing or deleting a footnote. A page's own `footnotes:` frontmatter wins over it, either way | `true` / `false` | On | The entry's `owner`; on the site's own entries, the admin |
| `shareMaxDays` | The longest a new share link to this system-category's vault may last, in days (#1388, operator 2026-09-30). The vault's owner picks any lifetime up to it and can extend a live link by up to 24 hours at a time, past it. The only say the system-category's `owner` has in sharing | Positive number. Present only with a `privatestore` | `15` | The entry's `owner` |

`general` carries what `ngdpbase.stores.default.*` holds today. The build warns at startup when more than one entry has `default: true`.

### Where a page's master copy lives

There is __no field for it__. `source` (`site` | `shipped` | `repo`) was decided earlier and built in #1503, then found redundant and dropped (operator, 2026-09-28). __Built (#1503):__ no code reads it, and no shipped entry carries it (see [`source`](#source-removed)). Each job it did is answered by something that already exists:

- __Never stored on the site__ (was `repo`): the entry has no `storageLocation`. That is `developer`. Read through `ValidationManager.getCategoryStored` (`none`): the provider refuses the save, the seed skips the page, and the editor does not offer it.
- __Can never be private__ (was part of `shipped`): the entry has no `privatestore`. That is `system`, `documentation`, `addon` and `user-profile` (`getCategoryStored` is `public`; PageManager drops a `private: true` for them, and the editor refuses the Private box).
- __Only admins may edit a shipped page__ (was part of `shipped`): the page's own `access`, which seeding sets on every page it copies from a shipped source (#1411). Until that is the only gate, the routes also hold every shipped page (decided per page, below) admin-only to edit, delete or rename.
- __Who may move a page into a system-category__ (today: admin-only for the shipped ones): policy, per system-category, checked through `hasPermission` (operator, 2026-09-28), using the `system-category` resource type decided in [access-policies.md](access-policies.md#decided-not-yet-built). By default only admins may move a page into `system` or `documentation`. Built today without policy, and wider (operator, 2026-10-29): __nobody but an administrator sets or changes a page's system-category at all__, whichever it is. For anyone else a new page is `general` and an existing page keeps its own; a request naming another is refused with a 403 (`PageManager.systemCategoryForWrite`, asked by the create form, the editor, the ingest API and the takeout import; see [the security guide](guides/security-developer-guide.md#only-an-administrator-sets-a-pages-system-category)). Editing a page already in a shipped system-category is not admin-only unless that page is itself shipped.
- __A page on the site is a copy of a shipped original__ (was part of `shipped`): its page ID is in a shipped source (`required-pages/` or an add-on's pages). That is decided per page, not per system-category, so a `system` page someone creates on the site is not mistaken for a shipped one. __Add-on pages are shipped pages exactly like `required-pages/` ones, in every check__ (operator, 2026-10-29). Built: `PageManager.isShippedPageCopy(uuid)`, the site's seeded-pages record from any shipped source, asked by every "is this a shipped page?" decision: only admins may edit, delete or rename it (`WikiRoutes.isRequiredPage`), it is never private (refused by the save route, and dropped by `PageManager` even in a system-category with a vault), a save marks it `user-modified` and notifies admins, and the authorship conversion (#2097) counts its upstream author apart. How shipped pages are seeded and tracked: [The seed pipeline](platform/addon-page-handling.md#the-seed-pipeline).
- __Which system-categories ship pages__ (the #1377 check lists pages in one of them that are not in the release): read from the shipped files themselves. Each file in `required-pages/` carries `system-category:` in its frontmatter, and the values found there (today `system` and `documentation`) are the shipped ones; so are those of each enabled add-on's pages (a page without one is `addon`, as the seed stamps it). No setting names them (operator, 2026-09-28). Built: `PageManager.shippedSystemCategories()`, each source read once. Used only where a category list is the question: the #1377 check and moving a page into one; never to decide whether a page is shipped.

### Rules for owners

- __Pages an add-on generates and owns go in its own system-category and vault__ (see below). Never in `general` or the user's `default` vault: there they could not be told apart, the add-on's rules (such as `encrypt`) could not apply, and turning the add-on off, retiring it (#1490) or a takeout could not find them.
- __A `general` page an add-on helps a user create is that user's page__ (for example "new page from a template"): `general`, their `default` vault if they make it private, and no add-on rules afterwards. The add-on is a tool there, not the owner.
- __Data an add-on keeps in its own files is the system's__, not a user's, and never goes in a vault. It is readable by admins, or handed to another add-on through that add-on's hook. Forms is the model: a submission is a file under the forms add-on's `dataPath`, recorded with who submitted it, read only with `admin-system`, or passed through `registerHandler` to another add-on (calendar turns `clubhouse-reservation` submissions into reservations, under its own permissions).
- __Seeded `addon` pages are documentation about the add-on__: shipped with it, public, no vault. They are the only pages an add-on seeds.
- __Content an add-on generates goes in the add-on's own system-category__, with its own vault (`pages/vaults/{user}/{slug}/`), declared by the add-on. A personal health record add-on, for example, would declare a system-category whose vault holds everything created through it, likely with `encrypt: true`. The journal is the first such add-on.
- __The admin-only test pages__ ("Test Page: …", #1355) stay `system`: they must ship with every install, and their `test-page` system keyword is what marks them as tests.
- __An add-on's pages may be private.__ The add-on declares for its system-category whether new pages start private (`defaultPrivate`) and whether they are encrypted (`encrypt`).
- __Who may make a page public is policy__ (operator, 2026-09-28), on the `system-category` resource type (`page-public`, [access-policies.md](access-policies.md)). This replaces the `allowPublic` field decided earlier.
- __The vault's owner decides its `encrypt` and `defaultPrivate`__ (operator, 2026-09-29, reversing the 2026-09-28 note that `owner` would become policy). The owner is `admin` for the site's own system-categories and the declaring add-on for its own, and its declaration stands: nobody else changes it.
- __`encrypt: true` means the pages are always private__: an encrypted page is never public in place, whatever any policy allows.
- __`user-profile` is set only through user preferences__ (operator, 2026-09-28), never chosen in the editor, so it is `enabled: false`. Naming a profile page in preferences redoes the frontmatter of both pages: the new page gets `system-category: user-profile`, and the old one becomes `general`, keeping its content.
- __`user-profile` has no vault: a profile page is public by definition.__ The editor warns the user, when they edit their profile page, that everyone who can see the site can read it.

## Where it is configured

`ngdpbase.system-category` in `config/app-default-config.json`, overridable per instance in `app-custom-config.json`. It is a map. The map key names the entry in config, and each entry's `label` is what a page stores.

### System-categories that add-ons bring

__Built ([#1559](https://github.com/jwilleke/ngdpbase/issues/1559)):__ an add-on __declares__ its system-category under `ngdpbase.system-category` in its own `config/default-config.json`, marked with its `owner`. Core reads it live from the installed add-ons' files at every start; it is never persisted into the site's configuration (the whole-map write that would take, removed in #1505, loses entries). Every other key in that file reaches the site's configuration only while the add-on is enabled (#1220); `ngdpbase.system-category` is read whether the add-on is enabled or not. So turning an add-on off loses nothing, and removing it loses the entry until the retire flow (#1490) exists. The practice is [storage-developer-guide.md](guides/storage-developer-guide.md).

- __Turned off:__ the entry stays valid, with `enabled: false`, whatever the site's file says. It still resolves (its pages keep their system-category, its public pages display), it is not offered for new pages, and its vault door is shut with "turned off … its data is untouched". Vault folders and `store.json` files are never touched, so sealed vaults keep their wrapped keys.
- __Not installed__ (the add-on's files are gone): the entry is gone too, because it is read from those files. Its pages carry a system-category the site no longer knows, and its vault's door answers "no such store". The "not installed" closed door is shown only when the site's own `app-custom-config.json` still carries the entry. Removing an add-on properly is the retire flow, [#1490](https://github.com/jwilleke/ngdpbase/issues/1490).
- __Owner:__ each entry is stamped `owner: <the add-on's ngdpbase.slug>`. Its `owner`, `encrypt`, `defaultPrivate`, `shareMaxDays`, `comments` and `footnotes` are the add-on's declaration: a value for them in `app-custom-config.json` is ignored, with a warning. A field the add-on leaves out stays absent (its default). The site still decides the other fields, `enabled` included while the add-on is on.
- __Refused__, with a warning naming the add-on, the entry and the reason: an entry whose `owner` is not the add-on's slug; one whose key is a shipped entry's or another add-on's; one whose vault id is another entry's; `default: true`; a malformed `privatestore`; and a `defaultPrivate` or `encrypt` of the wrong type. A refused entry is left out entirely, so nothing can be created unsealed or public by mistake. __The add-on is then not loaded__ (operator, 2026-10-16): it is never imported, so its routes and plugins are not registered. None of its other configuration keys apply. Its other, sound entries are kept as a turned-off add-on's are: readable (their pages resolve, their vault doors say the add-on is unavailable), and never offered. On `/admin/addons` it shows as not loaded with the reason, the same way as an add-on that needs a newer core (#1757).
- __Warnings__ are logged at startup and posted to admins as system notifications. The rest of the site keeps running.

Retiring an add-on for good (moving its pages to another system-category and vault, or exporting them, then removing the entry) is [#1490](https://github.com/jwilleke/ngdpbase/issues/1490).

Shipped entries: `general` (the default), `system`, `documentation`, `developer` (disabled), `addon`, `user-profile`, `capture` (disabled; set by the capture feature). `journal` ships with the journal add-on, in its own file (#1507).

### What each shipped system-category is for

- __`general`__: ordinary pages users write on the site. The default.
- __`system`__: __the minimal viable pages for a minimal site to start__: its own furniture and machinery, which a fresh install could not work without. Examples: LeftMenu, Footer, Welcome, PageIndex, Recent Changes, SystemInfo, `Template:PageTabs`. Not help text: a page that explains something to a reader belongs in `documentation`, even if it ships.
- __`documentation`__: help for the site's users: how to write pages, use plugins and use features. Ships with the software.
- __`developer`__: developer notes that live in the repository's `docs/`, never on the site. Disabled.
- __`addon`__: documentation about an installed add-on, seeded by it.
- __`user-profile`__: one page per user, their profile.
- __`journal`__: journal entries. Declared by the journal add-on in `addons/journal/config/default-config.json`, `owner: "journal"` (#1507). Its label, vault id (`journal`), `privatestore`, `defaultPrivate: "choice"`, `encrypt: false` and `shareMaxDays: 15` are what core shipped before the move, so existing journal pages and vaults are unchanged. Two consequences of being an add-on's entry (#1559): with the journal add-on turned off, `journal` is not offered for new pages and its vault door is shut as "turned off" (its pages still resolve, its data is untouched); and a site whose `app-custom-config.json` sets the entry's `encrypt`, `defaultPrivate` or `shareMaxDays` now gets the journal's value, with a startup warning naming the field. A vault already created sealed stays sealed (sealing is fixed in its `store.json`), but new journal vaults follow the journal's `encrypt: false`. Who may make a journal entry public is the add-on's own policy, `journal-page-public` ([access-policies.md](access-policies.md)), so with the add-on off nobody can; entries already public stay public. A site with `ngdpbase.managers.addons-manager.enabled: false`, or an `addons-path` that leaves out `./addons`, has no journal entry at all.
- __`capture`__: pages made by the capture bookmarklet (operator, 2026-09-28). Core, because capture is a core feature. Its own vault, `pages/vaults/{user}/capture/`, keeps captures apart from a user's own private pages; `defaultPrivate: "choice"` replaces `ngdpbase.capture.private`. `enabled: false`: nobody picks it in the editor; the capture feature sets it.

`system` and `documentation` behave the same (both ship and cannot be made private). They differ in purpose and badge, and are kept separate for that purpose (operator, 2026-09-27).

## Fields, as the code reads them today

### `label` (string, required)

The value written into a page's frontmatter as `system-category`, and the value the code compares pages against. Matching is by label, case-insensitive in the places that compare. The map key and the label are the same in every shipped entry. Keep them the same: code that looks an entry up by key and code that matches by label would otherwise disagree.

### `description` (string)

Shown on screen only: in the table of `[{ConfigAccessor type='systemCategories'}]`. No behaviour depends on it.

### `enabled` (boolean, default `true`)

`false` means the system-category is __not offered__ (built in #1504, operator 2026-09-28): it is __visibility only__.

- It leaves the list users choose from, so the create form, the editor's list and the ingest API never offer it, and nobody can move a page into it.
- A page that already carries it keeps it: saving that page is accepted with its current system-category, and the editor lists the current one even when it is not offered, so a save never moves the page (`acceptedSystemCategory`).
- Whether a page may be edited or saved at all is policy's decision, never this flag.
- A disabled entry is never chosen as the default.
- Shipped disabled: `developer` (never stored on the site: it has no `storageLocation`), `user-profile` (set only through user preferences) and `capture` (set by the capture feature).

### `default` (boolean)

__Exactly one entry may carry it: `general`__ (operator, 2026-09-27). Nothing enforces that yet.

The system-category a new page gets when none is given: the first entry with `default: true` and not `enabled: false` (`ValidationManager.getDefaultSystemCategory`; the same rule in `WikiRoutes` when ValidationManager is unavailable). With none marked, the first enabled entry is used, then `general`.

`ngdpbase.default.system-category` (a separate top-level key, `"general"`) __has no reader__. It changes nothing; the `default: true` flag decides.

### `page-badge` (object, optional)

`{ color, label, title }`: the badge shown beside the title on a page of this system-category (`views/header.ejs`, data from `WikiRoutes`). Without it, no badge (e.g. `general`).

### `source` (removed)

__Removed (#1503).__ Nothing reads it; its jobs moved as [Where a page's master copy lives](#where-a-pages-master-copy-lives) says. A site's `app-custom-config.json`, or an add-on's file, that still carries it is ignored without breaking: startup logs one info line naming every entry that has it, never a warning per entry (#1988). A guard test (`src/managers/__tests__/categoryStored.test.ts`) fails if code reads `source` off a system-category again.

The categories table, `[{ConfigAccessor type='systemCategories'}]`, shows a __Stored__ column instead (`none`, `public` or `vault`, from `storageLocation`), and filters on it with `stored=`; the `source=` filter is gone.

### `storageLocation`

Read since #1504: `defaultstore` is where public pages live, and `privatestore` (`pages/vaults/{user}/{vaultid}/`) is the vault, whose last segment is the vault id (`ValidationManager.getVaultId`, `privateStoreDoor.storeKindFromConfig`). `general`, `journal` and `capture` carry one.

Since #1503 it also decides where a system-category's pages may be stored, through one rule (`categoryStored`, `ValidationManager.getCategoryStored`): no `storageLocation` is `none` (never stored on the site), one without a valid `privatestore` is `public`, and one with a valid `privatestore` is `vault`. Only an absent `storageLocation` means `none`: any other value, such as a word left from before #1504, still stores, so a stale site config never starts refusing saves. A system-category the site does not know has no answer, and nothing is refused for it. An enabled entry with no `storageLocation` is left out of the editor and its saves are refused, so startup warns once, naming every such entry.

### `defaultPrivate`, `encrypt`, `owner`, `shareMaxDays`

Read as declared in [The fields](#the-fields). `defaultPrivate` and `encrypt` are compared as booleans: the string `"true"` is not `true` (pages start public, the vault is not sealed), so a wrong type is never silent (#1559). In an add-on's entry the entry is refused with a warning (see [System-categories that add-ons bring](#system-categories-that-add-ons-bring)). In the site's own entries the site warns and never forces (operator, 2026-10-16): it keeps running, the value is still read as false, and startup logs an error. Admins also get a non-dismissible entry on the dashboard under "Working, but needs your attention" (ValidationManager, configuration key `ngdpbase.system-category`; [#1946](https://github.com/jwilleke/ngdpbase/issues/1946)) and a system notification. Both name the entry, the field and the bad value, and say what it is read as (for example `encrypt: "true"` is read as false, so the vault is not sealed). `owner` absent means `admin`, except on an add-on's entry, which is always its add-on's.

### `comments`, `footnotes`

Built (#1951). Whether a page offers core's Comments and Footnotes, decided per page by one rule (`pageNotesOn` in `src/utils/pageNotes.ts`), asked through each kind's manager (`CommentManager.isAllowedOn`, `FootnoteManager.isAllowedOn`):

- 1 The page's own frontmatter, `comments: false` / `footnotes: false` (or `true`), wins.
- 2 Otherwise the page's system-category entry's field of the same name; a page that names none follows the default system-category.
- 3 Otherwise on, as before.

Only a boolean counts. In a site entry any other value is read as on, with the startup error, banner and notification of [the other fields](#defaultprivate-encrypt-owner-sharemaxdays); an add-on entry with one is refused. On an add-on's entry they are the owner's declaration (operator, 2026-10-21), like `encrypt`: a site's value in `app-custom-config.json` is ignored with a warning, whether it turns them on or off, and a field the add-on leaves out stays unset (on). On the site's own entries they stay the site's to set. A page's own flag still wins over either.

When a kind is off for a page:

- The view leaves out the tab of `Template:PageTabs` that shows it (a tab whose content calls `CommentsPlugin` / `FootnotesPlugin`, or the short `Comments` / `Footnotes`). The template is shared; each page is asked about itself, so one page's flag never reaches another.
- Every write is refused by the manager with "Comments are turned off for this page." or "Footnotes are turned off for this page.", which the routes answer with 403: posting and deleting a comment; adding, editing and deleting a footnote; and the conversion funnel (ingest, import, Convert to NCM), which then leaves `[^id]:` definitions in the body instead of moving them to the footnote list. There is no comment edit.
- __Comments are kept, and hidden.__ Nothing is deleted. `[{CommentsPlugin}]` renders nothing and `GET /api/comments/:uuid/html` answers 404. Turning comments back on shows them again.
- __Footnotes are kept, and stay readable where the page's own content lists them.__ `[{FootnotesPlugin}]` written in the page's body still renders the page's footnotes, without the add form or the edit and delete buttons, and `GET /api/footnotes/:uuid` still answers. `[^1]` references in the body are untouched. Only the shared tab, and changes, are off.

The phr add-on's seed page is the case it was built for: its plugin output is private to each viewer, so a shared comment on it would publish a patient's note to everyone who can see the page.

## Related settings that are not per system-category

- `ngdpbase.stores.{kind}.owner` and `.encrypt`: __removed__ (#1505). A vault kind is a system-category entry with a `privatestore`; its `encrypt` and `owner` are the entry's. Add-ons no longer declare kinds in `package.json` `ngdpbase.stores`; an add-on declares its own system-category instead (#1507).
- `ngdpbase.stores.recovery.confirmretries`: __per person__. A user has one key, and one set of 12 recovery words, for all their vaults.
- `ngdpbase.stores.import.maxsize`: __per instance__. The largest takeout an import will hold in memory.

## Terms

- __system-category__: an entry in `ngdpbase.system-category`; what kind of page. A page carries exactly one.
- __Vault__: a user's owner-only folder of private pages. Today `pages/private/{user}/{vaultid}/`; decided: `pages/vaults/{user}/{vaultid}/`.
- __Vault kind__ (called a "store kind" in #1414): the site-wide definition of a vault (`encrypt`). Its id, the __vaultid__, is the last segment of the system-category's `privatestore`: defining `journal` once gives every user `pages/vaults/{user}/journal/`. A user has at most one vault per kind.

## How we get there (#1477)

- __Done (#1508):__ the unread `ngdpbase.storageLocation.*` block is gone from the default config.
- __Done (#1503):__ `source: site | shipped | repo` replaced the old `storageLocation` words, and was then removed again (operator, 2026-10-02), each of its jobs moving to what [Where a page's master copy lives](#where-a-pages-master-copy-lives) names. __Order (operator, 2026-09-28): after `storageLocation` becomes the pair of folders (next bullet, #1504).__ Until every entry carries `storageLocation` and, where it has a vault, `privatestore`, reading their absence as "never stored" and "never private" would refuse every save and every private page.
- __First: vaults move from `pages/private/` to `pages/vaults/`__ (#1506; order decided by the operator, 2026-09-28, so that `privatestore` names the real folder, `pages/vaults/{user}/{vaultid}/`, from the start), and page names and URLs follow (`/vaults/jim/default/Diary`). Stored links are rewritten once; old `/private/…` addresses are not redirected (operator, 2026-09-28).
- __`storageLocation` becomes the pair of folders__ (`defaultstore`, `privatestore`), with `defaultPrivate` beside it. `privatestore` then declares the vault folder, so two settings that declare it today go (operator, 2026-09-28): `ngdpbase.page.provider.filesystem.privateroot` (the parent folder; the scan that keeps vaults out of the public index reads it from the `privatestore` entries instead, and every entry's `privatestore` must share one parent, `pages/vaults/`) and `ngdpbase.page.provider.filesystem.defaultstoreid` (the vault id of a user's ordinary vault, which is the last folder of `general`'s `privatestore`, `default`).
- __Built (#1505, piece 2):__ a new private page goes to its system-category's vault (the create form, the editor's Private box, and pages the capture flow creates, which are now `capture` pages); a system-category with no vault offers no Private box and refuses one. Existing pages stay where they are until moved.
- __Captures get their own system-category and vault__ (#1505, moved from #1504 by the operator 2026-09-29, with routing new private pages to their system-category's vault): existing captures (pages marked `capture`, today `general` in a user's `default` vault) are moved once into `capture` and `pages/vaults/{user}/capture/`, the way the journal's entries move in #1507.
- __The vault settings move onto the system-category entry__ (#1505). `encrypt` and `owner` sit beside `storageLocation`, so one entry says what kind of page it is, where its private pages go, whether they are sealed and who decides that. The owner's declaration stands (operator, 2026-09-29). Who may make a page public is policy (`page-public`). An admin defines a new vault by adding or editing a system-category; there is no separate "create store kind" screen (#1414 closed on that basis).
- __Option 1 stays the rule__: a vault is owner-only. An encrypted page is never public in place; going public decrypts it and moves it to `pages/`.
- __The journal is the first system-category with its own vault__ (`pages/vaults/{user}/journal/`, named by the add-on's slug), declared and owned by the journal add-on. `ngdpbase.addons.journal.dataPath` goes (it only locates a retired sidecar), and so does `ngdpbase.addons.journal.defaultPrivate` (now the entry's `defaultPrivate`). __Built (#1507):__ `dataPath` and `defaultPrivate` are gone; new private entries go to the journal vault (#1505, piece 4), and existing ones move there at boot with every other private page whose system-category declares its own vault. The entry is declared in the journal add-on's own `config/default-config.json` with `owner: "journal"` (#1559), and core configuration no longer carries it.
