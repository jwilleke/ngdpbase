# Addons developer guide

> This is the document an addon author starts from. Load order, the full slug inventory, page sync, and the packaged image are depth: [architecture](../platform/addon-architecture.md), [identity contract](../platform/addon-identity-contract.md), [page handling](../platform/addon-page-handling.md), [packaged distribution](../platform/deployment/addon-packaged.md).

## Start here

Read this page and you can load a permission-correct addon on a local instance. You do not need the platform docs for a first addon.

### Before you write code

- __Node.js `>=24.15.0` and npm `>=11.0.0`.__ That is `engines` in this repo's `package.json`.
- __A local instance.__ `./server.sh start`. Instance config is the operator file in [Configuration](#configuration).
- __An account whose password you set.__ The shipped `admin` password is `admin123`. Change it on first login, or set `NGDPBASE_ADMIN_PASSWORD` and point `ngdpbase.user.security.defaultpassword` at `"$NGDPBASE_ADMIN_PASSWORD"` before the first boot ([SETUP.md](../../SETUP.md)). Do not build or test an addon against the shipped password.
- __A place for the code.__
  - A first-party addon ships in this repository. Fork, branch, and open a pull request that adds `addons/<slug>/`.
  - An addon you own lives in its own repository. Develop it as a drop-in directory. Ship production as a packaged npm addon, or as the wrapper image in [Shipping Your Addon as a Container Image](#12-shipping-your-addon-as-a-container-image).

### Choose a starting point

- __A directory__ in this repo or beside it: `npm run create:addon -- --id <slug>`. Flags are in [Quick start](#quick-start-scaffold-a-new-addon-675).
- __A whole repository__ (the addon at `addons/<slug>/`, plus CI, an npm publish workflow, Renovate and a licence; nothing deployment-specific): `npm run create:addon -- --id <slug> --repo --scope @your-scope`. See [A whole repository](#a-whole-repository---repo).

Worked examples already in this repo: [`addons/journal`](../../addons/journal) (a user's pages, and the permissions that guard them) and [`addons/calendar`](../../addons/calendar) (depends on `forms`, so `forms` has to be enabled too). Copy one of those.

Then set `ngdpbase.addons.<slug>.enabled` to `true`, run `./server.sh restart`, and confirm the addon under `/admin` → Add-ons. Every addon starts disabled, including one discovered outside `./addons`.

The rules that have to be right before that restart: [identity](#identity), [where it is loaded](#where-it-is-loaded), [configuration](#configuration), [permissions](#permissions), [seed pages](#seed-wiki-pages), and [testing](#testing-and-lint).

## Standing rules

- Addon code is subject to the same invariants as `src/`: context forwarded, allow/deny from `hasPermission` / `canAccess`, outbound HTTP through `src/http/`. Read [security-developer-guide.md](security-developer-guide.md) and [audit-developer-guide.md](audit-developer-guide.md) before writing a route, manager method or job; they apply [security-posture.md](../security-posture.md) and [audit-posture.md](../audit-posture.md).
- An addon never names a role in code. It declares its own permission, and a policy granting it, in its `config/default-config.json`, and its routes ask for the permission. A policy may name the roles it grants to on day one (an operator narrows them in `app-custom-config.json`).
- There is no "signed in" gate. A route asks `requirePermission`; a feature that belongs to a user then asks `ctx.actingUsername()` for who it acts as ([#1430](https://github.com/jwilleke/ngdpbase/issues/1430)).
- Where an addon's content goes ([system-category.md](../system-category.md); the practice, with a declared system-category and vault example, is [storage-developer-guide.md](storage-developer-guide.md)):
  - __Pages it generates and owns__ go in its own category and vault, never `general` or the user's `default` vault.
  - __A `general` page it helps a user create__ is that user's page, with no addon rules afterwards.
  - __Data it keeps in its own files__ (its `dataPath`) is the system's, not a user's, and never goes in a vault. Admins read it, or it is handed to another addon through a hook, as forms does with `registerHandler`.
  - __Pages it seeds__ are documentation about the addon (`system-category: addon`), public.
  - __Its own system-category__ goes under `ngdpbase.system-category.<slug>` in its `config/default-config.json`, with `owner` set to its slug. `defaultPrivate` and `encrypt` are booleans (`defaultPrivate` may also be `"choice"`); any other value, the string `"true"` included, refuses the entry, and the add-on is not loaded. Core reads the entry from every installed add-on, enabled or not (#1559): turning the addon off keeps its category's pages and vault reachable, and only stops the category being offered.
  - __A page whose content is private to each viewer__ turns off core's shared Comments and Footnotes: `comments: false` / `footnotes: false` in its frontmatter, or on its system-category entry for all its pages ([Turning off Comments and Footnotes](#turning-off-comments-and-footnotes)).
- An addon's `config/default-config.json` is a merge layer. Maps merge per entry; `id` arrays merge by id. Do not append to a role's `permissions` array.
- An addon's permission entries don't set `"step-up": true` for now (operator, 2026-10-18): a form loses its typed fields across the fresh sign-in. Say so in your own docs; the rule is in the [authentication guide](authentication-developer-guide.md#standing-rules).
- An addon that keeps rows declares its database under `ngdpbase.addons.<slug>.database` in its `config/default-config.json` before it calls `DatabaseManager.openAddonDatabase`; an undeclared one is refused, and an invalid declaration stops the addon loading ([storage guide](storage-developer-guide.md#declaring-a-database), #1860).
- An addon that does not load, for any reason, is reported to admins at the most severe level. One the site cannot work without declares `ngdpbase.addons.<slug>.site-critical: true`, and then any failure to load puts the whole site in maintenance mode ([When an addon does not load](#when-an-addon-does-not-load-site-critical), #1883).
- `ngdpbase.slug` in `package.json` and the `name` exported from `index.ts` are the same value. What the loader does when they are not is [Identity](#identity).
- `ngdpbase.minVersion` in `package.json` (`x.y.z`) is the oldest ngdpbase release the addon runs on. Raise it whenever the addon starts using something core added (a `host` entry, a manager method, a new `ApiContext` method). On an older core the addon is not imported, and its status reads "needs ngdpbase X or later", instead of failing at import with a missing module. `create:addon` sets it to the core it was generated from (#1757).
- Seed pages get a real UUID v4, a title and a slug. A placeholder UUID, or a missing title or slug, is skipped with a warning (an error log for a domain add-on) and an admin notification.
- Reach core values through `host`, the third argument to `register`, and a manager's job through `engine.getManager` ([Importing core](#importing-core--types-only)). Host HTTP is `host.guardedFetch`. Never value-import core: `npm run lint:addons` refuses a value import that resolves under `dist/` or `src/` ([#1813](https://github.com/jwilleke/ngdpbase/issues/1813)). `import type` stays allowed.
- A request through `guardedFetch` that names no `User-Agent` (any case) is sent with the site's, `ngdpbase.http.user-agent` (default `ngdpbase/<version> (+<base URL>)`, the bracketed part only when `ngdpbase.application.base-url` is set explicitly) ([#1947](https://github.com/jwilleke/ngdpbase/issues/1947)). Do not invent one of your own. Pass `headers` only for what a provider asks for (a contact in the User-Agent, an `Accept`), and pass `timeoutMs` where the 30 s default is wrong for that endpoint. An option the operator sets per source is validated when the config is read, not at fetch: the feeds addon refuses hop-by-hop, framing and credential headers, and a `timeoutMs` outside its configured range, each with a warning ([FeedManager](../managers/FeedManager.md#configuration)).
- One slow upstream must not hold up unrelated work. The feeds scheduler ingests due sources side by side, up to `ngdpbase.addons.feeds.max-concurrent-ingests`, so a source hanging until its timeout delays no other ([#1955](https://github.com/jwilleke/ngdpbase/issues/1955)).
- Recurring work is a scheduled job ([Background Jobs](#8-background-jobs)), never `setInterval`: a timer catches nothing up, runs twice during a rolling update, and records nothing when it misses.

---

## Working with core

Who decides what, for every add-on and every agent session working on one (operator, 2026-10-25):

- __Ask before you build.__ Before building anything that is not purely your add-on's domain — fetching, scheduling, imports, files, identities, notifications, email, PDF, consent and the like — ask core whether it already exists or is planned, even when you think it doesn't. A question costs a message; a duplicate costs a migration later (phr's own import engine before ICE, geohazardwatch's own fetch and timer, unchecked user reads in accommodation).
- __Generic work comes to core first__ (operator, 2026-10-20). What would serve more than one add-on, core builds; you use it.
- __If core already has it, use it__ as this guide says, even when your own version would be quicker.
- __Core decides__ (the ngdpbase core session, or an ngdpbase issue):
  - the rules every add-on follows: these guides, [docs/GLOSSARY.md](../GLOSSARY.md), [the identity model](../planning/identity-model.md), [Manager-SOT](../managers/Manager-SOT.md);
  - anything an add-on needs from core;
  - breaking changes and releases: what each add-on must change, by which release;
  - core questions an add-on raises, settled from the guides;
  - review of add-on work against the guides;
  - add-ons with no session of their own.
- __The add-on's session decides__ its own domain work: its records, screens, imports and jobs, within the rules.
- __The operator decides__ domain priorities (what an add-on builds next), and anything that commits outside a working branch: merging, publishing to npm, releasing, deploying.
- __How to reach core__: a message to the core session, or an issue in ngdpbase (cross-repo work is tracked there). Never wait on the operator for a core question: ask core, which answers or, if it truly needs the operator, takes it to them and reports back.
- __What core sends you__: when a release you depend on ships, the version and the exact changes you must make. Make them, run your tests, and reply with what you changed.

## Identity

The slug is the addon's identity. `resolveAddonSlug` (`src/utils/addonsPathResolver.ts`) computes it without loading the module:

- 1 `package.json` `ngdpbase.slug`, when that field is set.
- 2 Otherwise the folder name.
- 3 An npm package with no slug drops a trailing `-addon` from the package directory name, so `@scope/geohazardwatch-addon` is `geohazardwatch`. A directory addon (bundled or drop-in) keeps its folder name verbatim, including a folder that ends in `-addon`.

`npm run create:addon` rejects an `--id` that ends in `-addon`. That is the scaffolder's check. Directory discovery keeps the folder name, as in the rule above.

The `name` exported from `index.ts` or `index.js` is a display label that must equal the slug. On a mismatch the slug is the identity that is used. The config key read is `ngdpbase.addons.<slug>.enabled`. A key written under the module's `name` is ignored. A domain addon logs the mismatch at error; any other addon warns. Dependencies, dedup, and the boot check that an enabled addon exists all key off the slug too.

The same string has to be the one you mount (`/api/<slug>`, `/addons/<slug>`), pass to `engine.setCapability`, put on a dashboard card as `addonName`, prefix job ids with, and stamp as `addon:` on a seed page. A dependency name is the other addon's slug.

What breaks when they disagree:

- The addon stays disabled, because the enable key you wrote does not match the slug.
- A declared dependency does not resolve, and startup errors.
- A later rename leaves the old config keys, the old URLs, and the pages already seeded under the old uuid. Seeding does not move them.

Every other place the slug is written down is the [identity contract](../platform/addon-identity-contract.md). That page is the inventory; the rules above are the ones that decide whether the addon loads.

## The manifest

The `ngdpbase` block in the addon's `package.json` is its manifest, read without importing the module (`AddonManifest` in `src/managers/AddonsManager.ts`, exported by `@jwilleke/ngdpbase-types`). Every field is optional.

| Field | What it does | Rules |
| --- | --- | --- |
| `slug` | The addon's identity | [Identity](#identity) |
| `minVersion` | The oldest core it runs on | [Standing rules](#standing-rules) |
| `type` | `domain` when the addon is the site, else `additive` | [`domainDefaults`](#domaindefaults) |
| `domainDefaults` | Site defaults applied at load | [`domainDefaults`](#domaindefaults) |
| `stores` | Private store kinds it owns | [Declare a Private Store](#declare-a-private-store-1414) |
| `perPerson` | Each user turns it on for themselves | [Per-user add-ons](#per-user-add-ons-and-their-switch) |
| `aboutPage` | The uuid or slug of a page the addon ships in `pages/` that says what it is | Listings link to it as "More about it". The site overrides it with `ngdpbase.addons.<slug>.about-page` in its configuration |
| `family` | The heading the addon is listed under, shared by related add-ons | For example `"Accounting"` on accounting, accounting-donations and accounting-dues. Add-ons with no family are listed under "Other" when any add-on has one |
| `listed` | `false` keeps the addon out of the listings | For plumbing other add-ons use, such as elasticsearch. It still loads |
| `shims` | The names of the import shims it registers | [Import shims and receivers](#import-shims-and-receivers-ice-1979). The host refuses any other |
| `receivers` | The names of the import receivers it registers | [Import shims and receivers](#import-shims-and-receivers-ice-1979). The host refuses any other |

The listings are `[{ConfigAccessor type='addons'}]` (the site's enabled add-ons, with version and status shown only to viewers who hold `admin-read`) and `[{ConfigAccessor type='my-addons'}]` (the viewer's per-user add-ons). Both read `AddonsManager.listedAddons()`; the description shown is the module's `description`.

## Where it is loaded

Three ways an addon reaches a running instance. The slug, the module, and `register()` are the same. Pick by who owns the addon.

| Model | Use it when | Minimum to load |
| --- | --- | --- |
| __bundled__ | First-party, released with ngdpbase | `addons/<slug>/` in this repo, with `index.ts` or `index.js`. Set `ngdpbase.addons.<slug>.enabled` to `true` in the operator file ([Configuration](#configuration)). The default `ngdpbase.managers.addons-manager.addons-path` is `./addons`. |
| __drop-in__ | Your own repo, edited in place | The same directory. Add its parent to `addons-path` (a string, or an array that also keeps `./addons`). Set the same enable key. `./server.sh restart`. |
| __packaged__ | Production of an independent addon | An npm package named `@scope/<slug>-addon`, with `ngdpbase.slug`, `main` pointing at `index.js`, and module `name` equal to the slug. Add `node_modules:@scope/*-addon` to `addons-path`, and set the same enable key. |

`addons-path` is a string or an array. Directory entries are scanned first. A `node_modules:<glob>` entry is expanded after that, and a directory addon of the same slug wins a collision. The runtime image has no npm, so a packaged install is a two-stage copy of `node_modules` — that recipe is [addon-packaged.md](../platform/deployment/addon-packaged.md). The `FROM` image in [section 12](#12-shipping-your-addon-as-a-container-image) is the drop-in wrapper, not the packaged model.

Enabled defaults to false for every addon, on every path. An addon copied into a non-default directory stays off until the enable key is set ([#686](https://github.com/jwilleke/ngdpbase/issues/686) is the open request to change that for non-default paths). The keys, the file they live in, and what `register()` is handed are [Configuration](#configuration).

## Installed add-ons

A fourth way in ([#1830](https://github.com/jwilleke/ngdpbase/issues/1830)): the site's configuration names an npm package, a version range and the repository it is built from, and ngdpbase installs it into the data folder. Nothing in the code tree changes.

```json
"ngdpbase.addons.install": {
  "ledger": { "package": "@acme/ledger-addon", "version": "^1", "repository": "github.com/acme/ledger" }
},
"ngdpbase.addons.ledger.enabled": true
```

- __Where it goes:__ `<instance data folder>/addons/<slug>/`. Installing does not enable it: the enable key still decides.
- __What loads from there:__ only add-ons the installer installed and verified on this start, named in the install map and in the lock file. Any other folder there (copied in by hand, or left after its entry was removed from the install map) is not loaded, and admins are warned. It never stops the boot, even when its enable key is set. This holds even if `addons-path` names the folder.
- __First start:__ the highest release in the range whose `ngdpbase.minVersion` this core meets ([#1757](https://github.com/jwilleke/ngdpbase/issues/1757)) is fetched from the registry (`registry.npmjs.org`) through the outbound guard. Then:
  - its tarball's sha512 must match the registry's `dist.integrity`;
  - its Sigstore provenance attestation must be valid for that exact tarball and come from a GitHub Actions or GitLab CI workflow of the configured `repository`. A release with no provenance, with provenance that does not verify, or with provenance from another repository is refused;
  - its own `package.json` must name the same package, version and slug;
  - it is unpacked with no links and no path outside the folder, within the size limits, into a staging folder that is renamed into place;
  - it is pinned in `<data>/addons/addons-lock.json` (`package`, `version`, `integrity`, `installedAt`, `provenance: { repository, verifiedAt }`), and the tarball is kept in `<data>/addons/.packages/`.
- __Every later start:__ the stored tarball is checked against the lock's sha512 and the folder against the tarball. The registry is never asked. A newer release in the range is not picked up on a restart. A folder that differs from its tarball is rewritten from it, and admins are told. A tarball that fails its sha512 is not trusted: the folder is moved to `.rejected-<slug>-<time>` and the add-on is not loaded. Changing the configured package, range or repository so the pin no longer answers it installs again.
- __Registry unreachable, or anything refused:__ the site starts without that add-on, the reason is logged, and admins get a notification such as "ledger not installed: registry unreachable". The next start tries again. A folder already at `<data>/addons/<slug>` that the installer did not put there is left alone.
- __Audit:__ `addon-install` is recorded before an install is written (on-failure `refuse`), and `addon-verify-failed` whenever a sha512, provenance, tarball, package.json, lock or folder check refuses (on-failure `continue`). Both are attributed to the system principal. `addon-update` is declared, switched off, for the admin Update action.
- __Publishing:__ publish from CI with npm trusted publishing and provenance (`npm publish --provenance`, or trusted publishing, which adds it). The package is unpacked as published, and no `npm install` runs (the runtime image has no npm, [#956](https://github.com/jwilleke/ngdpbase/issues/956)). An add-on with runtime dependencies of its own has to bundle them. `create:addon --repo` writes the workflow that does this into the add-on's own repository, `.github/workflows/publish.yml` ([#1863](https://github.com/jwilleke/ngdpbase/issues/1863)). It is a generated file, not a reusable workflow kept in ngdpbase: npm checks the calling workflow's name, and the Sigstore certificate of a reusable workflow names the repository that holds it, which the installer refuses. The certificate of this one is issued to it under `https://github.com/<owner>/<repo>/`, which is the `repository` the site's install entry names.
  - __Tags:__ `<slug>-v<version>` (for example `accounting-v0.1.0`) publishes `addons/<slug>/`, so one repository can hold several add-ons side by side. The package name comes from that folder's `package.json`, never from the slug. A plain `v<version>` tag publishes only in a repository generated with `--plain-tags`, whose `v*` tags belong to its one add-on. A repository that is also an application keeps `v*` for its own releases. The workflow refuses a tag whose `addons/<slug>/package.json` is missing, whose `ngdpbase.slug` differs, or whose version is not the tag's.
  - __Rules__, each refused with an `::error::` message: not `private`; `repository` is `{ "type": "git", "url": "https://github.com/<owner>/<repo>.git", "directory": "addons/<slug>" }` for the repository running the workflow (`git+` and a missing `.git` are accepted); `files` is an explicit list; `ngdpbase.minVersion`, `license`, and `engines.node` of `>=24.15.0` or later are set; every `dependencies` entry is in `bundleDependencies`.
  - __Build against core:__ when the add-on's files import `../../dist/` (`node_modules` aside), ngdpbase is checked out at tag `v<ngdpbase.minVersion>` in a side folder, `npm ci` and `npm run build` run there, and its `dist` is linked as `dist` at the repository root. An add-on with no such import skips this.
  - __Order:__ the add-on's `npm ci`, build and tests (tests may import core); then `npm pack --dry-run --json`, refusing a tarball that holds `.ts` (other than `.d.ts`) or `__tests__`; then `npm pack`, and `npm publish <that tarball> --provenance --access public` on the job's OIDC token (`id-token: write`, no stored token). A second job, the only one with `contents: write`, attaches that exact published tarball and its sha512 (handed over as a workflow artifact, not fetched back from npm) to a GitHub release for the tag, once `npm view` reports the same `dist.integrity`; it polls with backoff for up to `NPM_WAIT_SECONDS` (900; npm can take several minutes to serve a new version) and fails with an `::error::` on a timeout or a mismatch (publish workflow version 4). A timeout means the package is published but the release was not made: once `npm view <name>@<version>` shows it, re-run the failed jobs.
  - __Latest release:__ a release for a `<slug>-v<version>` tag is created with `--latest=false`, so it never becomes the repository's Latest; in a repository that also releases an application on `v*` tags, Latest stays the application's. A plain `v<version>` tag (`--plain-tags`) belongs to the one add-on, and GitHub marks Latest as usual. The workflow decides from the tag itself.
  - __A repository that also versions an application by tags__ must match its own tag pattern wherever it reads a version from tags, for example `git describe --tags --match 'v[0-9]*'`, so an add-on's `<slug>-v<version>` tag never becomes the application's version.
  - __First release:__ npm adds a trusted publisher only to a package that already exists, and adding one needs an interactive login with 2FA. The npm owner claims the name once by hand: an empty `0.0.0` holding only `package.json` and a README saying it is not installable, published with `npm publish --access public`. It is not deprecated. The installer refuses it (it has no provenance), and a range such as `^0.1.0` excludes it anyway. Then the trusted publisher is added on npmjs.com or with `npm trust` (npm 11.15.0 or later locally; the workflow itself needs 11.5.1 and checks for it), the `package.json` is made to follow the rules (the scaffold's `"private": true` is its safe default), and the first real version, `0.0.1` or later, is tagged. The generated `README.md` spells out these steps and the site's `ngdpbase.addons.install` entry.
  - __Keeping it current:__ the file's first line is a version marker, `# ngdpbase-publish-workflow: <n>`. `npm run create:addon -- --update-publish --target <repo>` rewrites an existing repository's `publish.yml` to the current version, keeping the tag style the file uses.
- __Tuning:__ `ngdpbase.managers.addons-manager.install.registry`, `.sigstore-tuf-url`, `.timeout-ms`, `.max-metadata-bytes`, `.max-tarball-bytes` and `.max-unpacked-bytes`. The registry must be `https`, and tarballs and attestations must come from the same origin.

Not done yet: the admin Update action, and including the installed copies in the site backup. They are listed in [Known gaps](#known-gaps).

## Configuration

An addon's settings are ordinary configuration keys. Three layers, and the later one wins: shipped `config/app-default-config.json`, then each enabled addon's `config/default-config.json`, then the operator file. `domainDefaults` is a separate boot-only write, at the end of this section.

### The namespace

Keys for this addon are `ngdpbase.addons.<slug>.*`. `<slug>` is the canonical identity from [Identity](#identity), and the `name` exported from `index.ts` or `index.js` must be that same string. A key written under a different `name` is not read.

`getAddonConfig` collects every key with that prefix, resolves env-var references (below), strips `ngdpbase.addons.<slug>.`, and passes the rest to `register(engine, config)`. One remaining segment stays a property. Further dots become a nested object.

| Key in the file | `config` in `register()` |
| --- | --- |
| `ngdpbase.addons.journal.enabled` | `config.enabled` |
| `ngdpbase.addons.journal.defaultAuthorLock` | `config.defaultAuthorLock` |
| `ngdpbase.addons.journal.streakEnabled` | `config.streakEnabled` |
| `ngdpbase.addons.demo.admin-account.password` | `config['admin-account'].password` |

### Defaults the addon ships

`addons/<slug>/config/default-config.json` holds fully qualified keys. `npm run create:addon` writes it, with or without `--repo`. Writing the file by hand is the same shape. A key whose name starts with `_` is a comment and is dropped.

The file is a merge layer, and only once the addon is enabled. Maps merge per entry. An array of objects that each have an `id` merges by that id, so the file can add `ngdpbase.permissions.definitions` and `ngdpbase.access.policies` without replacing the catalogs. A plain array replaces wholesale. The operator file still wins over the addon file. The permission recipe is [Permissions](#permissions).

### Where the operator overrides it

The operator file is `<instance data folder>/config/app-custom-config.json`.

The instance data folder is `FAST_STORAGE`, otherwise `INSTANCE_DATA_FOLDER`, otherwise `./data`. `INSTANCE_CONFIG_FILE` changes the filename. On a checkout that sets `FAST_STORAGE`, the file is `$FAST_STORAGE/config/app-custom-config.json`.

### The enable key and `addons-path`

- `ngdpbase.addons.<slug>.enabled` — default `false`, on every discovery path. Set it to `true` in the operator file. The copy of this key inside `default-config.json` does not turn the addon on: that file is read only after the shipped-plus-operator view already says enabled.
- `ngdpbase.managers.addons-manager.addons-path` — where discovery looks. Shipped value `./addons`. A string or an array of directory paths, plus `node_modules:<glob>` entries for packaged addons. See [Where it is loaded](#where-it-is-loaded).
- `ngdpbase.managers.addons-manager.enabled` — shipped `true`. `false` discovers nothing.

### Secrets

A secret is an environment variable, not a literal in either JSON file. `default-config.json` ships with the addon. The operator file is still a config file.

The process loads environment variables in this order, highest first: the ambient environment, then `<instance data folder>/.env`, then `<cwd>/.env` (`src/bootstrap-env.ts`). `./server.sh` sources the same files before Node starts.

Point the config key at the variable with a bare whole-value reference. The name is uppercase letters, digits, and underscores:

```json
"ngdpbase.addons.my-addon.apiKey": "$MY_ADDON_API_KEY"
```

`getProperty` resolves that before `register()` sees `config.apiKey`. If `MY_ADDON_API_KEY` is unset, that one key is omitted and a warning is logged; the addon still loads. Treat a missing `config.apiKey` as "not configured".

`${VAR}` is the other form, for a path inside a longer string (`"${FAST_STORAGE}/my-addon"`). An unset variable is left as the literal `${VAR}`. A value that should start with a dollar sign is written `$$`.

#### A secret inside a map

A map of entries the site adds to, each holding a secret (bank accounts, each with an account number), keeps the secret as a `$NAME` reference inside the entry and declares it `secret` by its path, with `*` for the map key ([#1889](https://github.com/jwilleke/ngdpbase/issues/1889)). One entry covers every account a site adds, so a forgotten entry cannot leak a new one:

```json
"ngdpbase.config.sensitive-values": {
  "ngdpbase.addons.accounting.accounts.*.account-number": "secret"
},
"ngdpbase.addons.accounting.accounts": {
  "checking": { "name": "Checking", "kind": "bank", "account-number": "$CHECKING_ACCOUNT_NUMBER" }
}
```

`config.accounts.checking['account-number']` in `register()` is the variable's value. The account number is hidden on the admin screen, in page plugins, log lines and config-change audit records; the reference `$CHECKING_ACCOUNT_NUMBER` is shown, since it is not the secret. If any account's variable is unset, the whole `accounts` key is omitted from `config` with a warning, as an unset top-level reference is; treat a missing map as "not configured". Your file may classify only `ngdpbase.addons.<slug>` and what is under it: an entry for core's keys or another add-on's refuses your add-on, and it is not loaded. The rules are in [configuration-developer-guide.md](configuration-developer-guide.md#standing-rules).

### `domainDefaults`

`package.json` `ngdpbase.domainDefaults` is a map of fully qualified keys applied at load, before `register()`, when the operator file does not already set that key. The write is `setRuntimeProperty`: this boot only, not saved to the operator file. A domain addon uses it for a site default such as the active theme:

```json
{
  "ngdpbase": {
    "slug": "my-addon",
    "type": "domain",
    "domainDefaults": { "ngdpbase.theme.active": "my-addon" }
  }
}
```

Any addon may set the field. The operator file wins.

### When an addon does not load: `site-critical`

Every enabled addon that does not load sends admins a notification at the most severe level, `error`, titled "Critical: add-on `<slug>` did not load", naming the reason and, where the reason knows it, the fix ([#1883](https://github.com/jwilleke/ngdpbase/issues/1883), operator 2026-10-18). Any reason counts:

- a database declared `encrypt: "required"` with no `NGDPBASE_DATABASE_KEY` (the fix: set the key in `<FAST_STORAGE>/.env` and restart);
- a refused declaration: its system-category, its database, or its `site-critical` value;
- a `minVersion` newer than the core;
- an import that throws, or a module with no `register()`;
- `register()` throwing, which includes a database you open there failing its migrations or its integrity check;
- a dependency that is not installed or not enabled (then no addon loads);
- an enabled addon that was never found, such as one whose install failed.

Its status on `/admin/addons` shows the same reason. A turned-off addon is never reported.

Most addons stop there: the site runs without them. An addon the site can't work without declares itself __site-critical__ in its `config/default-config.json`:

```json
{
  "ngdpbase.addons.phr.site-critical": true
}
```

When a site-critical addon does not load, for any of the reasons above, the whole site starts in maintenance mode through the one maintenance door every manager uses ([#1906](https://github.com/jwilleke/ngdpbase/issues/1906); see [the managers guide](managers-developer-guide.md#maintenance-mode-has-one-owner)):

- __Visitors__ get the maintenance page with the site's maintenance message (`ngdpbase.features.maintenance.message`, any text an admin sets) and no details. `/health/readiness` answers 503 with that message only. The retired `ngdpbase.managers.addons-manager.site-critical.public-message` is still used when a site set it and has not set the maintenance message.
- __Admins__ can still sign in and reach `/admin`, where the notification says which addon failed, why, and how to fix it. Fix the cause and restart.
- Nothing is opened or written in its place: an addon whose encrypted database has no key stays off, and its database stays closed.

The rules for the value:

- It is exactly `true` or `false`. Anything else, the string `"true"` included, refuses the addon and counts as `true`, so a mistyped value fails closed.
- An addon declares only its own key. A `site-critical` key for another slug in your file is ignored.
- The site's `app-custom-config.json` wins in both directions: an operator can make any addon site-critical, or turn yours off.
- Declare it only when the site is wrong without you: a health-record addon whose records are the site. A calendar, a feed or a search addon is not site-critical.

## Permissions

Declare the permission and grant it in the addon's own `config/default-config.json`. That file is the merge layer in [Configuration](#configuration): maps merge per entry, and an `id` array merges by id. Do not append to a role's `permissions` array.

```json
{
  "ngdpbase.permissions.definitions": {
    "my-addon-manage": {
      "description": "Create and edit my-addon records",
      "label": "Manage my-addon records",
      "icon": "cog",
      "color": "#0d6efd"
    }
  },
  "ngdpbase.access.policies": [
    {
      "id": "my-addon-manage-access",
      "name": "My addon management",
      "priority": 90,
      "effect": "allow",
      "subjects": [{ "type": "role", "value": "admin" }],
      "resources": [{ "type": "page", "pattern": "*" }],
      "actions": ["my-addon-manage"]
    }
  ]
}
```

`label` is the permission in plain words for the user reading it: the __Can do__ column of "My tokens and devices", the app consent screen, the roles matrix and the shipped Permissions page all show it. `description` is the note for administrators and developers. Without a `label` those places show the `description`, so give one. A scope that is not a permission at all (an app's own scope) has no declaration and is shown by its name.

A policy may name the roles it grants on day one. An operator narrows that in `app-custom-config.json`. Addon code never names a role.

__A permission over a user's own records__ ("your receipts", "your health record", "your residency") is always granted to every user, the same way in every add-on (operator, 2026-10-24): name the role every account is given, never site roles and never a list of every role. Core gives every account the roles in `ngdpbase.user.account-roles` (shipped: `vault-owner`), new accounts when they are created and older ones once at the next start ([#1539](https://github.com/jwilleke/ngdpbase/issues/1539)); core's own `signed-in-self-service` policy grants `profile-manage` the same way. Put the grant in your own policy:

```json
{
  "id": "my-addon-self-service",
  "name": "My addon: every user's own records",
  "priority": 90,
  "effect": "allow",
  "subjects": [{ "type": "role", "value": "vault-owner" }],
  "resources": [{ "type": "page", "pattern": "*" }],
  "actions": ["my-addon-self"]
}
```

- Never declare a core policy's `id` (such as `signed-in-self-service`) to add to it: policies merge by `id`, so that changes core's own policy, and the change outlives your add-on.
- Never use `"type": "authenticated"` (or `user`, `group`, `attribute`, `admin`) as a subject: a decision matches only `role` and `job` subjects, so such a policy grants nothing, and the validator refuses it.
- A list of every role by name misses any role added later; name the every-account role.

__A permission your scheduled job needs__ goes to the job itself, not to a role ([#1999](https://github.com/jwilleke/ngdpbase/issues/1999), operator 2026-10-22). Name the job as the policy's subject, with only what its work needs:

```json
{
  "id": "my-addon-month-close-job",
  "name": "My addon: the month-close job",
  "priority": 90,
  "effect": "allow",
  "subjects": [{ "type": "job", "value": "my-addon.month-close" }],
  "resources": [{ "type": "page", "pattern": "*" }],
  "actions": ["my-addon-close", "ledger-read"]
}
```

- The job's scheduled runs then act as `job:my-addon.month-close`: they hold exactly what policies naming the job grant, and nothing of the system principal's admin roles. A job no policy names runs with the system principal's roles, as before.
- Name only your own jobs, `<slug>.<job>`. A policy naming core's job or another add-on's refuses your add-on, and it does not load.
- A site can change or remove the policy in its configuration. Removed, the job runs with the system principal's roles again.
- Run now and a rerun act as the admin who clicked, with that admin's own permissions. An admin who lacks what the job needs (an admin without ledger access) is refused; only the scheduled run, or someone who holds both the job's permissions and `admin-system`, can do the job's work.
- In the job, ask with `ctx` as given: `await pdp.permits(ctx, 'ledger-read')`, or hand `ctx` to the manager door. Never build a subject from it.

A route asks `await ctx.requirePermission('my-addon-manage')` or `await ctx.hasPermission('my-addon-manage')` on an `ApiContext`. A page door asks `canAccess` or `hasPermissionOn`.

An add-on's manager that guards its own records is the PEP for that resource type, and asks the PDP itself ([#1431](https://github.com/jwilleke/ngdpbase/issues/1431)), with the context it was handed: `const d = await pdp.decide(ctx, { action, resource }); if (!d.permit) await ctx.enforceDeny(action, d);`. `decide`, `permits` and `holds` take an `ActorContext`, a job's included, and turn it into a subject themselves; never convert or rebuild it first ([#2022](https://github.com/jwilleke/ngdpbase/issues/2022)). `ctx.enforceDeny(permission, decision)` always throws the same `ApiError` that `requirePermission` throws after a "no": 401 for an anonymous caller, else 403; for a step-up deny on a request, 403 with the `reauth` link, the prompt recorded by `AuthManager`; a delegated credential (agent token, share, proxy ceiling) is never offered a `reauth`. Handed an allow, it throws a programming error. `ApiContext` reaches an add-on through `host.ApiContext`, so `enforceDeny` is there with it. Never rebuild refusal shaping in an add-on — no `new ApiError(403, …)` after a deny, no reading `decision.reason`: `enforceDeny` is the one implementation. Core records every refusal it makes as `authorization-deny` (decided 2026-10-17, not built yet); your manager records only what it allowed and did, with the record's `owner` ([audit-developer-guide.md](audit-developer-guide.md#who-records-what)). The route shape is [Writing Routes](#7-writing-routes). Deny policies, the token ceiling, and vault-owner are [security-developer-guide.md](security-developer-guide.md).

Worked examples: `addons/journal/config/default-config.json` declares `journal-read`, `journal-write`, and `journal-export` in one policy, `journal-access`. `addons/calendar/config/default-config.json` declares `calendar-manage` and `calendar-reserve`.

## Testing and lint

An addon under `addons/` is linted with the host. These run in `npm run lint`, in `lint:ci`, and (for the ones named) on the pre-commit hook:

- `npm run lint:code` — eslint on `src/**/*.ts`, `addons/**/*.ts` and `packages/`. The hook runs `eslint --fix` on the staged `.ts` files.
- `npm run lint:addons` — no addon value-import of host `src/`, and none of core's `dist/` in addon runtime code ([#1813](https://github.com/jwilleke/ngdpbase/issues/1813); `import type` and tests exempt), no compiled `.js` left under `src/`, no value import of `pluginFormatters` outside PluginManager ([#1820](https://github.com/jwilleke/ngdpbase/issues/1820)), and no value import of `express` in addon runtime code ([#1861](https://github.com/jwilleke/ngdpbase/issues/1861); types and tests exempt). On the pre-commit hook.
- `npm run lint:http`, `npm run lint:csrf`, `npm run lint:gates`, `npm run lint:permission-subject` — outbound HTTP, CSRF, role-name gates, and rebuilt permission subjects. Each scans `addons/` as well as `src/`. On the pre-commit hook.
- `npm run lint:audit` — declared audit events are emitted, including the add-on's own (declared in its `config/default-config.json`, emitted with `host.recordAuditEvent` and `host.addonAuditEventName`; see [audit-developer-guide.md](audit-developer-guide.md#addons)). On the pre-commit hook. An add-on kept in its own repository runs the same check on its own directory, from the image: `node dist/scripts/audit-coverage.js --check --addon <dir>` (the CI that `create:addon --repo` generates does this).

`npm run check:addon-load` is not on the hook. After `npm run build:addons` (or `npm run build`), it imports each `addons/*/index.js` in a child Node process. It does not call `register()`.

`src/__tests__/viewsScriptNonce.test.ts` (in `npm test`) checks every bundled addon's `views/`: each inline `<script>` carries the CSP nonce, and there is no inline event handler or `javascript:` URL. The contract is [Scripts in a view](#scripts-in-a-view-the-csp-nonce-contract).

Unit tests sit beside the addon (`addons/<slug>/__tests__/**/*.ts` or `addons/<slug>/*.test.ts`). `npm test` includes them. An addon in its own repository gets core's host, an in-memory addon database, `toCsv` and the plugin formatters for its tests from `@jwilleke/ngdpbase-types/testing` ([Types and the test kit](#types-and-the-test-kit-jwillekengdpbase-types)). A test teardown removes only the directories that test created. It must not delete `./data/` wholesale.

A TypeScript addon in this repo needs `npm run build:addons` before `./server.sh restart`. When `index.js` is present, that is the file discovery loads.

---

## Quick start: scaffold a new addon (#675)

The fastest path to a working addon is to generate one, then edit it:

```bash
npm run create:addon -- --id volcano-watch
```

That writes `addons/volcano-watch/` containing a manifest with the correct
canonical slug, an `index.ts` that registers a manager and a plugin, a seed page
with a freshly generated UUID, and a `README.md`. Enable it and restart, and the
addon loads and its page seeds.

```bash
# name the plugins and managers up front, and write somewhere else
npm run create:addon -- --id volcano-watch --type domain \
  --plugins VolcanoMap,VolcanoList --managers VolcanoData \
  --target ../volcano-watch --scope @your-scope
```

| Flag | Default | Meaning |
|---|---|---|
| `--id` | *(required)* | Canonical slug — lowercase, digits, single dashes |
| `--type` | `additive` | `additive` augments an instance; `domain` means the addon __is__ the site |
| `--plugins` | one, named from the id | Comma-separated plugin names |
| `--managers` | one, named from the id | Comma-separated manager names |
| `--scope` | *(required outside this checkout's `addons/`)* | npm scope: the package is `<scope>/<id>-addon`. A bundled addon (in `addons/`) needs none and is `@ngdpbase/<id>` |
| `--repo` | off | Write a whole repository, with the addon at `addons/<id>/`. No `Dockerfile`: deployment files live in the site repo |
| `--target` | `addons/<id>`; with `--repo`, `../<id>` | Output directory |
| `--force` | off | Write into a non-empty directory |
| `--plain-tags` | off | With `--repo`: a plain `v<version>` tag also publishes, for a repository whose `v*` tags belong to its one add-on. Without it only `<slug>-v<version>` tags publish |
| `--update-publish` | off | With `--target <repo>` and no other flag: rewrite that repository's `publish.yml` to the current version, keeping its tag style |

Two things the scaffolder gets right that are easy to get wrong by hand:

- __Identity.__ The `ngdpbase.slug` in `package.json` and the `name` exported
  from `index.ts` are emitted from one value, so they cannot disagree — the
  mismatch [#927](https://github.com/jwilleke/ngdpbase/issues/927) exists to
  catch. A trailing `-addon` in `--id` is rejected by the scaffolder. The
  load-time rules are [Identity](#identity).
- __Package name, version, licence__ ([#1676](https://github.com/jwilleke/ngdpbase/issues/1676)). An addon outside this checkout is published under its own project's npm scope, so `--scope` is required there and the scaffolder never guesses one: `--scope @yourphr` gives `@yourphr/volcano-watch-addon`, which is what `node_modules:@scope/*-addon` discovery matches. Every scaffold starts at `0.1.0`, in `package.json` and `index.ts` alike, under `Apache-2.0`.
- __Page UUIDs.__ Seed pages get a real v4 UUID, generated with the same `uuid`
  package `ValidationManager` uses. A hand-copied or placeholder UUID makes
  `AddonsManager` skip the page with a warning and an admin notification. The
  seeder also requires a title and a slug.

The manual walkthrough below still applies — read it to understand what the
generated files do, and for anything the scaffolder does not emit (routes,
views, themes, static assets).

### A whole repository: `--repo`

An addon you own lives in its own repository. `--repo` writes that repository in one step:

```bash
npm run create:addon -- --id volcano-watch --repo --target ../volcano-watch --scope @your-scope
```

The addon lands at `addons/volcano-watch/`, byte-for-byte what the command writes without `--repo`. Around it:

| File | What it does |
|---|---|
| `renovate.json` | `config:recommended`: keeps the dev dependencies and the CI actions current. No rule for the ngdpbase image |
| `.github/workflows/ci.yml` | Typechecks the addon inside the `-devtools` image of the release in `ngdpbase.minVersion` (the oldest core it claims to run on), runs the audit-event check, checks the slug against the exported `name`, and checks seed page UUIDs. It builds no image |
| `.github/workflows/publish.yml` | On a `<slug>-v<version>` tag (or `v<version>` with `--plain-tags`), checks the package, builds and tests it (against core at `ngdpbase.minVersion` if it imports core), publishes it to npm with provenance through npm trusted publishing, and makes a GitHub release with the tarball and its sha512. See [Installed add-ons](#installed-add-ons), Publishing |
| `LICENSE` | Apache-2.0, as ngdpbase |
| `.gitignore` | `node_modules/`, `dist/`, `data/`, `.env` and the like |
| `README.md` | How to run it, how to release it (the one-time npm setup, tagging, the site's install entry), and a link back to this guide |

There is no rename step: every name comes from `--id`, `--plugins` and `--managers`. The repository replaces the retired `ngdpbase-addon-template`.

The repository holds nothing deployment-specific ([#1829](https://github.com/jwilleke/ngdpbase/issues/1829)): no `Dockerfile`, no `.dockerignore`, no Renovate rule for the ngdpbase image. Those belong to the site repo that builds and deploys the site, described in [Shipping Your Addon as a Container Image](#12-shipping-your-addon-as-a-container-image); the generated `README.md` points there. For production prefer the packaged model in [addon-packaged.md](../platform/deployment/addon-packaged.md).

The scaffolder needs no `.env` and no run-as user (`PUID`/`PGID`): it reads only this checkout's `package.json` and `LICENSE`, so it runs in a fresh clone.

---

## 1. Repository Setup

A first-party addon is `addons/<slug>/` in this repository. An addon you own is the same shape inside its own repo. The layout:

```
my-addon-repo/
└── addons/
    └── my-addon/
        ├── index.js          ← entry point (index.ts is accepted; index.js wins if both exist)
        ├── managers/
        ├── routes/
        ├── plugins/
        ├── pages/            ← pages seeded into the instance on startup
        ├── theme/            ← optional; auto-deployed to themes/<addon>/ on first boot (theme.json required)
        ├── public/           ← static assets (CSS, JS, images)
        └── README.md
```

The `addons/` subdirectory is what gets wired into ngdpbase via config.
You can host multiple add-ons in one repo under the same `addons/` directory.
Which of the three models you are in, and the minimum config for each, is [Where it is loaded](#where-it-is-loaded).

Use [`addons/journal/`](../../addons/journal/) and [`addons/calendar/`](../../addons/calendar/) as the reference implementations. Calendar depends on [`addons/forms/`](../../addons/forms/). All three are TypeScript with their own `tsconfig.json`, compiled in place by `npm run build:addons`. `AddonsManager` loads `index.js` when that file is present, and `index.ts` only when it is not.

---

## 2. Wire into Your Running Instance

This is the drop-in wire-up. A bundled addon uses the default `./addons` path and only needs the enable key. A packaged addon uses a `node_modules:<glob>` entry. See [Where it is loaded](#where-it-is-loaded). The file below is the operator file from [Configuration](#configuration): `<instance data folder>/config/app-custom-config.json`.

Add to that file:

```json
{
  "ngdpbase.managers.addons-manager.addons-path": "/absolute/path/to/my-addon-repo/addons",
  "ngdpbase.addons.my-addon.enabled": true
}
```

Restart the server: `./server.sh restart`

The `AddonsManager` scans the path, finds all subdirectories with `index.js` or `index.ts`, and loads the enabled ones in dependency order. When both files exist, `index.js` is the one loaded.

### Multiple Addon Paths

`addons-path` accepts either a single string __or an array of strings__. This lets you mix generic
add-ons (kept in `fairways-base/addons/`) with non-generic ones hosted in separate repositories:

```json
{
  "ngdpbase.managers.addons-manager.addons-path": [
    "./addons",
    "/absolute/path/to/external-addon-repo/addons"
  ],
  "ngdpbase.addons.my-addon.enabled": true,
  "ngdpbase.addons.external-addon.enabled": true
}
```

Each path is scanned in order. If the same slug appears in more than one path, the first
occurrence wins and subsequent duplicates are skipped with a warning in the logs.

__Convention:__ keep generic/reusable add-ons in `fairways-base/addons/`; keep site-specific or
private add-ons in their own external repo and reference that path in the array.

---

## 3. The AddonModule Interface

Your `index.js` must export an object (or `module.exports =` in CommonJS):

```javascript
/** @type {import('../src/managers/AddonsManager').AddonModule} */
module.exports = {
  name: 'my-addon',          // must equal the canonical slug; see Identity
  version: '1.0.0',
  description: 'What this add-on does',
  author: 'Your Name',
  dependencies: [],           // names of other add-ons that must load first
  optionalDependencies: [],   // load these first if installed and enabled; never required

  async register(engine, config, host) {
    // Called at startup if enabled. Mount routes, init data, register plugins.
    // host: the core values this add-on may use; see "The host parameter".
  },

  async status() {
    // Optional. Called by /admin/addons for health display.
    return { healthy: true, message: 'OK' };
  },

  async shutdown() {
    // Optional. Called on graceful server shutdown.
  }
};
```

### The `config` parameter

`config` is the addon's namespace with the prefix stripped and env-var references resolved. The rules are [Configuration](#configuration).

```javascript
async register(engine, config) {
  // The add-on's folder: what core backs up and restores for it (#1985).
  const dataPath = config.dataPath || engine.getManager('ConfigurationManager').resolveDataPath('my-addon');
  const apiKey = config.apiKey; // set only when $MY_ADDON_API_KEY was set
}
```

`dataPath` is `ngdpbase.addons.<slug>.dataPath`, or `<FAST_STORAGE>/<slug>` when it is not set (`resolveDataPath(slug)`). That folder is backed up and restored for you ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985); [Backup](#backup-your-datapath-is-backed-up-for-you)), so keep your files there, not in a path of your own such as `./data/my-addon` relative to the working directory.

### The `host` parameter

`host` is how an addon reaches core values ([#1813](https://github.com/jwilleke/ngdpbase/issues/1813)). Core builds one for each addon from its own running code, and freezes it. The names are the ones the values were imported under: `import { X } from '../../dist/…'` became `const { X } = host` when the bundled addons moved over, and `lint:addons` now refuses the import ([Importing core](#importing-core--types-only)).

| Name | What it is |
|---|---|
| `ApiContext`, `ApiError`, `sendApiError` | Requests and refusals ([ApiContext](#apicontext--authentication-and-authorisation)) |
| `recordAuditEvent`, `addonAuditEventName` | Audit, limited to this addon's own events (below) |
| `actorOf` | The "who" of an audit record, from a context |
| `jobContextFromRequest`, `jobContextFromSystem` | Contexts for [Background Jobs](#8-background-jobs) |
| `systemContext(reason)` | The context your own start-up work runs under: core's system principal (`NGDPBASE_SYSTEM_USER`, never a name you choose), with `reason` for the record ([#1973](https://github.com/jwilleke/ngdpbase/issues/1973)) |
| `logger` | Core's logger, every line tagged `addon=<slug>` |
| `guardedFetch` | Outbound HTTP through the egress guard, with the site's default User-Agent when the request names none |
| `setEnabledForPerson` | Turn this add-on on or off for a user, when it is [per-user](#per-user-add-ons-and-their-switch) |
| `registerShim`, `registerReceiver` | Register an import shim or receiver under this addon's slug, only the names its manifest declares ([Import shims and receivers](#import-shims-and-receivers-ice-1979)) |
| `resolveEgressPolicy`, `validateUrl` | The site's egress policy, read through a `getProperty` reader at each call, and whether a URL may be fetched under it (before any socket) |
| `createGuardedElasticsearchClient`, `refusedNodeMessage` | An Elasticsearch client whose every connection the egress policy judges (the only way to build one), and the one boot line for a refused node |
| `isAtLeast` | Whether an `x.y.z` version is at least another; throws on anything else |
| `zonedParts(instant, timeZone)` | An instant's local `year`, `month` (1–12), `date` (`YYYY-MM-DD`), `day` (weekday) and `minutes` since midnight in a time zone: core's own, so a job needs no Intl code ([A job that runs on a schedule](#a-job-that-runs-on-a-schedule), [#1998](https://github.com/jwilleke/ngdpbase/issues/1998)) |
| `keyedSerial()` | A new `KeyedSerial`, core's own per-key queue, at each call: one per manager, to [change your own records one at a time](#change-your-own-records-one-at-a-time) ([#2065](https://github.com/jwilleke/ngdpbase/issues/2065)) |
| `reviews`, `registerReviewHandler` | Core's one way to review requests: file one for the holders of a permission to decide, and register the handler that carries an approval out, only under this add-on's slug ([Ask for a review](#ask-for-a-review), [#2072](https://github.com/jwilleke/ngdpbase/issues/2072)) |

```typescript
async register(engine, config, host) {
  const { ApiContext, ApiError, sendApiError, logger } = host;
  logger.info('ready'); // logged as "ready addon=my-addon"
}
```

- `host.recordAuditEvent` and `host.addonAuditEventName` accept only the audit events this addon declares in its own `config/default-config.json`, as a permission entry's `audit` field (an entry with `"grantable": false` when it records something nobody is granted; [audit-developer-guide.md](audit-developer-guide.md#addons)). Any other name, core's or another addon's, throws, so one addon cannot write records that look like another's.
- `host` is frozen. Nothing in it is removed or renamed without a major release; raise `minVersion` when the addon starts using a name core added.
- An addon whose `register` takes two arguments still loads.
- Anything an addon needs that `host` does not offer is added to core by pull request; the addon does not import it.

### A section on the signed-in user's profile ([#534](https://github.com/jwilleke/ngdpbase/issues/534))

An addon that has per-user settings adds a card to `/profile` instead of building its own settings page. Two optional hooks on the module do it, declared on `AddonModule` in `src/managers/AddonsManager.ts`:

- `profileSection(user)` returns `{ title, html }` (`AddonProfileSection`), or `null` to show nothing for this user. `user` is the user's record without the password hash (`AddonProfileUser`), with their resolved `roles`.
- `saveProfileSection(ctx, body)` saves what the card's fields submitted. Since [#1234](https://github.com/jwilleke/ngdpbase/issues/1234) the first argument is the caller's context, not a username: pass `ctx` on to whatever you write, never build a new one from `ctx.username`. Merge your fields into the user's preferences with `updateUser`'s function form, so the merge reads the account as it is now ([Change a user](#change-a-user-the-function-form)). An addon still written as `(username, body)` gets a warning at load naming it, and each of its saves then fails and is logged.

What it is not: it is only the signed-in user's own `/profile`. There is one route, `/profile`, and it always shows the user who is signed in; there is no profile page for someone else. Showing data about anyone else belongs on the addon's own pages, behind the addon's own permission ([Permissions](#permissions)).

How core calls them:

- `GET /profile` (checked against `profile-manage`) reads the user's fresh record and calls `AddonsManager.getProfileSections(user, ctx)`. It calls every loaded addon's `profileSection(user, ctx)` in parallel, where `ctx` is the signed-in user's own context: pass it to your manager's door and the PDP, and never rebuild a subject from `user` ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)). An addon that throws, or returns anything other than `{ title: string, html: string }` or `null`, is logged and left out; the page still renders. `views/profile.ejs` shows each section as a card inside the preferences form, after the core preferences, in the order the addons loaded.
- `POST /preferences` (also `profile-manage`) saves the core preferences first, then calls `AddonsManager.saveProfileSections(ctx, body)` with a copy of the request body. The addons are called one at a time, so each one's read-merge-write of the user's preferences sees the one before it. Dotted field names arrive flat: `<input name="journal.x">` is `body['journal.x']`. An addon that throws is logged; it does not stop the core save or another addon's save, and the user is not told their preferences failed.

The rules, which core cannot enforce for you:

- __`html` is inserted raw__ (`<%- %>`) inside the user's form. Escape every value you put in it: use `<%= %>` in your EJS partial. Unescaped input there is stored XSS against everyone who opens their profile.
- __No `<input name="_csrf">`__: it overrides the host form's token and breaks the save.
- __No `<form>` of your own__: the fields submit with the host's preferences form, and a nested `<form>` is invalid HTML.
- __Put a hidden presence marker in the card__ (`<input type="hidden" name="<slug>._rendered" value="1">`) and have `saveProfileSection` return at once when it is missing. A checkbox that is not ticked sends nothing, so without the marker "unticked" and "the card was not on the form" look the same, and a save would quietly set every stored checkbox to false.
- __Re-check every config-gated field on the server__: a field the partial shows only when a setting allows it (`<% if (enabled) { %>`) is written only under the same check in `saveProfileSection`, or a crafted POST sets it anyway.
- __No inline script__: the partial is rendered outside the request, so it has no CSP nonce. See [Scripts in a view](#scripts-in-a-view-the-csp-nonce-contract).

The worked example is the journal addon: `profileSection` and `saveProfileSection` in `addons/journal/index.ts`, and the partial `addons/journal/views/_profile-section.ejs`.

- 1 `profileSection` reads the user's `journal.*` preferences and renders the partial with `ejs.renderFile`, returning `{ title: 'Journal', html }`.
- 2 The partial starts with `journal._rendered`, shows the voice-to-text and default-private fields only when their settings allow, and loads its script from `/addons/journal/js/journal-reminder.js`.
- 3 `saveProfileSection` returns unless `body['journal._rendered'] === '1'`, writes the gated fields only under the same checks, merges into the user's current preferences, and saves with `userManager.updateUser(ctx.username, { preferences }, ctx)`.

### Per-user add-ons and their switch

Some add-ons are something each user turns on for themselves, such as a personal health record ([#1963](https://github.com/jwilleke/ngdpbase/issues/1963)). The site enables the add-on; then each user decides whether they use it. Core keeps track of who turned it on, so page access and listings can use it.

- __Declare it__ in the `ngdpbase` block of `package.json`: `"perPerson": true`. Nothing else makes an add-on per-user.
- __The switch__ is the user's preference `<slug>.enabled`, for example `phr.enabled`. It is on only when it is the boolean `true`.
- __Set it only through `host.setEnabledForPerson(ctx, on)`__, normally from your `saveProfileSection(ctx, body)`: pass the `ctx` you were given and `true` or `false`. Do not write `<slug>.enabled` with `userManager.updateUser` yourself.
  - It sets the switch of the user `ctx` acts as, and keeps their other preferences.
  - The host is built for your add-on, so it sets only your own switch. There is no way to name another add-on's.
  - It is refused, with an error, when your manifest does not say `perPerson: true`, when the user is not signed in, or when they do not hold `profile-manage`, which is the permission `/profile` asks for.
- __Core reads it only through `AddonsManager.enabledAddonsFor(ctx)`__. That returns the slugs of the loaded per-user add-ons this user has turned on. It reads `<slug>.enabled` for those add-ons and no other preference, so no access check can come to depend on an arbitrary setting. An anonymous visitor, an inactive account and the system principal have none. `PolicyInformationPoint.subjectEnabledAddons(ctx)` supplies the same list to access decisions.
- An add-on the site has not enabled, or one that did not load, is not in the list, whatever the user's switch says. Turning it back on brings back what each user chose.
- __Pages for the users who turned it on__: give a page the audience `addon:<slug>`, for example `audience: [addon:phr]` in a page your add-on ships in `pages/` ([#1964](https://github.com/jwilleke/ngdpbase/issues/1964)). The page view, every page list and search then show it only to users whose switch is on, and everyone else can neither read nor edit it (the editor, a save, a rename and a delete are refused too); anonymous visitors never see it. Add other entries to widen it, such as `[addon:phr, editor]`. Administrators (`admin-system`) are the one exception: they can read and edit every audience page, whether or not they turned your add-on on. An `access.<action>` list has no such exception, and a page in a user's vault is decided by the vault, not its audience. A slug that is not a loaded per-user add-on matches nobody and is warned about at startup, naming the page. The rule is in [access-policies.md](../access-policies.md), under "A page's own audience".

```typescript
async saveProfileSection(ctx, body) {
  if (body['phr._rendered'] !== '1') return;   // the presence marker above
  await host.setEnabledForPerson(ctx, body['phr.enabled'] === 'on');
}
```

### Terms an add-on asks users to accept

A per-user add-on can have its own terms, such as a health record's terms of service and privacy policy ([#1603](https://github.com/jwilleke/ngdpbase/issues/1603)). Core asks each user to accept them before the add-on turns on for them, records the acceptance, and asks again when a document's version changes. The add-on writes no consent code of its own; [ConsentManager](../managers/ConsentManager.md) does it.

- __Ship each document as a page__ in your `pages/` folder ([Seed Wiki Pages](#seed-wiki-pages)), with the slug `<slug>-<name>` (for example `phr-terms-of-service`) and front matter `version: 1` and `effective: 'YYYY-MM-DD'`. Raise `version` when users must accept again; an ordinary edit leaves it alone.
- __Register them from `register()`__, through the engine:

  ```typescript
  async register(engine, config, host) {
    engine.getManager<ConsentManager>('ConsentManager')?.registerAddonDocuments('phr', {
      documents: ['phr-terms-of-service', 'phr-privacy-policy'],
      paths: ['/phr']   // optional: where a user uses the add-on in the browser
    });
  }
  ```

  The type is `ConsentManager` from `@jwilleke/ngdpbase-types`. Registering is refused (it throws) unless the add-on is per-user (`perPerson: true`) and every id starts `<slug>-`.
- __Turning it on asks first.__ While any document is not accepted at its current version, `host.setEnabledForPerson(ctx, true)` refuses with `ConsentRequiredError` (its `scope` is your slug, its `documents` what is still to accept) and the switch stays off. Let that error propagate from `saveProfileSection`: core shows the documents with an "I accept" box on your profile card, records the acceptance before your save runs, and tells the user when the switch was refused. Turning it off, or saving it on when it is already on, asks nothing.
- __A changed version__ is asked when the user next uses the add-on: under a registered `path`, a user who has it on is sent to accept before going on. Without `paths` they are asked only when they next turn it on. Either way, every page shows a user who has it on a banner naming the changed document, linking to its prompt, until they accept ([#2027](https://github.com/jwilleke/ngdpbase/issues/2027)). Requests with an agent or app token, and someone acting for the user under a proxy grant, are never held.
- Only the user accepts, signed in themselves. A missing page, or one with no `version:`, is not asked for and shows on the admin dashboard as needing attention.

---

## 4. Using the Engine

### Types and the test kit: `@jwilleke/ngdpbase-types`

An addon in its own repository compiles against `@jwilleke/ngdpbase-types` ([#1865](https://github.com/jwilleke/ngdpbase/issues/1865)), not its own copies of core's shapes and not `../../dist` type imports. It is published to npm with every ngdpbase release, at the same version, with provenance. It is a dev dependency only and never ships to a site.

```sh
npm install --save-dev --save-exact @jwilleke/ngdpbase-types@<ngdpbase.minVersion>
```

- __The main entry is types only.__ Import it with `import type`; a value import fails at run time on purpose. It names `AddonModule`, `AddonManifest`, `AddonListing`, `AddonHost`, `PersonSwitchSetter`, `KeyedSerial` (what `host.keyedSerial()` returns), `WikiEngine` (with `createRouter`, `serveStatic`, `getManager`), `ApiContext`, `ActorContext`, `PermissionSubject`, `Decision`, `PluginContext`, `PluginParams`, `PluginFormatters`, `SimplePlugin`, `AuditEvent`, `JobRunContext`, `DatabaseManager`, `AddonDatabaseOptions`, `AddonDatabaseDeclaration`, `DatabaseEncrypt`, `Migration`, `ExportManager` (with `PdfOptions`, `PdfMargin`, `PdfPageSize`, `PdfUnavailableError`), `EmailManager` (with `SendOptions`, `MailAttachment`, `AttachmentRefusedError`), `PolicyDecisionPoint`, `PageManager`, `PageAction`, and for contacts `IdentityManager` (and `PersonManager`, its deprecated alias for one release), `OrganizationManager`, `Person`, `PersonAffiliation`, `PersonInput`, `PersonUpdate`, `Organization`, `OrganizationInput`, `OrganizationUpdate`, `ContactPoint`, `ContactPointEntry`, `PostalAddress`, `ContactRefusedError` and `LinkOfferOutcome`, and for imports `ImportManager`, `AddonIceDeclaration`, `IceShim`, `IceReceiver`, `IceItem`, `IceKind`, `IceWarning`, `ShimDirection`, `ShimAccepts`, `ShimTools`, `ShimReadResult`, `ReceiveInfo`, `ReceiveOutcome`, `IceCitation`, `KeptOriginal`, `OriginalChoice`, `IceOriginalChoices`, `OriginalKeep`, `IceUpload`, `IceSource`, `IceRunRequest`, `IceRunReport`, `IceFileReport` and `IceFileStatus`. Each is core's own declaration. Anything else is internal; ask for an addition by pull request to [`packages/ngdpbase-types/index.ts`](../../packages/ngdpbase-types/index.ts). Additions only between majors, as for `host`.
- __`@jwilleke/ngdpbase-types/testing` is for tests.__ It holds core's own values, so an addon's CI needs no built ngdpbase:
  - `buildAddonHost(slug, defaults, setEnabledForPerson?, engine?)`: the real host, built from the addon's `config/default-config.json`. An undeclared audit event throws, as on a site, and a declared one reaches the sink. It binds the audit registry to those defaults, as a site's configuration does at boot. `host.setEnabledForPerson` calls the setter you pass, and without one it refuses, since a test has no accounts. `engine` names the system principal `host.systemContext(reason)` uses; without one it is core's fallback principal. To pass an engine and no setter, pass `undefined` for the setter.
  - `openAddonTestDatabase(owner, { migrations, ledgerTable }, declaredBy?)`: the handle `openAddonDatabase` returns, in memory, with the same owner and ledger-table rules. Migrations and triggers run as on a site. Each call opens a new database; close it in the test. Pass `declaredBy: { slug, defaults }` (the addon's `config/default-config.json`) and core's own reader checks the addon's database declaration: a missing, malformed or other-ledger declaration throws, as a site refuses it. `encrypt` is not applied, since the database is in memory, so a declaration with `encrypt: "required"` opens without a key.
  - `toCsv(headers, rows)`: `ExportManager.toCsv`, the one CSV writer.
  - `formatters`: the object a plugin gets as `context.formatters`.
- __Pin it to `minVersion`.__ When the addon raises `ngdpbase.minVersion`, raise this dev dependency to the same version.
- __`skipLibCheck: true`.__ Core's declarations name `better-sqlite3-multiple-ciphers`, whose `exports` map hides its types ([#1536](https://github.com/jwilleke/ngdpbase/issues/1536)). Without `skipLibCheck` the compiler reports that inside the package.

```typescript
import type { AddonModule, AddonHost, WikiEngine } from '@jwilleke/ngdpbase-types';
import { buildAddonHost, openAddonTestDatabase } from '@jwilleke/ngdpbase-types/testing';
```

In this repository the package is built by `npm run build:types-package` into `packages/ngdpbase-types/dist/`. That build also checks that the main entry emits no JavaScript, that the test kit loads in Node, and that an addon importing both entries typechecks against the built package alone. `.github/workflows/publish-types.yml` publishes it on each `v*` release tag.

### Importing core — types only

An addon takes core's values from [`host`](#the-host-parameter) and a manager's job from [`engine.getManager`](#access-a-manager). It never value-imports core ([#1813](https://github.com/jwilleke/ngdpbase/issues/1813)): `../../dist/…` resolves only for an addon sitting at `<ngdpbase>/addons/<slug>/`, so an addon installed into the data folder fails with `ERR_MODULE_NOT_FOUND`, and one run against another checkout loads a second copy of core. Anything an addon needs that neither offers is added to core by pull request: a manager's job as a method on that manager, a small ownerless tool on `host`.

```typescript
// Right — values from the host, types erased at compile
import type { AddonHost } from '../../dist/src/utils/addonHost.js';
import type { WikiEngine } from '../../dist/src/types/WikiEngine.js';
import type PageManager from '../../dist/src/managers/PageManager.js';

async register(engine: WikiEngine, config: Record<string, unknown>, host: AddonHost) {
  const { ApiContext, logger, guardedFetch } = host;
  const pageManager = engine.getManager<PageManager>('PageManager');
}

// Wrong — refused by lint:addons
import logger from '../../dist/src/utils/logger.js';
import { guardedFetch } from '../../../src/http/guardedFetch.js';
```

`import type` from `dist/` is fine: it is erased at compile and seeks no file, and `dist/` has the `.d.ts` files. An addon in its own repository uses [`@jwilleke/ngdpbase-types`](#types-and-the-test-kit-jwillekengdpbase-types) instead. Never point a type import at `src/` either: there is no reason to, since `dist/` has the same types.

A value import of `src/` is worse than a missing file. A bundled addon compiles __in place__ (its `tsconfig.json` has `rootDir` and `outDir` of `../..`), so importing `src/http/guardedFetch.js` pulls the host's `.ts` into __your__ compilation and emits `src/http/guardedFetch.js` next to it. On your machine the import then works. The container image copies `dist/` and `addons/` but not `src/`, so there Node throws `ERR_MODULE_NOT_FOUND` on the addon's first line and `AddonsManager` skips the addon with one log line. That is how v4.13.0 shipped with `elasticsearch` and `feeds` dead while every test was green ([#1192](https://github.com/jwilleke/ngdpbase/issues/1192)).

Two gates enforce this: `npm run lint:addons` fails on any addon value import (static, `import()` or `require()`) that resolves under `src/` or, in runtime code, under `dist/`, and on any compiled `.js` found under `src/`; `npm run check:addon-load` imports every `addons/*/index.js` in a child Node process after the build. An addon's tests may import core's values (`buildAddonHost`, a manager to stand in for core), since they run against a core checkout.

### Access a Manager

```javascript
const pageManager = engine.getManager('PageManager');
const pages = await pageManager.getAllPages();
```

A core job an addon needs is a method on the manager that owns it, for example:

- a page's URL, `/view/…` or `/vaults/…`: `PageManager.pageUrl(pageName, action?)`;
- the name of a page in a user's vault: `PageManager.privatePageName(owner, title, vault?)` (their default vault without `vault`);
- who holds a permission, such as the administrators a notice goes to: `PolicyDecisionPoint.usersHolding('admin-system')`. An empty list or null means nobody to tell: log only, since an empty `targetUsers` is every user.

Core manager names: `PageManager`, `UserManager`, `PolicyInformationPoint`, `PolicyDecisionPoint`, `AttachmentManager`,
`SearchManager`, `RenderingManager`, `PluginManager`, `ConfigurationManager`,
`AuditManager`, `CacheManager`, `BackgroundJobManager`, `NotificationManager`,
`IdentityManager`, `OrganizationManager` ([Contacts](#contacts-and-identity-records)),
`ExportManager`, `EmailManager` ([Make a PDF and email it](#make-a-pdf-and-email-it)),
`MediaManager` *(may be undefined when `ngdpbase.media.enabled` is false)*.

### Change a user: the function form

An add-on that keeps fields on a user's account (preferences, an `ownership` list) changes them through `UserManager.updateUser`, the one door for accounts. When the new value depends on what the account holds now (add to a list, end one entry, flip one preference), never read the user with `getUser` and write back what you worked out: two changes at once would both read the old record, and the later write would drop the earlier one. Pass a function instead ([#2025](https://github.com/jwilleke/ngdpbase/issues/2025)):

```typescript
import type { UserManager } from '@jwilleke/ngdpbase-types';

const users = engine.getManager<UserManager>('UserManager')!;
await users.updateUser(username, (current) => {
  const ownership = Array.isArray(current.ownership) ? current.ownership as Ownership[] : [];
  if (ownership.some((o) => o.place === place)) return undefined; // already there: change nothing
  return { ownership: [...ownership, { place, since }] };
}, ctx.getActor());
```

- Core runs the function inside that user's key, between the read and the write, so changes to one user happen one after another, each seeing the last. You cannot build this yourself: the account's key is UserManager's own, not one from `host.keyedSerial()`, and an add-on never writes its own per-key queue.
- `current` is a copy of the user's account without the password hash, your own fields included. Return only the fields to merge; return `undefined` to change nothing (nothing is written or recorded).
- It may be `async`, but must not call `updateUser` for the same user, directly or through another manager: it would wait for itself forever.
- The checks, the role change and the `user-edit` record are the same as for the object form `updateUser(username, { field: value }, ctx)`, which is still right when the change does not depend on the current account.
- The context is the caller's, as for every door: `ctx.getActor()` in a route, the `JobContext` in a job.

The worked examples are the journal's settings saves (`addons/journal/index.ts`, `addons/journal/routes/editor.ts`). The rules are in [UserManager](../managers/UserManager.md#one-change-at-a-time-per-account).

### Change your own records one at a time

An add-on that keeps records in its own store (a map in a file, rows it reads and writes back) changes each record through a `KeyedSerial` from `host.keyedSerial()` ([#2065](https://github.com/jwilleke/ngdpbase/issues/2065)). Two changes to one record at once (an admin's upsert and an owner's billing change) would otherwise both copy the old record, and the later save would drop the earlier change. It is core's own class, the one the [managers guide](managers-developer-guide.md#standing-rules) requires for every read-modify-write; never write another per-key queue, or chain every write on one promise (that holds up unrelated records too).

```typescript
import type { AddonHost, KeyedSerial } from '@jwilleke/ngdpbase-types';

class AccommodationManager {
  private readonly serial: KeyedSerial;
  constructor(host: AddonHost) {
    this.serial = host.keyedSerial(); // one per manager
  }

  setBilling(id: string, billing: Billing): Promise<void> {
    return this.serial.run(id, async () => {
      const all = await this.load(); // the read, inside run
      all[id] = { ...all[id], billing };
      await this.save(all); // the write, inside the same run
    });
  }
}
```

- __Keep the read and the write inside `run(recordId, …)`.__ A read made before `run` is already stale when the write happens.
- __Key by record id__, so changes to one record happen one after another, each seeing the last, while different records run side by side.
- __Not re-entrant.__ Never call `run` for the same key from inside `fn`, directly or through another of your methods: the inner call waits for the outer one, which never finishes.
- `run` resolves or rejects as `fn` does; a failed change fails its own caller only, and the next one on the key still runs.
- It orders changes within one server process only; two processes sharing one data folder can still race ([managers guide, Known gaps](managers-developer-guide.md#known-gaps)).
- In a test, `buildAddonHost` from [`@jwilleke/ngdpbase-types/testing`](#types-and-the-test-kit-jwillekengdpbase-types) is the real host, so `host.keyedSerial()` is the same class there.

### Create a user and invite them

An add-on that makes an account for someone (association approving an occupancy submission from a person with no account) makes it without a password and invites them, so they choose their own password or passkey ([#2049](https://github.com/jwilleke/ngdpbase/issues/2049)). Never make up a password and email it, and never ask your user to pass one on.

```typescript
import type { AuthManager, UserManager } from '@jwilleke/ngdpbase-types';

await ctx.requirePermission('user-create'); // the approver's own permission, through your policy
const actor = ctx.getActor();
const users = engine.getManager<UserManager>('UserManager')!;
const created = await users.createUser({ username, email, displayName, roles: ['reader'] }, actor); // no password
const auth = engine.getManager<AuthManager>('AuthManager')!;
const invited = await auth.inviteUser(actor, created.username);
if (invited.outcome !== 'sent') {
  // invited.reason says why in plain words (email is not working, say): show it to the approver.
}
```

- __Both doors take the caller's context.__ `inviteUser` asks `user-create` of it and throws `Permission denied` without it. Grant `user-create` to the role that approves in your add-on's own policy ([Permissions](#permissions)), never by naming `admin`.
- __The outcome says when nothing was sent__, not an exception: `email-unavailable` (email off or failing, or no site address), `send-failed`, or `not-invitable` (no email address, a password already, signed in already). The account stays; an administrator can resend from User Management or set a password by hand.
- __Core records it__ (`invitation-send`, then `invitation-use`, `-cancel` or `-expire`). Do not record it again; record your own action (the approval) with your own event.
- `auth.cancelInvitation(actor, username)` stops a link; sending again replaces the old one. A link lasts `ngdpbase.auth.invitation.ttl-days`. The invited user lands on core's setup page (a password or passkey, the recovery words, the site's terms); your add-on's own documents are asked for as usual ([Terms an add-on asks users to accept](#terms-an-add-on-asks-users-to-accept)).

### Ask for a review

Something that must wait for someone to say yes (a new owner from a public form, an owner adding or removing another owner) is filed with core's reviews, never kept in a queue of your own ([#2072](https://github.com/jwilleke/ngdpbase/issues/2072); [ReviewManager](../managers/ReviewManager.md)). Core tells the deciders, lists the request on `/reviews`, records each decision, and on approval calls your handler.

```typescript
import type { AddonHost, ReviewRequest, ActorContext } from '@jwilleke/ngdpbase-types';

async register(engine, config, host: AddonHost) {
  // Carries out an approved request, with the reviewer's context. Throw to leave it open;
  // your message is shown to reviewers as the reason, so write it for them.
  host.registerReviewHandler('accommodation.new-owner', async (request: ReviewRequest, ctx: ActorContext) => {
    const created = await users.createUser({ username, email, displayName }, ctx);
    const invited = await auth.inviteUser(ctx, created.username);
    if (invited.outcome !== 'sent') throw new Error(`The account was made but no invitation was sent: ${invited.reason}`);
    return { summary: `Account created for ${created.displayName} and invitation sent` };
  });
}

// In your route, as whoever the request is for (a public form's visitor included):
await host.reviews.fileRequest(ctx.getActor(), {
  kind: 'accommodation.new-owner',          // starts with your slug
  subject: 'Unit 12B',                      // a few words a reviewer recognises
  summary: 'Add Pat Lee as an owner of unit 12B',
  details: { Name: 'Pat Lee', Email: 'pat@example.com' }, // label and value pairs
  decidePermission: 'owner-approve',        // your own permission, granted in your policy; never a role
  handlerId: 'accommodation.new-owner'      // registered above
});
```

- __Who decides is a permission.__ Declare it in your `config/default-config.json` and grant it in your own policy ([Permissions](#permissions)); `fileRequest` refuses one the site does not declare or that is not grantable. Its holders are notified when the request is filed, see it on `/reviews`, and only they may decide it.
- __Only your own.__ `kind` and `handlerId` start with your slug (`<slug>.`), and `registerReviewHandler` takes only `<slug>.<name>`: anything else throws, so one add-on can never file for, or carry out, another's requests.
- __Complete or not.__ Return `{ summary }` when the work is done; the request is approved with that summary. Throw when it is not: the request stays open, with your message and the time shown to reviewers, who approve again once it is fixed. Never return early with half the work done: undo what you wrote, then throw ([managers guide](managers-developer-guide.md#standing-rules)).
- __The handler runs as the reviewer.__ `ctx` is the decider's context: your doors ask their permissions of it, and the records your handler's work leaves (the account, the invitation) name them. Core records the request itself (`review-filed`, `review-approved`, `review-rejected`, `review-failed`); record only your own action, if you have one.
- __Details may be personal.__ Core's notice to deciders names only your `kind` (notifications are stored in the clear), and nothing of the request goes into a URL or a log line. Core keeps requests only in the encrypted application database (`ngdpbase.database.provider` `sqlite` with `NGDPBASE_DATABASE_KEY`). Without one, `fileRequest` throws `ReviewsUnavailableError` (its `name`), saying why: tell your user it could not be filed and keep nothing; never fall back to a queue of your own.
- `host.reviews.listOpen(ctx)`, `get(ctx, id)` and `decide(ctx, id, 'approve' | 'reject', note?)` are the reviewer's calls, if you show requests on a screen of your own; core's `/reviews` already shows every request.
- A rejection calls none of your code yet, and a requester cannot see or withdraw their own request (operator: a future enhancement). Register your handler on every start, even when reviews are off, so a site that turns them on later works.

### Contacts and identity records

Donors, members and suppliers an add-on keeps are core's identity records and organizations, not the add-on's own table ([#1930](https://github.com/jwilleke/ngdpbase/issues/1930)). User, contact, identity record and profile mean what the [glossary](../GLOSSARY.md#identities) says. A donor is a user, a contact or an organization. Store the `@id` in your own records, and keep what your record needs to show (the name, say) there too: deleting a user deletes its identity record, even one your add-on made for a contact that later signed up, so the `@id` can come to name nothing (operator, 2026-10-20). Handle a `get` that returns `null`.

- __One door each.__ `IdentityManager` and `OrganizationManager`. Every call takes the caller's context first: in a route, `ctx.getActor()` from the `ApiContext`; in a job, its `JobContext`. Never a username.
- __Renamed in [#2038](https://github.com/jwilleke/ngdpbase/issues/2038); switch before the next release.__ `IdentityManager` was `PersonManager`, `identity-read` was `contact-read`, `identity-manage` was `contact-manage`. For one release the old names still work: `engine.getManager('PersonManager')` returns `IdentityManager` and warns once, the `PersonManager` type is a deprecated alias, and a policy naming `contact-read` or `contact-manage` grants the new permission and warns once. A `ContactRefusedError`'s `permission` is now the new name. Change `getManager('PersonManager')`, the type import and your policy's `actions` to the new names.
- __Two permissions.__ __`identity-read`__ to `search`, `get`, `list` and `people`; __`identity-manage`__ to `create`, `update` and `delete`. As shipped, `identity-read` is held by admins and demo admins, `identity-manage` by admins alone. Grant what your roles need in your add-on's own policy, as in [Permissions](#permissions): an add-on never names `admin`, and never appends to a shipped policy. Accounting's donor picker needs `identity-read` to search, and `identity-manage` to add a new donor.
- __Ask, then call.__ In the route, `await ctx.requirePermission('identity-read')` (or `'identity-manage'` for a change) first: it shapes the refusal and the step-up prompt. The door asks again. If it refuses anyway, it throws a `ContactRefusedError` (`err.name === 'ContactRefusedError'`) carrying `permission` and `decision`; hand them to `await ctx.enforceDeny(err.permission, err.decision)`. Never build the 401 or 403 yourself.
- __Every change is recorded__ by the door as the `identity-manage` audit event, with your caller as the actor. Do not record it again.
- __The signed-in user's own identity record__ ("your receipts", "your donations") needs no `identity-read`: a user may always read their own profile, including their own identity record, under `profile-manage`. A contact cannot sign in and never acts (operator, 2026-10-23, [#2018](https://github.com/jwilleke/ngdpbase/issues/2018)). Do not grant `identity-read` to ordinary members for this. Read it with `persons.getByUserIdentifier(ctx.getActor(), username)`, where `username` is the signed-in user's own: the door compares the context's username with the record's `identifier`, so anyone else's asks `identity-read`.
- __Every lookup takes a context__ ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)): `persons.getById(ctx, id)`, `getByIdentifier(ctx, identifier)` and `getByUserIdentifier(ctx, username)`; `organizations.getById(ctx, id)`; `RoleManager.hasRole(ctx, username, roleName)` and `resolveUserRoles(ctx, username)`. Who holds a role is read about a named account, so it follows the same rule: about the caller, `profile-manage`; about anyone else, `identity-read`. A job passes the `JobContext` it was given: on its schedule that is the system context, which is allowed; started from a request, it is the requester's, so an administrator's change reads under their `identity-read`. `npm run lint:context` fails a call with the context left out.
- __A contact's identity record__ gets the identifier `person:<uuid>`. No username can take that form, so a contact you create never collides with a user. When the contact signs up later with the same email, core offers to join them (an emailed "Is this you?" link); an administrator can also link them by hand on `/admin/contacts`. The identity record keeps its `@id`, so your stored references stay good.
- __Contact points.__ The home address is `address`; everything else goes in `contactPoint[]`, each entry typed by `contactType`. An entry is a schema.org `ContactPoint` (`{ '@type': 'ContactPoint', contactType, name?, telephone?, email? }`: home, business or other phones, an `agent`, an `emergency` contact with its `name`) or a `PostalAddress` (`{ '@type': 'PostalAddress', contactType: 'mailing', name?, streetAddress, addressLocality, postalCode, telephone? }`: a mailing or business address), which in schema.org is a ContactPoint subtype. The door stores and returns entries as given; replace the whole array to change one. The type is `ContactPointEntry` (the occupancy form, [ngdpbase-addons#33](https://github.com/jwilleke/ngdpbase-addons/issues/33)).
- __Affiliations__ are on the identity record: `affiliation: [{ organization: '<org @id>', role?: 'Treasurer' }]`. The `role` field is the affiliation's title, not a role: it grants nothing, and only a role (a set of permissions, held by users) does ([glossary](../GLOSSARY.md#identities)). `OrganizationManager.people(ctx, orgId)` reads them back; the organization stores no copy.

| Call | Asks | What it does |
| --- | --- | --- |
| `persons.search(ctx, query, { limit?, accountless? })` | `identity-read` | Identity records whose name, given or family name, or email contains `query` (ignoring case). `accountless: true` narrows to contacts |
| `persons.get(ctx, id)` / `persons.list(ctx)` | `identity-read` | One identity record by `@id`, or all. `get` is `getById`: the caller's own under `profile-manage` |
| `persons.getByUserIdentifier(ctx, username)` / `persons.getByIdentifier(ctx, identifier)` | `profile-manage` for the caller's own, else `identity-read` | The identity record of an account (made on first read for an account that has none), or by identifier |
| `persons.create(ctx, { name, email, givenName, familyName, affiliation, … })` | `identity-manage` | A contact's identity record; returns the record with its `@id` |
| `persons.update(ctx, id, patch)` | `identity-manage`; `profile-manage` for the caller's own | Change fields, affiliations included. `@id` and `identifier` never change |
| `persons.delete(ctx, id)` | `identity-manage` | Remove an identity record |
| `organizations.search(ctx, query, { limit? })` | `identity-read` | Organizations whose name, legal name, email or a contact point's email contains `query` |
| `organizations.get(ctx, id)` / `organizations.list(ctx)` | `identity-read` | One organization, or all |
| `organizations.create(ctx, { name, url?, … })` | `identity-manage` | `@id` is the `url`, else a new `urn:uuid:` |
| `organizations.update(ctx, id, patch)` / `organizations.delete(ctx, id)` | `identity-manage` | Change or remove |
| `organizations.people(ctx, orgId)` | `identity-read` | `[{ person, role? }]` for each identity record affiliated with it; `role` is the affiliation's title |

Linking an account by hand (`persons.linkAccount`) is an administrator's action: `identity-manage` and `user-edit`; an add-on does not call it.

A donor picker for the accounting add-on: search both, show which is which, and keep the chosen `@id`.

```typescript
import type { IdentityManager, OrganizationManager, ContactRefusedError } from '@jwilleke/ngdpbase-types';

router.get('/api/donors', async (req, res) => {
  const ctx = host.ApiContext.from(req, engine);
  try {
    await ctx.requirePermission('identity-read'); // granted to the treasurer by accounting's own policy
    const q = String(req.query.q ?? '');
    const actor = ctx.getActor();
    const persons = engine.getManager<IdentityManager>('IdentityManager')!;
    const organizations = engine.getManager<OrganizationManager>('OrganizationManager')!;
    const [people, orgs] = await Promise.all([
      persons.search(actor, q, { limit: 20 }),
      organizations.search(actor, q, { limit: 20 })
    ]);
    res.json([
      ...people.map((p) => ({ kind: 'person', id: p['@id'], name: p.name ?? p.email ?? p['@id'], email: p.email })),
      ...orgs.map((o) => ({ kind: 'organization', id: o['@id'], name: o.name }))
    ]);
  } catch (err) {
    try {
      if ((err as Error).name === 'ContactRefusedError') {
        const refused = err as ContactRefusedError;
        await ctx.enforceDeny(refused.permission, refused.decision); // always throws the ApiError
      }
      throw err;
    } catch (answer) {
      if (answer instanceof host.ApiError) return host.sendApiError(res, answer);
      res.status(500).json({ error: 'Could not search donors' });
    }
  }
});

// A new donor who is not in the list yet (the route asks identity-manage first):
// a contact, affiliated with their organization.
const donor = await persons.create(ctx.getActor(), {
  name: 'Dana Donor',
  email: 'dana@example.org',
  affiliation: [{ organization: orgId, role: 'Treasurer' }]
});
// Store donor['@id'] (and orgId, when the gift is from the organization) on the gift,
// with the donor's name as given, so the gift still reads right if the identity record is deleted.
```

### Make a PDF and email it

Core turns an HTML document into a PDF, and sends it as an email attachment ([#1974](https://github.com/jwilleke/ngdpbase/issues/1974)). An add-on never bundles its own PDF engine. Both are managers: `engine.getManager('ExportManager')` and `engine.getManager('EmailManager')`, typed by `@jwilleke/ngdpbase-types`.

```typescript
import type { ActorContext, EmailManager, ExportManager } from '@jwilleke/ngdpbase-types';

async function emailInvoice(engine: WikiEngine, ctx: ActorContext, to: string, html: string, number: string): Promise<void> {
  const exportManager = engine.getManager<ExportManager>('ExportManager')!;
  const email = engine.getManager<EmailManager>('EmailManager')!;
  try {
    const pdf = await exportManager.htmlToPdf(ctx, html, { format: 'Letter', margin: { top: '15mm', bottom: '15mm' } });
    // Store sha256(pdf) with the issued invoice: the same HTML gives the same bytes.
    await email.sendTo(ctx, to, `Invoice ${number}`, 'Your invoice is attached.', undefined, {
      attachments: [{ filename: `invoice-${number}.pdf`, contentType: 'application/pdf', content: pdf }]
    });
  } catch (err) {
    if ((err as { code?: string }).code !== 'PDF_UNAVAILABLE') throw err;
    // No PDF engine on this site: send the HTML instead.
    await email.sendTo(ctx, to, `Invoice ${number}`, 'Your invoice is below.', html);
  }
}
```

- __Pass the context you were given.__ Both methods take it first and refuse without one.
- __The site chooses the engine, not you.__ `ngdpbase.export.pdf.provider` is `none` by default, `local-chrome` on a direct install with Chromium, or `chrome-service` (a Gotenberg service) on a container site. Your code is the same for all three.
- __Inline everything.__ Write the HTML to load nothing: put images and fonts in as `data:` URIs and styles in a `<style>` element, and use no scripts. With `local-chrome` every other request is refused and JavaScript is off; a `chrome-service` set up as the setup guide says does the same. A remote image is not an error; it is simply missing from the PDF.
- __Print CSS applies.__ `@page { size; margin }` wins over the options; `@media print` rules are used.
- __Deterministic bytes.__ The same HTML on the same core version and the same provider and engine version gives the same SHA-256, so an issued document's fingerprint holds. Another engine (another provider, Chromium build or Gotenberg version) may give different bytes for the same HTML; fingerprint what you issued, not a re-render. Embed your fonts as `data:` URIs to depend on no installed font.
- __When there is no engine__ (the provider is `none`, or the one chosen cannot be used), `htmlToPdf` throws an error with `code: 'PDF_UNAVAILABLE'`. You cannot import core's error class (the types package is types only), so test the `code`. Fall back to HTML, as above. The admin dashboard then shows ExportManager as needing attention. Any other error is a render that failed (a timeout, a service error): handle it as you would a failed send.
- __Attachments__ total at most `ngdpbase.mail.attachments.max-bytes` (10 MiB). Over it, or with a filename holding a path or a line break, `sendTo` rejects with `code: 'ATTACHMENT_REFUSED'` before anything is sent. `sendInBackground(ctx, …, options)` takes the same attachments and never rejects.
- __Audit is yours.__ Neither call records an audit event: the render reads and changes nothing, and core does not audit email. Record that you issued the document with your own event ([audit-developer-guide.md](audit-developer-guide.md#addons)).
- The engine, the keys and the unavailable behaviour are in [ExportManager](../managers/ExportManager.md#html-to-pdf).

### Mount Express Routes

```typescript
import path from 'path';
import apiRoutes from './routes/api.js';

async register(engine, config) {
  // Serve static assets (add-on public/ folder) with core's express.static
  engine.app?.use('/addons/my-addon', engine.serveStatic(path.join(__dirname, 'public')));

  // API routes — the router inside comes from engine.createRouter()
  engine.app?.use('/api/my-addon', apiRoutes(engine, config));
}
```

Express is core's. An add-on gets a Router from `engine.createRouter(options?)` and static-file middleware from `engine.serveStatic(dir, options?)`, and never value-imports `express` ([Writing Routes](#7-writing-routes)).

> __Note:__ When your add-on lives in an external repo, the core's automatic static
> serving at `/addons/...` only covers the ngdpbase `addons/` directory. You must
> mount your own static middleware in `register()` as shown above.

### Register Plugins

```javascript
async register(engine, config) {
  const pluginManager = engine.getManager('PluginManager');
  const MyPlugin = require('./plugins/MyPlugin');
  await pluginManager.registerPlugin('MyPlugin', MyPlugin);
}
```

Registered plugins are then available in wiki page markup as `[{MyPlugin param='value'}]`.

### Register Stylesheets

```javascript
async register(engine, config) {
  const addonsManager = engine.getManager('AddonsManager');
  addonsManager.registerStylesheet('/addons/my-addon/css/style.css', 'my-addon');
}
```

The URL is injected into every page's `<head>` via `res.locals.addonStylesheets`.
Make sure the path is served (see static middleware above or `addons/` core serving).

### Register an Admin Dashboard Card

Any addon with an admin UI should register a card on the `/admin` dashboard. The card shows the addon's live `status()` message and a link to the admin page. No template editing needed — registration is sufficient.

```javascript
async register(engine, config) {
  const addonsManager = engine.getManager('AddonsManager');
  if (addonsManager) {
    addonsManager.registerDashboardCard({
      addonName: 'my-addon',   // must match your addon name
      title: 'My Addon',
      icon: 'fas fa-cog',      // any Font Awesome class
      adminUrl: '/addons/my-addon',
    });
  }
}
```

Cards render inside the Add-ons section on `/admin`. Page Management is the first row; Add-ons, with its cards, is below that. The card body displays `status().message` automatically.

### Seed Wiki Pages

Place `.md` files in your add-on's `pages/` directory. `AddonsManager` will copy them into the instance's pages directory automatically on startup.

> __Full reference:__ [`addon-page-handling.md`](../platform/addon-page-handling.md) covers where addon pages live (name-based source vs UUID-based runtime), what does and doesn't sync to an existing instance (additions ✅, updates/removals ❌), the orphan-file class, and the reseed gap ([#920](https://github.com/jwilleke/ngdpbase/issues/920)).

#### When does seeding run?

Seeding runs once per addon per server startup, inside `AddonsManager.loadAddon()`, immediately after the addon's `register()` function completes. It is __not__ triggered by install events or file-system watchers — a server restart is required to seed new pages.

#### UUID requirements

Each seed page __must__ have a valid UUID v4 in its frontmatter `uuid` field. The destination filename in the instance pages directory is always `{uuid}.md` — the source filename is ignored.

```markdown
---
title: My Addon Home
uuid: 4a266851-f3cd-4ba6-bbbe-5a408f3adf72
slug: my-addon-home
system-category: addon
addon: my-addon
author: my-addon
---

Welcome to my add-on.
```

Generate a UUID: `node -e "console.log(require('crypto').randomUUID())"`

A `title` and a `slug` are required too. If `uuid` is missing or is not a UUID (the seeder accepts the 8-4-4-4-12 hex form; the scaffolder writes a v4), or if `title` or `slug` is missing, the file is __skipped with a warning__ (an error log when the add-on is `domain`) and an admin notification, and not seeded. Pages that fail those checks are never written to disk.

#### Idempotency — existing pages are never overwritten

If `{uuid}.md` already exists in the instance pages directory, the seed file is silently skipped. This means:

- User edits to seeded pages survive restarts.
- Re-running the server never clobbers existing content.
- Deleting `{uuid}.md` and restarting does __not__ seed it again: the site's seeded-pages record treats a removed page as removed on purpose. Bring it back from Required Pages Sync (or restore it from the trash).

#### Auto-set frontmatter fields

`AddonsManager` stamps these frontmatter fields on every newly seeded page:

| Field | Value | Notes |
|-------|-------|-------|
| `addon` | the addon's name | Always set to the loading addon's name |
| `system-category` | source value, or `addon` | The source value when it has one |
| `addon-source-category` | the category applied | So a later source change can be told from an operator edit |
| `access` | the category default | Only when the source does not set `access` |
| `addon-source-hash` | hash of the body | What the reseed comparison uses |

#### A uuid the site already holds

If a live page already has that uuid, the seed leaves it in place. It does not compare the existing page's `addon` field, and it does not log a cross-addon conflict. Content is refreshed only under the reseed rules below.

A source page whose title or slug belongs to a __different__ uuid is not seeded. That is logged at info:

```
[AddonsManager] Shipped pages could not be seeded: <title> (<addon>/pages/<file>): <reason>
```

Use a freshly generated UUID for every seed page. Two files in the same `pages/` directory must not share one.

#### Updating seeded pages / admin reseed

By default seeding is __first-load only__: once a page exists in the instance it is skipped on every restart (see [Idempotency](#idempotency--existing-pages-are-never-overwritten) above), so operator edits are never clobbered.

__Pushing updated addon page content is supported__ two ways ([#920](https://github.com/jwilleke/ngdpbase/issues/920)):

- __Content-aware boot reseed__ — set `ngdpbase.addons.page-reseed: true` (default `false`). On each boot, a page is refreshed from source only when the source changed __and__ the instance copy is unmodified since seed (edited pages are skipped). Reseed keeps the UUID and records a revertable version. Safe to leave on ("keep addon pages in sync") or flip on → restart → off for a one-time sync.
- __On-demand via the admin UI__ — __Required Pages Sync__ at `/admin/required-pages` ([#513](https://github.com/jwilleke/ngdpbase/issues/513)) lists addon pages with status, previews would-update / would-skip, and applies on demand with no restart.

(The original first-boot seeding lives in the now-closed #442. There is no dedicated `POST /admin/addons/:addonName/reseed` REST route — the Required Pages Sync surface is the entry point.)

#### Turning off Comments and Footnotes

Core shows a Comments and a Footnotes tab under every page (`Template:PageTabs`). Whatever a reader types there is shared with everyone who can see the page. A page whose plugin output is private to each viewer, such as a health record, turns them off, and keeps its own notes in the add-on's data through its manager.

On one page, in the seed page's frontmatter:

```markdown
---
title: My Health Records
uuid: 0c0e7a52-6f7e-4f63-9a59-8e5a3f0f2b61
slug: my-health-records
system-category: addon
comments: false
footnotes: false
---
```

On every page of the add-on's own system-category, in its `config/default-config.json`:

```json
"ngdpbase.system-category": {
  "phr": { "label": "phr", "owner": "phr", "comments": false, "footnotes": false }
}
```

- The page's flag wins over the system-category, both ways. Unset is on.
- Only `true` and `false` count. Any other value in an add-on's entry refuses the entry, and the add-on is not loaded.
- On your system-category, `comments` and `footnotes` are your declaration, like `encrypt`: a site's `app-custom-config.json` cannot turn them back on, nor off where you leave them unset (it gets a startup warning instead).
- When off, the tab is not rendered and the server refuses posting, editing or deleting with 403. Comments already on the page are kept and hidden; footnotes are kept and stay readable where the page's own content calls `[{FootnotesPlugin}]`, without controls.
- Seeding writes the frontmatter as shipped, so the flag is in place on first load. A page already seeded does not get a flag added later: reseed and Required Pages Sync compare the body only (see Known gaps).

The rule and what each surface does: [system-category.md](../system-category.md#comments-footnotes).

#### Overriding the Left Menu and Footer

The left menu and the footer are named by `ngdpbase.chrome.left-menu-page` and `ngdpbase.chrome.footer-page` (shipped empty). When a key is set, the page it names is used and nothing else is tried; a missing page is logged at error and that slot is empty on every page (`PageManager.readChromePage`). A domain add-on can set them through [`domainDefaults`](#domaindefaults).

While a key is empty, two special slugs are the legacy fallback, and let an add-on replace the instance-wide navigation and footer without editing system pages:

| File | Slug | Replaces |
|------|------|----------|
| `pages/left-menu-content.md` | `left-menu-content` | `LeftMenu` required page |
| `pages/footer-content.md` | `footer-content` | `Footer` required page |

With the key empty, the server checks for `left-menu-content` first; if found, it is used instead of `LeftMenu`, and an info line says so and names the key to set. Same for `footer-content` vs `Footer`. This means an add-on can ship its own navigation without touching the core system pages.

Example `left-menu-content.md`:

```markdown
---
title: Left Menu Content
uuid: 0c0cb715-a46c-4a91-9189-9e05b7f9e95f
slug: left-menu-content
system-category: addon
addon: my-addon
author: my-addon
---
- <a href="/"><i class="fas fa-home"></i> Home</a>
- <a href="/search"><i class="fas fa-search"></i> Search</a>
- [My Feature One]
- [My Feature Two]
- [Recent Changes]
```

Example `footer-content.md`:

```markdown
---
title: Footer Content
uuid: 2b04424b-5541-41e5-b85c-dee161f66945
slug: footer-content
system-category: addon
addon: my-addon
author: my-addon
---
<small>**[{$applicationname}]** v[{$version}] | Powered by my-addon</small>
```

---

### Ship form definitions

An add-on that ships forms for the bundled forms add-on registers each one in its `register()`, at every start, with the definition as this release ships it ([#1973](https://github.com/jwilleke/ngdpbase/issues/1973)):

```ts
async register(engine, config, host) {
  const forms = engine.getManager<FormsDataManager>('FormsDataManager');
  await forms?.registerShippedForm('my-addon', definition, host.systemContext('my-addon: register its forms'));
}
```

The forms add-on stores it as an ordinary definition in `<dataPath>/definitions/<id>.json` (`ngdpbase.addons.forms.dataPath`, default `${FAST_STORAGE}/forms`), with `providedBy: { addon, version }`. The version is your add-on's `package.json` `version`, read from core's add-on registry (`AddonsManager.getAddonVersion`). There is no per-form version: your release is the form's version.

Your form wins. Each start compares your installed version with the one recorded on the stored copy (as `x.y.z`, the way `minVersion` is compared):

- No copy on the site: it is written. That is the first install.
- Your version is newer: the copy is replaced with what you ship now. Nothing checks whether it was edited, because a form you provide cannot be edited on the site.
- The same version: nothing is written. A release that did not change its forms rewrites nothing.
- Your version is older (an older release reinstalled): the copy is kept. The forms add-on logs an error and tells administrators (whoever holds `admin-system`) which form, the version that wrote it and the installed version, at each start until a release at least as new is installed.
- A copy with no `providedBy` (saved before #1973, or by the builder under the same id) is replaced at the next start.
- A form another add-on provides is not replaced; an error is logged.

`registerShippedForm` returns what it did: `saved`, `replaced`, `unchanged` or `refused`. It throws on a definition that does not parse, on an add-on core does not know, and on a version that is not `x.y.z`, so each shows at the first start. Values you leave out take the schema's defaults, and a key core adds later (such as `notify`) is filled with its default when a copy is loaded, so it never blocks your next release from replacing the copy.

A form you provide is read-only on the site:

- The forms admin (`/addons/forms`) shows "Provided by `<addon>` `<version>`; it updates this form", linked to Admin → Add-ons, with no Edit or Delete. A form you no longer ship is the exception: see below.
- The form builder refuses it on the server, not only by hiding the buttons: opening it, saving it and deleting it answer 403, and a new form cannot take its id (409). `FormsDataManager.saveDefinition` and `deleteDefinition`, the builder's door, refuse it too (`ProvidedFormError`), and a definition cannot set `providedBy` through them. An administrator who wants something different builds their own form under another id.

A form you stop shipping can be deleted by an administrator, and nothing else. It is orphaned when your add-on did not load this boot (removed, turned off, or failed to load), or loaded but did not call `registerShippedForm` for that id. `FormsDataManager` records the ids each add-on registers during the boot, and decides only once core's load pass is over (`AddonsManager.addonsLoaded()`, true after every enabled add-on's `register()` has run); before that, nothing is orphaned. `FormsDataManager.orphanedFrom(formId)` returns the add-on's slug for an orphaned form, otherwise undefined.

- The forms admin shows it as "No longer provided by `<addon>`", with Delete and still no Edit.
- `deleteDefinition` and the builder's delete route allow it; a form your add-on still provides is refused as above (403). As for any form, a delete with submissions is refused (409), and a delete never removes submissions: an administrator clears them first (below).
- If your add-on ships the form again, its next start writes it again, as a first install.

An administrator can clear a form's stored submissions, on any form: built on the site, one your add-on still provides, or one it no longer provides ([#1973](https://github.com/jwilleke/ngdpbase/issues/1973)). Clearing removes data and leaves the definition alone, so it doesn't make a still-provided form deletable.

- The forms admin card of a form with submissions has __Clear submissions__: the count, a link to the CSV export, and a box where the admin types the form id. The button stays disabled until the id matches, and the route checks it again.
- `POST /addons/forms/:formId/submissions/clear` (CSRF, `admin-system`) calls `FormsDataManager.clearSubmissions(formId, ctx)`. It removes the `<dataPath>/submissions/<formId>/*.json` files it counted and returns that count. A submission that arrives while it runs is kept.
- The manager records `submission-clear` first: who, the form, `count`, and `providedBy` when the form has one. The forms add-on declares it in its own `config/default-config.json` (`"grantable": false`, `on-failure: refuse`) and writes it through `host.recordAuditEvent`, so a record that can't be written leaves every submission in place. Without the host (`register`'s third argument), the manager clears nothing.
- `GET /addons/forms/:formId/export.csv` (`admin-system`) downloads every stored submission, oldest first, through `ExportManager.toCsv`. Columns: `id`, `submittedAt`, `submittedBy`, `status`, `formVersion`, the `onBehalfOf` fields, `notes`, then one column per field, plus any key a submission carries that the form no longer has. Lists and `lines` rows are written as JSON. The submissions page links to it too.
- A form with `"store": false` has no stored submissions, so it never needs clearing.

Each submission records `formVersion`: the `providedBy` version of the form it was submitted on. Your handler receives it on the submission, and the stored submission keeps it. A site-built form's submissions have none.

A form whose submissions must wait for a decision ships with `"review": { "decidePermission": "<permission>" }` ([#2072](https://github.com/jwilleke/ngdpbase/issues/2072)): each submission is kept and filed with core's reviews ([Ask for a review](#ask-for-a-review)) for the holders of that permission, and your handler runs only when one of them approves it, with `context.decider` the reviewer's context (`null` on an ordinary submission, and `req` is then `null`). The form then sends no "New form submission" notification: core tells the deciders. Such a form cannot say `"store": false`, and a submission is refused (503, nothing kept) when the site keeps no reviews. The request is in core's encrypted store, but the submission itself is kept as plain JSON in the forms add-on's folder, as every stored submission is ([storage guide, Known gaps](storage-developer-guide.md#known-gaps)). The form builder has no box for it yet: set it in the definition.

A form whose submissions are private (health notes, say) ships with `"store": false` and `"notify": false` ([#1954](https://github.com/jwilleke/ngdpbase/issues/1954)). Both default to `true`, and both may be left out of the definition you register. On a replace, the values you ship are the values stored.

- `"store": false`: no submission file is kept; your handler's record is the record.
- `"notify": false`: after your handler accepts the submission, the forms add-on sends nothing about it. There is no "New form submission" notification, and no email of the details, even when the form has an `email` field or a For Another Occupant email.
- With `notify` on, the "New form submission" notification goes only to the accounts that hold the form's `notifyRole` (default `admin`; [#1957](https://github.com/jwilleke/ngdpbase/issues/1957)). The forms add-on asks core who holds it (`UserManager.searchUsers('', { role, limit: 0 }, ctx)`, which reads `RoleManager` membership, active accounts only) under the system context, `host.systemContext(reason)`: finding the recipients is the add-on's own work, not the submitter searching for people, so an anonymous submitter still notifies ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)). `searchUsers` decides `search-user` with the context it is given; pass the system context only for such lookups, never for a user's search. When nobody holds the role it sends nothing and logs at debug: NotificationManager reads an empty `targetUsers` as every user, so an empty list is never passed on. Name a role your site declares; a role nobody holds is a silent form.
- With both off, the forms add-on leaves nothing of the submission outside your handler. The one record it can leave is the `form-submit` audit event, which the forms add-on declares switched off (`audit.enabled: false` in `addons/forms/config/default-config.json`). It is written only on a site that turns it on, and then it records the permission decision (who, when, allowed or refused), not what was submitted. `notify` does not change it.

The form builder, for forms built on the site, saves only what the admin changed ([#1921](https://github.com/jwilleke/ngdpbase/issues/1921)):

- `store` is its __Store submissions__ box, ticked unless the form says `"store": false`. The page sends `storeShown` beside the box (an unticked box sends nothing), and a post without it keeps the form's value.
- `notify` is its __Send notices__ box, the same way: ticked unless the form says `"notify": false`, with `notifyShown` beside it.
- A field's `optionsSource` and `totalField`, and a `lines` field's own `fields`, `minRows`, `maxRows` and `amountField`, have no input; the page carries them through the save unchanged.

Migrating from #1880/#1918: pass `host.systemContext(reason)` as the third argument, in place of the old `{ required: true }` option, which is gone (an update always applies, so nothing is "required"). An add-on not yet updated still registers: core logs a warning and uses a boot context. Do not call `saveDefinition` for your form; it refuses a form you provide. Existing sites need nothing: their copies have no `providedBy`, so your next start replaces them.

### Choices from your manager, and checklists

A `dropdown` or `checklist` field with `"optionsSource": "fetch:YourManager.toFormOptions(k=v)"` gets its choices from your manager. Only `toFormOptions` is reachable, and it is called with the viewer's context (`(args, userContext)`), so offer that viewer only what they may see. It is called again when the form is submitted, and a value it did not offer is refused before your handler runs.

- Answer an array of strings, or of `{ value, label, amount? }` (`FormOption` in `src/utils/pluginFormatters.ts`). `amount` is whole minor units (cents), an integer; anything else is dropped.
- A `checklist` field ([#1904](https://github.com/jwilleke/ngdpbase/issues/1904)) reaches your handler as an array of the ticked values (`submission.data.receiptIds: ["r-101", "r-102"]`), never a comma string; nothing ticked is `[]`. `required` means at least one.
- When any choice has an `amount`, the checklist shows "Ticked: N · $sum" with core's `formatMoney`. With `totalField: "<amount field>"` it shows whether the sum matches that field, parsed as the `amount` field is. That is a hint to the user: the forms add-on does not refuse a mismatch, so a handler that needs them equal checks it and answers `{ ok: false, fields: { total: '...' } }`.
- The field reference for site authors is the shipped [Form Definition Reference](../../required-pages/bb03859d-eb3f-449e-b78b-7fef30082098.md).

### Lines: repeating rows of fields

A `lines` field ([#1913](https://github.com/jwilleke/ngdpbase/issues/1913)) repeats its `fields` once per row: the lines of a receipt or refund. The definition, and what each key does, is in the [Form Definition Reference](../../required-pages/bb03859d-eb3f-449e-b78b-7fef30082098.md); what your handler gets:

- `submission.data.<name>` is an array of row objects, `[{ amount: 5000, fundId: "general", category: "4100", memo: "" }]`. An `amount` sub-field is whole minor units, as a top-level `amount` is. Fully empty rows at the end are dropped, in the browser and again on the server.
- Each row is validated by the same rules as top-level fields (`buildSubmissionValidator` builds the row from the same per-field rule). A sub-field's `optionsSource` is asked once per render and once per submit, as the viewer, whatever the row count; a value it did not offer is refused before your handler runs. `required`, `minRows` and `maxRows` are enforced on both sides.
- Errors are keyed `<name>[<0-based row>].<field>`, for example `lines[1].category`. Answer `{ ok: false, fields: { 'lines[1].category': '...' } }` and the message shows next to that row's field; a key for the whole field (`lines`) shows under the field.
- With `amountField` the form shows "Lines: N · $sum"; with `totalField`, whether it matches that field. It is the checklist's total (one drawing for both), and a hint only: a handler that needs the lines to add up to the total checks it.
- A row holds one value per sub-field: `lines`, `section`, `hidden` and `checklist` sub-fields are refused when the definition is parsed, so `registerShippedForm` throws on them. A changed sub-field reaches sites with your next release, as any change to the form does.

### Ship a Theme

Since v3.17.0 (issue #443): if your add-on ships a `theme/` subdirectory, ngdpbase auto-deploys it to the
instance's `themes/<addon-name>/` on __first boot__ — the same mental model as
`pages/`. This is how a domain add-on carries its site identity (e.g. the
`fairways` add-on ships the Fairways theme).

```
addons/my-addon/theme/
├── theme.json          ← REQUIRED — presence sentinel (no theme.json = not deployed)
├── css/
│   └── variables.css
└── assets/
    └── favicon.png
```

Behaviour:

- __First-boot copy.__ On add-on registration, if `theme/theme.json` exists
  and `themes/<addon-name>/` does __not__, the tree is copied. Logged as
  `[AddonsManager] Deployed theme from <addon>/theme/ → themes/<addon>/`.
- __Never overwrites.__ If `themes/<addon-name>/` already exists, the copy is
  skipped — operator customisations to the deployed theme are preserved. The
  add-on source is *not* re-synced automatically (it's a snapshot).
- __Activate it.__ Set `ngdpbase.theme.active` to the addon slug through
  `domainDefaults`, so it takes effect without operator config. The
  `package.json` shape is [Configuration](#configuration).

- __Manual re-deploy.__ `/admin/addons` shows a __Deploy Theme__ button
  (__Redeploy Theme__ once deployed) for any add-on that ships a theme. This
  overwrites `themes/<addon-name>/` with the add-on's current `theme/` — used
  to pull in upstream theme updates. No server restart needed (theme CSS is
  served as static files; a page reload suffices).

The instance themes root is `ngdpbase.theme.directory` (default `themes`).
`ThemeManager` is unchanged — it still reads `themes/<name>/`; deployment just
puts the files there.

> Drift note: because first-boot copy is a snapshot, theme changes you ship in
> a later add-on release are __not__ picked up until an operator clicks
> Redeploy. Direct-load (no-copy) resolution for domain add-ons is __not
> implemented and is not planned__ — [#444](https://github.com/jwilleke/ngdpbase/issues/444)
> was closed 2026-05-25 as superseded-by-practice, the auto-copy mechanism
> having run about a year without a complaint. Refile it if a concrete driver
> appears (a domain addon with theme-size or write-frequency concerns).

---

### Register an Optional Capability

Capability flags gate admin panel sections so disabled features are invisible, not broken.

```javascript
async register(engine, config) {
  engine.setCapability('my-addon', true);
}
```

Guard admin panel EJS sections:

```ejs
<% if (capabilities && capabilities['my-addon']) { %>
  <!-- my-addon admin section -->
<% } %>
```

---

### Import shims and receivers (ICE, [#1979](https://github.com/jwilleke/ngdpbase/issues/1979))

Core's import engine (ImportManager) does the file handling: unzipping, the noise filter, SHA-256 fingerprints, skipping unchanged files, per-file status, keeping the original, running as a background job. An addon supplies only what knows its format (a __shim__), and, when the results are its own records, the door they go through (a __receiver__). The design is [ice-planing.md](../planning/ice-planing.md); the engine's reference is [ImportManager.md](../managers/ImportManager.md).

- __Declare them in the manifest.__ `"ngdpbase": { "shims": ["ccda", "fhir"], "receivers": ["health-records"] }`. The host refuses a name not listed.
- __Register them in `register()`__ with `host.registerShim(shim)` and `host.registerReceiver(receiver)`. Each is named `<slug>.<name>` (`phr.ccda`, `phr.health-records`); the call returns that id.
- __Site configuration switches a shim__: `ngdpbase.import.shims.<id>.enabled` (default `true`), and hands it `ngdpbase.import.shims.<id>.options`. Configuration never holds code.

A shim (`IceShim`):

| Field | |
| --- | --- |
| `name` | Lower-case letters, numbers and dashes |
| `direction` | `in` (with `read`), `out` (with `write`) or `both`. Only `in` runs today |
| `accepts` | `extensions` (`['.xml']`), `mediaTypes`, `kinds` it takes from another shim, and `canRead(input)` — "can I read this?" on the content. When `canRead` is present it must say yes even when the extension matches |
| `produces` | The kind of its items: `ncm` for pages, `file`, or your own `<slug>.<kind>` |
| `receivers` | Receiver ids it may hand to. Empty when its output only feeds another shim |
| `duplicates` | `file` (default): an unchanged file is skipped by its fingerprint. `item`: each item carries `itemKey` (its own id or time), and items already seen are skipped |
| `read(input, tools)` | Returns `{ items, partial? }`. `partial` is a note when only part was read; the file's status is then `partial`. `input.text` and `input.bytes` hold the file. Fetch anything more with `tools.fetch(url)`, the engine's guarded fetch, never your own |

A receiver (`IceReceiver`) is your manager's own door:

- `accepts`: the kinds it takes.
- `mayUse(ctx)`: your existing rule. The import screen shows a user only the receivers they may use.
- `receive(item, ctx, info)`: check your rule again with `ctx` and store through your manager. Return `{ status: 'stored', ref }`, `{ status: 'duplicate' }` or `{ status: 'refused', message }`. A `message` on a stored item ("12 new, 0 updated, 0 unchanged") is shown on the file's status at /import; keep it to a few words. There is no import permission: the run carries the user's context, or a job's in a background run, and your door decides. Pass `ctx` straight to the PDP, `await pdp.decide(ctx, { action: 'phr-write' })`, whichever it is: the PDP turns a job's context into a subject itself ([#2022](https://github.com/jwilleke/ngdpbase/issues/2022)).
- `keepOriginal(item, ctx, keep)` (optional): keep the original file yourself when the user chose to keep it. Without it, the original goes to the site's files through the upload door. `item.mediaType` is the engine's: the request's type for a file uploaded on its own, and for a file unpacked from a zip the type of its extension, checked against its bytes (`MEDIA_TYPE_BY_EXTENSION` in `src/ice/fileHandling.ts`, [#2061](https://github.com/jwilleke/ngdpbase/issues/2061)). Pass it on as the upload's `mimeType`; never label files yourself.
- `keepsEncrypted: true` (optional): your `keepOriginal` writes into an encrypted store, as phr keeps originals in the user's vault ([#2034](https://github.com/jwilleke/ngdpbase/issues/2034)). The run is a background job whose context never holds the user's key, so the engine then calls `keepOriginal` during the upload instead, with the REQUEST's context, while the key is live: write the bytes through the upload door as usual (`uploadAttachment(bytes, meta, ctx, { private: true, store })`), which seals them and the store's index. The run hands each item the kept reference in `info.original` and never calls `keepOriginal` for it again. If you refuse (return `refused` with a message the user can act on, such as "Unlock your vault and try again") or throw, the upload is refused with that message and nothing is imported. Pass the third argument, `keep` (an `OriginalKeep`), to the upload door unchanged: `uploadAttachment(bytes, meta, ctx, { private: true, store, keep })`.
- `originals` (optional): the original-file choices you offer (D11), `{ allowed: ['keep', 'none'], default: 'keep' }`. The import screen offers only these, with `default` chosen, and the engine refuses a run asking for any other. Without it, all three (`none`, `cite`, `keep`) are offered and the site's `ngdpbase.import.engine.default-original` is chosen.
- `originals.types` (optional, [#2061](https://github.com/jwilleke/ngdpbase/issues/2061)): the media types you keep, exactly (`type/subtype`; a wildcard is refused at registration). The site's attachment allow-list (`ngdpbase.attachment.allowedtypes`, shipped `image/*,text/*,application/pdf`) does not name formats such as FHIR JSON, so a keep of one would be refused. For a keep at upload that passes `keep` on, the upload door allows exactly these types, and only into the user's own vault of a system-category your add-on declares. Everywhere else the site's list still decides: the shared pool, another vault, an ordinary upload, another receiver's keep. A type you did not declare is still refused, and size limits are unchanged. Declare the type the door stores: the bytes decide where they can, so XML with an `<?xml` prolog is `text/xml` and without one `application/xml`; JSON is `application/json`, NDJSON `application/x-ndjson`. A file kept this way is always served as a download (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`), never shown inline.

```typescript
async register(engine, config, host) {
  const records = new HealthRecords(/* ... */);
  host.registerReceiver({
    name: 'health-records',
    accepts: ['phr.health-record'],
    mayUse: async (ctx) => records.mayWrite(ctx),
    receive: async (item, ctx) => records.add(item.data, ctx),
    keepsEncrypted: true,
    originals: { allowed: ['keep', 'none'], default: 'keep', types: ['application/json', 'application/x-ndjson', 'application/xml', 'text/xml'] },
    // records.keepOriginal calls uploadAttachment(item.bytes, { originalName, mimeType: item.mediaType, size }, ctx, { private: true, store: 'phr', keep })
    keepOriginal: async (item, ctx, keep) => records.keepOriginal(item, ctx, keep)
  });
  host.registerShim({
    name: 'ccda',
    direction: 'in',
    accepts: { extensions: ['.xml'], canRead: (input) => xmlKind(input.text ?? '') === 'ccda' },
    produces: 'phr.health-record',
    receivers: ['phr.health-records'],
    async read(input) {
      const { records, note } = readCcda(input.text ?? '');
      return { items: records.map(r => ({ kind: 'phr.health-record', name: input.name, data: r })), partial: note };
    }
  });
}
```

#### How a user reaches your receiver: `/import`

You do not build an upload screen. Core's import screen, `/import` ([#2021](https://github.com/jwilleke/ngdpbase/issues/2021)), is open to every user, and offers each one the receivers whose `mayUse(ctx)` says yes, yours among them. There is no import permission: a user your rule refuses never sees your receiver, and a user it allows does. A user who may use no receiver is told so on the screen.

- __Link to it__ from your own pages with your receiver preselected: `/import?receiver=<slug>.<receiver>`, e.g. `/import?receiver=phr.health-records` from "My Health Records". The preselection applies only when the user may use that receiver; otherwise the screen ignores it.
- __What the screen does:__ the user picks files or a zip, and the original-file choice your `originals` allows. The upload goes to `enqueueUpload` with the request's context (the run gets the user's own job context) and returns at once; the screen then shows each file's status from `getImportRun`, refreshing until the run is done. Users see only their own runs. Limits are `ngdpbase.import.engine.upload-max-files` and `upload-max-bytes`.
- __Label__ your receiver (`label: 'Health records'`): that is what the screen shows. Without one it shows the id.

Start an import from your own route instead only when the upload is not a user's files, with `engine.getManager('ImportManager').enqueueImport({ source: { type: 'upload', files }, receiver: '<slug>.<receiver>', original }, jobContextFromRequest(req.userContext))`. Never pass a `scope` a client sent ([#2013](https://github.com/jwilleke/ngdpbase/issues/2013)). For a user's own upload from a request, call `enqueueUpload(request, req.userContext)` instead: it keeps a `keepsEncrypted` receiver's originals with the request's context first, then queues the run as `jobContextFromRequest(req.userContext)`. A refusal throws `ImportUploadRefused` (its `message` is for the user) with nothing queued. It returns a run id at once; `getImportRun(runId, ctx)` gives that user the per-file report. The worked example is the test fixture addon `src/managers/__tests__/__fixtures__/ice-fixture-addon`, shaped like yourPHR's C-CDA and FHIR readers.

### Declare a Private Store ([#1414](https://github.com/jwilleke/ngdpbase/issues/1414))

An addon that holds a user's own data — health records, finances, anything sensitive or regulated — owns a __store kind__: one private container per user, at `pages/vaults/{user}/{vaultid}/`. Reference: [`docs/private-stores.md`](../private-stores.md).

__You declare the kind. You do not implement encryption, keys, or recovery words.__

#### Declaring the kind

Until [#1505](https://github.com/jwilleke/ngdpbase/issues/1505) an addon declared its kind in `package.json` `ngdpbase.stores`, and core saved it as `ngdpbase.stores.{id}.owner` / `.encrypt`. That mechanism is gone: no addon used it, and a vault kind is now a __system-category entry with a vault__ (`storageLocation.privatestore`), carrying its own `encrypt` and `owner` ([system-category.md](../system-category.md)). An addon declares that entry under `ngdpbase.system-category.<key>` in its own `config/default-config.json`, with `owner` set to its __slug__ ([#927](https://github.com/jwilleke/ngdpbase/issues/927), [#1507](https://github.com/jwilleke/ngdpbase/issues/1507), [#1559](https://github.com/jwilleke/ngdpbase/issues/1559)). Core reads it from every installed addon, enabled or not, and refuses an entry that claims another owner, reuses another entry's key or vault, or has a value of the wrong type; the addon is then not loaded. The worked example is the journal vault (`pages/vaults/{user}/journal/`) in `addons/journal/config/default-config.json`.

What does not change:

- __`encrypt` is your call as the vault's owner__, not the end user's, and your declaration stands: sensitive or regulated data (a health-record addon, say) declares `encrypt: true`, and nobody turns it off. A copy keeps what it was created with.
- You do not implement encryption, keys or recovery words; core's door does.

#### When your addon is not running

Nothing is ever removed. The kind stays in configuration and every user's copy stays on disk, sealed if it was. The store's door is shut, and says why:

| Your addon | The door |
| --- | --- |
| loaded | open |
| enabled, failed to load | closed: temporarily unavailable |
| turned off | closed: the add-on that owns this store is turned off |
| not installed | closed: not installed on this site |

Turning your addon back on reopens it, with every user's keys as they were. An administrator turning it off is warned how many users hold data in each of your stores, and is never refused.

One rule is stated in the design and __not yet enforced by code__, so do not rely on it: that a kind's definition cannot be removed, nor its data purged, while any user still has data in it.

#### Core owns the door

Core implements the entry step, at `/stores/{kind}`. It derives the user's key material if they have none, generates the 12 recovery words, creates the user's copy of the store with its wrapped DEK, and shows the words __once__, with a confirmation step that discards everything if the words are not typed back. It runs at the user's deliberate entry — never at login, never mid-save.

Your addon's part:

- Link to `/stores/{your-kind-id}` where your set-up step belongs ("set up your health records").
- Assume the key exists once the door returns. By the time your addon writes anything, it does.

The door renders core's own wording around the kind's id ("Private store: `<id>`"); it does not show a label or description of yours yet (see [Known gaps](#known-gaps)).

Your addon __never__ sees a KEK, a DEK or a recovery word, and must never ask for, store, or log one. There is no API that hands you key material, and there will not be.

#### What this buys you

- Reads and writes through the normal manager APIs; core seals the bytes and the store's own indexes.
- A user who never enters your store is never asked to keep recovery words.
- The store is self-contained on disk, so everything about it lives in one directory.

A user can take out their store and import it again ([#1387](https://github.com/jwilleke/ngdpbase/issues/1387), [#1472](https://github.com/jwilleke/ngdpbase/issues/1472)), and a site backup copies it as it is on disk. A vault's owner can share it: `ShareManager.issueVaultShare`, read-only, lasting at most the category's `shareMaxDays` ([#1388](https://github.com/jwilleke/ngdpbase/issues/1388)).

#### Where this is going ([#1477](https://github.com/jwilleke/ngdpbase/issues/1477))

The store kind is a system-category entry with a vault. Built:

- `storageLocation.privatestore` is `pages/vaults/{user}/{vaultid}/`. The folders moved off `pages/private/` in [#1506](https://github.com/jwilleke/ngdpbase/issues/1506).
- `encrypt`, `owner` and `defaultPrivate` (`true`, `false` or `choice`) live on that entry. Who may make a page public is the `page-public` policy, not an `allowPublic` field. `encrypt: true` keeps the vault's pages private.
- The door is still `/stores/{kind}`.
- The add-on declares that entry in its own `config/default-config.json`, and core reads it live from every installed add-on, enabled or not ([#1507](https://github.com/jwilleke/ngdpbase/issues/1507), [#1559](https://github.com/jwilleke/ngdpbase/issues/1559)). Turning the addon off loses nothing: the category stays valid but is not offered, its public pages still show, and the vault shows the closed door.

The target is defined in [system-category.md](../system-category.md). Retiring an addon for good (moving its pages out, then removing its category) is [#1490](https://github.com/jwilleke/ngdpbase/issues/1490).

---

## 4b. Add-on Route Views and Refusals: Core's Path, Never a Copy

One code path for what every page shows and for every refusal ([#1749](https://github.com/jwilleke/ngdpbase/issues/1749)). An add-on never builds its own.

__View data.__ A route that calls `res.render()` spreads core's template data first. It is exactly what core's own views get (`WikiRoutes.getCommonTemplateData`): the header, the left menu (through `PageManager.readChromePage`, honouring `ngdpbase.chrome.left-menu-page`), the CSRF token, the signed-in user. Then add the view's own fields:

```typescript
router.get('/', (req, res) => {
  void (async () => {
    res.render('my-view', { ...(await engine.templateData?.(req)), currentUser: req.userContext, /* ... */ });
  })();
});
```

Do not read the left menu or `req.session.csrfToken` yourself; a missing key makes the sidebar empty or every POST a CSRF 403.

__Who may act.__ Ask through `ApiContext`, as core's routes do. A refusal comes back as an `ApiError`; send it with `sendApiError`, never with your own `res.status(...)`. It sends the status, the message and, for a step-up, the way to sign in again (only this site's `/auth/reauth?` page), as JSON, as text, or, for a link the user follows in the browser (`'page'`), as a redirect to sign in again or to sign-in:

```typescript
const { ApiContext, ApiError, sendApiError } = host;   // register()'s third argument, handed to the route

router.post('/thing', (req, res) => {
  void (async () => {
    try {
      const ctx = ApiContext.from(req, engine);
      await ctx.requirePermission('my-permission');
      // ...
    } catch (err) {
      if (err instanceof ApiError) { sendApiError(res, err); return; }   // 'page' for a link followed in the browser
      res.status(500).json({ error: String(err) });
    }
  })();
});
```

Decisions, step-up and the step-up audit record all come from core this way. Do not call `PolicyInformationPoint` or `PolicyDecisionPoint` from a route to make your own gate.

### Scripts in a view: the CSP nonce contract

The site is moving to a strict, nonce-based script Content-Security-Policy ([#1489](https://github.com/jwilleke/ngdpbase/issues/1489)). Under it the browser runs an inline script only when it carries the nonce of the response it came in, and never runs an inline event handler or a `javascript:` URL. An add-on view follows the same contract as core's views ([#1706](https://github.com/jwilleke/ngdpbase/issues/1706)):

- __Every inline `<script>` carries the response's nonce__, exactly as written here: `<script nonce="<%= locals.cspNonce %>">`. Core sets `res.locals.cspNonce` on every response, so a view rendered with `res.render()` has it. `locals.` makes a render outside a request produce an empty nonce instead of throwing. A script loaded from a file (`<script src="/addons/<slug>/js/x.js">`) and a data block (`type="application/json"`) need no nonce.
- __No inline event handler__: no `onclick=`, `onsubmit=`, `onchange=`, `oninput=` or any other `on*=` attribute, in markup or in a string your script writes into `innerHTML`. Put the data on the element (`data-action="remove"`, `data-confirm="Delete it?"`) and attach one listener with `addEventListener`, in the nonce-bearing script or a script file. `addons/forms/views/forms-builder.ejs` is a worked example.
- __No `javascript:` URL__ in an `href`, `src`, `action` or `formaction`. Use a `<button type="button">` with a listener.
- __A partial rendered outside the request has no nonce__ (for example the HTML `profileSection()` returns, which the add-on renders with `ejs.renderFile`). Its script goes in a file the add-on serves (`engine.serveStatic`) and is loaded with `<script src>`. `addons/journal/views/_profile-section.ejs` does this.

The script policy itself is not sent yet: [#1705](https://github.com/jwilleke/ngdpbase/issues/1705) adds `script-src` in report-only mode, then enforces it. Until then a view that breaks the contract still works; once the policy is report-only the browser console reports what it would block, and once it is enforced that script does not run. `npm run create:addon` writes views that follow the contract. A bundled add-on's views are checked by `src/__tests__/viewsScriptNonce.test.ts`, which is part of `npm test`.

---

## 5. Writing a Plugin

Plugins execute server-side during page render and return an HTML string.

```javascript
// plugins/MyPlugin.js
module.exports = {
  name: 'MyPlugin',

  /**
   * @param {object} context  - { engine, pageName, linkGraph, formatters }
   * @param {object} params   - key/value pairs from [{MyPlugin key='value'}]
   * @returns {string}        - HTML fragment
   */
  execute(context, params) {
    const myManager = context.engine.getManager('MyDataManager');
    const id = params.id || '';
    const record = myManager?.getById(id);
    if (!record) return `<span class="error">Not found: ${id}</span>`;
    return `<div class="my-widget">${record.name}</div>`;
  }
};
```

Invoked in wiki markup: `[{MyPlugin id='42' style='compact'}]`

### Formatting output

`context.formatters` holds the plugin formatter helpers PluginManager owns: parameter parsers, `formatAsTable`, `formatAsList`, pagination, `escapeHtml` and the rest ([plugin-formatters.md](../plugins/plugin-formatters.md), [#1820](https://github.com/jwilleke/ngdpbase/issues/1820)). Use them rather than building markup by hand, and escape every value you interpolate:

```javascript
execute(context, params) {
  const { escapeHtml } = context.formatters;
  return `<div class="my-widget">${escapeHtml(params.id || '')}</div>`;
}
```

Do not import them from `../../dist/src/utils/pluginFormatters.js`: `npm run lint:addons` fails on a value import of that module from addon code (tests are exempt). A helper function outside `execute` takes `context.formatters` as a parameter; it does not import or cache the helpers. Code that is not a plugin, such as a route or a manager, reads `engine.getManager('PluginManager').formatters`. `import type` of their types (`PageLink`, `FormOption` and the rest) stays allowed.

### Plugins and the page cache

A rendered page is cached once, keyed by the viewer and their roles, and re-rendered when any data it read changes ([caching-developer-guide.md](caching-developer-guide.md), #1751). A plugin declares nothing: every manager it fetches through `context.engine.getManager(name)` is recorded as data the page read. Your add-on's manager announces each write once, at the door every write goes through:

```javascript
await engine.getManager('CacheManager')?.bump('MyDataManager');
```

The page then stays cached while nothing changes and is re-rendered on the next read after a write. A plugin whose output drifts with time (the time to the minute, an uptime) calls `context.dependsOn(CLOCK_TOPIC)` — the topic `'Clock'`, whose version is the current minute — so its page re-renders at most once a minute. Data that does not come through a manager is declared with `context.dependsOn(topic)`. Only output that differs on every request (seconds, a per-render counter) sets `volatile: true` on the plugin object or calls `context.markVolatile()`; a page that runs it is rendered on every request and never cached. Keep no reference to a manager from `initialize`: fetch managers through the engine you are given for this render, `context.engine` in `execute` or the engine passed to `fetch(engine)`.

---

## 6. Writing a Manager

Managers hold domain data and business logic. For an add-on a manager is a plain
class: it does not extend `BaseManager`, which is core's and is not on `host`
([#1813](https://github.com/jwilleke/ngdpbase/issues/1813)). What `BaseManager` would give an add-on is done for it already:
its `dataPath` and any folder its module declares in `backupFolders(config)` are
backed up and restored by BackupManager ([Backup](#backup-your-datapath-is-backed-up-for-you)),
`engine.registerManager` takes any object, and `MarqueePlugin` and the form
`optionsSource` reach `toMarqueeText` and `toFormOptions` by name. Keep the
engine, or `host`, as a field if the manager needs them.

```javascript
// managers/MyDataManager.js
class MyDataManager {
  constructor(dataPath) {
    this.dataPath = dataPath;
    this.records = new Map();
  }

  async load() {
    // load from JSON file, SQLite, etc.
  }

  getById(id) {
    return this.records.get(id);
  }
}

module.exports = MyDataManager;
```

Register it in `register()` so plugins and routes can retrieve it:

```javascript
async register(engine, config) {
  const MyDataManager = require('./managers/MyDataManager');
  const mgr = new MyDataManager(config.dataPath || engine.getManager('ConfigurationManager').resolveDataPath('my-addon'));
  await mgr.load();
  engine.registerManager('MyDataManager', mgr);
}
```

### Backup: your dataPath is backed up for you

A manager's backup is not code you write ([#1943](https://github.com/jwilleke/ngdpbase/issues/1943), [#1985](https://github.com/jwilleke/ngdpbase/issues/1985)). An add-on's data is backed up through its declared add-on databases (`DatabaseManager` copies every declared one) and its `dataPath`:

- BackupManager writes your `dataPath` beside every backup as `<stem>.<slug>.tar` (`.tar.enc` under the backup key) when the folder exists, stages it in a whole-site restore, and puts it back at the next start __before your `register()` runs__, so everything you read there at start is the restored copy. You write no `backup()`, `restore()` or staging code, and import nothing for it.
- A folder you keep somewhere else is declared on the add-on module, `backupFolders(config)`, returning `[{ part, folder }]`; it is backed up and restored the same way. Give each a part name of its own (`<slug>-<what>`): it is the archive's name.
- A database is declared, not copied ([storage guide](storage-developer-guide.md#declaring-a-database)).

So an add-on manager does not implement `backup()`/`restore()`, and must not add no-op ones: the site backup skips a registered manager that has none, and never counts it as missing. The forms, calendar and feeds add-ons work this way. The rules are in the [backup and restore guide](backup-restore-guide.md#rules-for-developers-and-add-on-authors).

---

## 7. Writing Routes

### The router comes from core ([#1861](https://github.com/jwilleke/ngdpbase/issues/1861))

Build every router with `engine.createRouter(options?)`. It returns `express.Router(options)` from core's own Express. Mount it with `engine.app.use(...)` in `register()`. For files under `public/`, use `engine.serveStatic(dir, options?)` (core's `express.static`).

Never value-import `express` in add-on runtime code: no `import { Router } from 'express'`, no `import express from 'express'`. An add-on installed into `<data>/addons` resolves imports from its own folder, where there is no Express and no npm at runtime. Bundling its own copy would miss core's security fixes. Types are fine, because they are erased at compile: `import type { Router, Request, Response } from 'express'`, with `@types/express` as a dev dependency. Tests are exempt, since they build their own app around the router (a mock engine gives `createRouter: () => express.Router()`). `npm run lint:addons` refuses a value import of `express` in add-on code.

### ApiContext — authentication and authorisation

All addon API routes __MUST__ use `ApiContext` for any route that restricts access.
All addon API routes __SHOULD__ use `ApiContext` even for public routes — it gives you
caller identity for free and establishes a consistent pattern.

Do __not__ access `req.userContext`, `req.session`, or `req.session.isAuthenticated` directly
in route handlers. `ApiContext` wraps these correctly and handles TypeScript typing.

The request's types come with the host: `dist/src/context/ApiContext.d.ts` imports ngdpbase's `Request` augmentation (`req.userContext`, `req.session`), so an add-on that imports `ApiContext` sees those properties with no tsconfig entry and no copy of the type ([#1665](https://github.com/jwilleke/ngdpbase/issues/1665)). Typechecking outside the image also needs `@types/express`, `@types/express-session` and `@types/multer` installed; the CI that `create:addon --repo` generates installs them.

__`ApiContext.from()` always succeeds — it never throws for anonymous callers.__
On an unauthenticated request it returns a context with `isAuthenticated: false`
and the anonymous subject's username and roles. The guards (`requirePermission`,
then `actingUsername` for a per-user feature) are opt-in — a public route simply does not call them.
There is no "signed in" guard: whether an anonymous visitor may do something is a policy question,
answered by `requirePermission` ([#1430](https://github.com/jwilleke/ngdpbase/issues/1430)):

```typescript
// Fully public route — no guards, but ApiContext still used for consistency
// and in case you need ctx.isAuthenticated for conditional behaviour
router.get('/feed.ics', async (req, res) => {
  const ctx = ApiContext.from(req, engine); // safe for anonymous callers
  // ctx.isAuthenticated, ctx.username etc. available if needed
  const events = await mgr.query({ calendarId: 'events' });
  res.type('text/calendar').send(generateIcs(events));
});
```

```typescript
// routes/api.ts
import type { Router } from 'express';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type { AddonHost } from '../../../dist/src/utils/addonHost.js';

// register() mounts it: engine.app?.use('/api/my-addon', apiRoutes(engine, config, host));
export default function apiRoutes(engine: WikiEngine, _config: Record<string, unknown>, host: AddonHost): Router {
  const { ApiContext, ApiError, sendApiError } = host;
  const router = engine.createRouter();

  // Public route — SHOULD use ApiContext for consistent caller identity
  router.get('/search', async (req, res) => {
    try {
      const ctx = ApiContext.from(req, engine);
      const mgr = engine.getManager('MyDataManager');
      const q = String(req.query.q || '');
      const results = await mgr.search(q);
      // Optionally filter results with await ctx.hasPermission('my-addon-read') — never ctx.roles
      res.json({ results });
    } catch (err) {
      if (err instanceof ApiError) return sendApiError(res, err);
      res.status(500).json({ error: String(err) });
    }
  });

  // Protected route — MUST use ApiContext
  router.post('/items', async (req, res) => {
    try {
      const ctx = ApiContext.from(req, engine);
      await ctx.requirePermission('my-addon-manage'); // → 401 anonymous, 403 signed in, unless a policy grants it
      const username = ctx.actingUsername();          // only for a per-user feature: → 401 if nobody to act as

      const mgr = engine.getManager('MyDataManager');
      const item = await mgr.create(req.body, username);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof ApiError) return sendApiError(res, err);
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
```

### ApiContext reference

| Method / Property | Description |
|---|---|
| `ApiContext.from(req, engine)` | Build from an Express request — always succeeds |
| `ctx.isAuthenticated` | `true` if caller has an active session |
| `ctx.username` | Caller's username, or `null` for anonymous |
| `ctx.roles` | Caller's role array — always an array, never undefined. Never an allow or deny |
| `ctx.email` | Caller's email, or `null` |
| `ctx.isTest` | `true` when the caller is signed in to a test account ([#1805](https://github.com/jwilleke/ngdpbase/issues/1805)). An attribute, never an allow or deny: the add-on decides what a test account may do. Plugins read the same flag as `userContext.isTest` |
| `await ctx.hasPermission(permission)` | `true` if policy grants the permission — deny policies and the token and share ceilings included |
| `await ctx.requirePermission(permission)` | Throws unless policy grants the permission: `ApiError(401)` for an anonymous caller, `ApiError(403)` for a signed-in one |
| `await ctx.enforceDeny(permission, decision)` | Turns a deny from `pdp.decide` into the refusal `requirePermission` throws — always throws; an allow is a programming error. See [Permissions](#permissions) |
| `ctx.actingUsername()` | The signed-in username a per-user feature acts as; throws `ApiError(401)` if nobody is signed in. Ask it after `requirePermission` |
| `ctx.engine` | Reference to the engine |

`ApiError` carries a `status` number and, for a step-up refusal, a `reauth` link. Catch it and send it with `sendApiError(res, err, mode)` from `ApiContext.js` — `mode` is `'json'` (default: `{ success: false, error, reauth? }`) `'text'` (the message, then the re-authenticate link) or `'page'` (a link the user followed, such as a download: redirects to the re-authenticate page for a step-up, to sign-in for a 401, else the message). Never write the refusal yourself with `res.status(err.status)`: the `reauth` link is easy to drop.

There is no `hasRole` / `requireRole`, and no `requireAuthenticated`: a role name, or being signed in, skips the policy evaluator, deny policies and the agent-token ceiling ([security-developer-guide.md](security-developer-guide.md)). Declare the permission and grant it as in [Permissions](#permissions), then ask for it. The journal and calendar addons are worked examples:

- the journal declares `journal-read`, `journal-write` and `journal-export`, in one `journal-access` policy;
- calendar declares `calendar-manage` (admin) and `calendar-reserve` (every role that can sign in).

---

## 8. Background Jobs

`BackgroundJobManager` runs two kinds of job: one that runs when something asks for it, and one that runs by itself on a schedule. Register both in `register()`. The design and its decisions are on [#1611](https://github.com/jwilleke/ngdpbase/issues/1611); the manager's reference is [BackgroundJobManager.md](../managers/BackgroundJobManager.md).

### A job that runs when asked

```javascript
jobManager.registerJob({
  id: 'my-addon.reindex',
  displayName: 'My Addon — Reindex',
  async run(reportProgress, ctx) {
    reportProgress('Starting...');
    // ... ctx names who asked (#631): use it for any permission check or record ...
    return { success: true, summary: 'Reindexed 120 items' };
  }
});

// From a route, as the user asking:
const runId = await jobManager.enqueue('my-addon.reindex', jobContextFromRequest(req.userContext));
```

`enqueue` returns at once; `getStatus(runId)` gives progress. A job enqueued again while it runs returns the run already going.

__If the server restarts mid-run__ the run is never lost silently. By default it is reported: recorded as failed, audited, and an error notification tells the admins to run it again. Declare `persist: true` when running the job again does no harm — a rebuild, a reindex — and it is restarted instead, as the user who asked, with `ctx.resume` and its last checkpoint. Add `permission: '<the permission your route checks>'` and the restart happens only if that user still holds it. Leave `persist` off for work that must not repeat unchecked, such as an import that would post twice.

### A job that runs on a schedule

```javascript
jobManager.registerJob({
  id: 'my-addon.month-close',
  displayName: 'My Addon — Month close',
  schedule: 'end-of-month 06:00',          // or { rrule: 'FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=6;BYMINUTE=0', tz: 'America/New_York' }
  catchUp: 'latest',                       // none | latest | all
  overlap: 'queue',                        // queue | skip
  timeout: 2 * 60 * 60_000,                // ms; scheduled default 1 h; 0 = no limit
  maxAttempts: 3,
  async run(reportProgress, ctx) {
    const start = ctx.resume?.checkpoint?.doneThrough ?? 0;
    for (let n = start + 1; n <= accounts.length; n++) {
      if (ctx.signal.aborted) return { success: false, error: 'stopped' };
      await closeAccount(accounts[n - 1], ctx.slot);    // safe to repeat for the same slot
      ctx.checkpoint({ doneThrough: n });
    }
    return { success: true, summary: `Closed ${accounts.length} accounts for ${ctx.slot}` };
  }
});
```

Nothing else is needed: the scheduler finds the slots, runs each once, and keeps what it must across restarts.

__The schedule.__ An iCalendar recurrence rule (RFC 5545 RRULE), or one of these shorthands, each an optional `HH:MM` (default 00:00):

| Shorthand | Runs |
|---|---|
| `hourly` | on the hour |
| `daily 06:00` | every day |
| `weekly MO 06:00` | one day a week (`MO` … `SU`) |
| `every 15m`, `every 6h`, `every 30d 06:00` | at that interval |
| `start-of-month`, `end-of-month` | the 1st; the last day |
| `last-business-day` | the last Monday–Friday of the month |
| `end-of-quarter` | the last day of March, June, September, December |
| `start-of-year` | 1 January |

- An RRULE goes in as `FREQ=…`, or as `{ rrule, tz, dtstart }`. Interval rules (`every 30d`) count from `dtstart`, default `2000-01-01T00:00:00`, so their phase is the same on every start.
- The time zone is `tz`, else the site's: `ngdpbase.default.timezone` (default `UTC`), which `jobManager.scheduleTimeZone()` returns. Leave `tz` out so the job runs in the site's zone. Daylight saving does what a user expects: a time skipped in spring runs at the next valid instant; a time repeated in autumn runs once.
- A date that does not exist is skipped, as RFC 5545 says: `BYMONTHDAY=31` skips short months. The last day of a month is `BYMONTHDAY=-1`.
- `FREQ=SECONDLY` and slots closer than `ngdpbase.jobs.min-interval-ms` (default 60 s) are refused. A schedule that does not compile throws from `registerJob`, naming the job: it is your error at start, never a job that silently never runs.
- Cron is not accepted.

__Which local month or day the slot is.__ `ctx.slot` is a UTC instant: 00:30 on 1 November in Tokyo is 31 October in UTC. Ask core for the local parts, never `new Date(ctx.slot).getUTCMonth()` and never an `Intl` formatter of your own ([#1998](https://github.com/jwilleke/ngdpbase/issues/1998)):

```javascript
async run(reportProgress, ctx) {
  const { year, month } = host.zonedParts(new Date(ctx.slot), jobManager.scheduleTimeZone());
  await issueInvoicesFor(year, month, ctx);   // the local month the slot falls in
  return { success: true, summary: `Invoices for ${year}-${String(month).padStart(2, '0')}` };
}
```

If the job's schedule names its own `tz`, pass that zone instead. A run started by hand has `ctx.slot` `null`; use the time it runs.

__Ship the job paused__ when a site must turn it on before it runs (an invoice run that sends mail): set its switch in your own `config/default-config.json`. The site then sees it paused on Admin → Scheduled Jobs, and Resume turns it on; the site's own value always wins over yours. While paused it runs no slot and records nothing; once resumed it counts slots from then and catches nothing up.

```json
{
  "ngdpbase.jobs.my-addon.month-close.enabled": false
}
```

Name only your own job's key: `ngdpbase.jobs.<your slug>.<job>.enabled`.

__The job id__ is `<slug>.<job>`: lowercase letters and digits, joined by single dots or dashes. It names the job's state files and the operator's override keys.

__What the run is handed__ (`ctx`, a `JobRunContext`):

| Field | |
|---|---|
| `username`, `origin`, `reason`, `job` | Who it runs as. A scheduled run is the system principal with origin `schedule` and `job` set to the job's id: it acts as the job when a policy names the job ([A permission your scheduled job needs](#permissions)), else with the system principal's roles. An admin's "run now" or rerun is that admin, with no `job`. Permission checks the job makes ask with this, as in [security-developer-guide.md](security-developer-guide.md). |
| `slot` | The slot's instant (ISO, UTC), or `null` for a run nobody scheduled. Key your work on it. |
| `signal` | Aborted at the timeout and at shutdown. A long job checks it and stops. |
| `resume` | `null` on a first attempt; on a later one `{ attempt, checkpoint, reason }`. |
| `checkpoint(data)` | Saves a bookmark the next attempt gets back. |

__Catch-up and overlap.__ Slots missed while the server was down or the job idle follow `catchUp`: `none` runs only a slot that has just come due, `latest` (the default) runs the newest once, `all` runs the newest 12, oldest first. Slots that came due while the job was still running follow `overlap`: `queue` (the default) keeps one waiting, `skip` keeps none. One job never runs twice at once. Every slot passed over is recorded and audited (`job-skipped`), never dropped silently.

__Attempts.__ A failed attempt — an error, a timeout, `success: false`, or the server stopping mid-run — is tried again after 1, 5, then 15 minutes, with the same run id and slot, up to `maxAttempts` (default 3). After the last the slot is failed, audited and notified, and the next slot runs as usual.

__Idempotent per slot.__ A slot can run more than once: a retry, a resume after a crash, an admin's rerun. So doing the slot's work again must change nothing it already did. "Close account X for October" checks whether it is closed and skips it if so.

__Checkpoint or start again.__ A process that stops loses everything in memory: its place in the loop, running totals, results not yet written, open connections. What survives is what was written. A job that wants to continue rather than start again saves a bookmark as it goes:

- __With a checkpoint__: the month close saves `{ doneThrough: 311 }`; on resume `ctx.resume.checkpoint` gives it back and it carries on at 312.
- __Without one__: it starts the slot again from account 1. That is safe only because closing an account twice changes nothing.

A checkpoint is a bookmark, not storage for results: JSON, at most `ngdpbase.jobs.max-checkpoint-bytes` (64 KiB; larger throws to the job), written at most once every 5 s with the latest winning, and once more when the run ends. Deleted when the slot succeeds, kept when it fails. Results go where the addon keeps its data.

__Timeouts and shutdown.__ At its `timeout` the run's `signal` is aborted, and it is failed as timed out. On SIGTERM or SIGINT every running job's `signal` is aborted and it gets `ngdpbase.jobs.shutdown-grace-ms` (default 5 s) to stop; the run is then saved as interrupted with its last checkpoint, and the next start resumes it at once without counting an attempt. A hard kill does not get that far: the run resumes once its lock expires, as its next attempt.

__`persist`__ (default `true` for a scheduled job) keeps slots, history and locks in FAST_STORAGE, or the application database. `persist: false` keeps them in memory: no catch-up after a restart, no lock, no resume. Use it only for a harmless tick whose next run does the same work.

__Do not use `setInterval` for recurring work.__ A timer catches nothing up after downtime, runs twice during a rolling update, records nothing when it misses, and is not stopped cleanly at shutdown. Register a scheduled job instead.

__A job that runs often sets `routine: true`.__ Every successful run of an ordinary job is audited and sends admins an info notification ("… complete"). For work that runs every few minutes and whose next run does the same thing (refreshing a feed, polling an outside source), that buries them: a job every 10 minutes is 144 notices a day. With `routine: true` a success is neither audited nor notified and logs at debug; a failure is still audited and notified like any job's. Keep it off for a run someone needs to know happened (a monthly close, a daily statement).

__What the operator controls__, without changing your code: `ngdpbase.jobs.<id>.schedule` replaces the schedule, `ngdpbase.jobs.<id>.enabled: false` pauses it, and Admin → Scheduled Jobs runs it now, reruns a skipped or failed slot, or retries a waiting run. See [Scheduled Jobs](../admin/Scheduled-Jobs.md).

__Testing a scheduled job.__ Construct `BackgroundJobManager` with `{ stateProvider, now }` (a `FileJobStateProvider` in a temporary directory and your own clock), register the job, move the clock, call `tick()`, then `whenIdle()`. A second manager over the same directory is a restart. `src/managers/__tests__/BackgroundJobManager.scheduler.test.ts` shows each case.

---

## 9. Dependency Example

If your add-on requires another to be loaded first:

```javascript
module.exports = {
  name: 'volcano-maps',
  dependencies: ['volcano-wiki'],   // volcano-wiki loads before volcano-maps
  async register(engine, config) {
    const volcanoMgr = engine.getManager('VolcanoDataManager');
    // ...
  }
};
```

`dependencies` makes the other add-on mandatory: if it is not installed or not enabled, your add-on does not load.

When your add-on works without the other one but uses it when present, declare it in `optionalDependencies` instead. If it is installed and enabled it loads first, so its managers exist in your `register()`; if not, your add-on loads anyway. Without either declaration the load order is the discovery order (alphabetical within each `addons-path` entry), which is not something to rely on.

```javascript
module.exports = {
  name: 'accounting',
  optionalDependencies: ['forms'],  // forms loads first when enabled
  async register(engine, config) {
    const forms = engine.getManager('FormsAddon');
    if (forms) {
      // register form handlers and definitions
    }
  }
};
```

An optional dependency never blocks disabling the add-on it names. A cycle is still an error, whether it runs through `dependencies` or `optionalDependencies`.

`AddonsManager` resolves load order via topological sort. It will error at startup if a
declared dependency is not installed or not enabled.

---

## 10. Development Workflow

- 1 Edit files in your add-on repo. A TypeScript add-on in this repo needs `npm run build:addons` (or `npm run build`) so `index.js` is current; a plain-JS add-on has no compile step
- 2 `./server.sh restart` to pick up changes
- 3 Check logs: `pm2 logs` or `./server.sh logs`
- 4 Visit `/admin` → Add-ons section to verify load status and `status()` output

For faster iteration on routes/logic without full restart, you can temporarily
`require()` your module inside a route handler and `delete require.cache[...]` —
but a restart is the reliable path.

### Contributing Core Improvements Upstream

If you discover a missing API or bug in the core during add-on development:

- 1 Fix it in the `ngdpbase` repo
- 2 Commit and restart
- 3 Continue add-on development

Keep core PRs self-contained — no add-on-specific code in the core repo.

---

## 11. Add-on Checklist

- [ ] `name` exported from `index.ts` or `index.js` matches `ngdpbase.slug` and the `ngdpbase.addons.<slug>` config key
- [ ] `"ngdpbase.addons.my-addon.enabled": true` in instance config
- [ ] `addons-path` in instance config points to the repo's `addons/` directory (string or array of strings)
- [ ] Routers from `engine.createRouter()`, static assets from `engine.serveStatic()`, both mounted via `engine.app.use()` in `register()`; `express` imported for types only
- [ ] `engine.setCapability('my-addon', true)` called if you have admin UI sections
- [ ] `addonsManager.registerDashboardCard(...)` called if you have an admin UI page
- [ ] `status()` returns `{ healthy: bool, message: string }` for admin health display
- [ ] `shutdown()` closes any open connections or file handles
- [ ] Recurring work is a scheduled job with an id `<slug>.<job>`, safe to run again for the same slot, honouring `ctx.signal` — no `setInterval`
- [ ] Dependencies declared in `dependencies[]` if your add-on relies on another, or in `optionalDependencies[]` if it only uses another when present
- [ ] Every restricted route asks `requirePermission` / `hasPermission` for a permission the addon declares and grants by policy — no role name anywhere; its actions emit their declared audit events ([security-developer-guide.md](security-developer-guide.md), [audit-developer-guide.md](audit-developer-guide.md))
- [ ] Every inline `<script>` in a view carries `nonce="<%= locals.cspNonce %>"`; no `on*=` handler or `javascript:` URL anywhere in a view ([Scripts in a view](#scripts-in-a-view-the-csp-nonce-contract))
- [ ] Core values come from `host`; anything still imported comes through `dist/…`, never `src/…` — `npm run lint:addons` and `npm run check:addon-load` are green
- [ ] Seed pages in `pages/` have a title, a slug, and a real UUID v4 in frontmatter (`uuid`). The instance file is `{uuid}.md`; the source filename is not
- [ ] If the add-on owns the UI chrome: `ngdpbase.chrome.left-menu-page` / `ngdpbase.chrome.footer-page` name its pages, or `pages/left-menu-content.md` and `pages/footer-content.md` are present for the legacy fallback
- [ ] A page whose content is private to each viewer sets `comments: false` and `footnotes: false` in its frontmatter ([Turning off Comments and Footnotes](#turning-off-comments-and-footnotes))
- [ ] If shipping a theme: `theme/theme.json` present (sentinel) and `domainDefaults` sets `ngdpbase.theme.active`
- [ ] If the addon holds a user's own data: its vault is a system-category entry it declares in its own `config/default-config.json`, `owner` set to its slug ([#1507](https://github.com/jwilleke/ngdpbase/issues/1507), [#1559](https://github.com/jwilleke/ngdpbase/issues/1559); the journal is the worked example), sensitive or regulated data sets `encrypt: true`, the set-up step links to the core door, and no key material or recovery word is read, stored or logged ([#1414](https://github.com/jwilleke/ngdpbase/issues/1414))

---

## 12. Shipping Your Addon as a Container Image

This section is the drop-in wrapper: an addon in __its own repo__, layered onto the published ngdpbase image. The Dockerfile, `.dockerignore` and Renovate config below live in the __site repo__, the one that builds and deploys the site image. That can be the add-on's own repo (geohazardwatch is both), or a separate repo that builds from the add-on's source, which keeps the add-on repo free of anything deployment-specific (ngdp-accounting-addons works this way). It does not apply to bundled addons, which are already in `ghcr.io/jwilleke/ngdpbase`. The packaged model (an npm package, no `COPY addons`) is [Where it is loaded](#where-it-is-loaded) and [addon-packaged.md](../platform/deployment/addon-packaged.md).

### What ngdpbase publishes for you

On every `v*` tag, `.github/workflows/docker-build.yml` in `jwilleke/ngdpbase` builds and pushes a container image:

| Tag | Example | Stability |
|---|---|---|
| `<major>.<minor>.<patch>` | `ghcr.io/jwilleke/ngdpbase:3.11.3` | Pinned to a specific release — recommended for production |
| `<major>.<minor>` | `ghcr.io/jwilleke/ngdpbase:3.11` | Floats with patch releases — picks up CVE patches automatically |
| `<major>` | `ghcr.io/jwilleke/ngdpbase:3` | Floats with minor releases — features land without you opting in |
| `latest` | `ghcr.io/jwilleke/ngdpbase:latest` | Default-branch tip — fine for evaluation, never for production |

The image is the only container artifact ngdpbase produces. There is no published Dockerfile template, no codegen, no platform-side hook system. You consume the image via `FROM` in your own Dockerfile.

### Recommended Dockerfile pattern

The runtime image has no npm (removed for its vulnerability scans, #956), so nothing can be installed or compiled in it. Build the add-on in a stage based on the `-devtools` image, which is the same image with npm, then copy the result into the runtime image:

```dockerfile
# renovate: datasource=docker depName=ghcr.io/jwilleke/ngdpbase
ARG NGDPBASE_VERSION=5.8.0

FROM ghcr.io/jwilleke/ngdpbase:${NGDPBASE_VERSION}-devtools AS build
WORKDIR /app/addons/<slug>
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev

FROM ghcr.io/jwilleke/ngdpbase:${NGDPBASE_VERSION}
LABEL org.opencontainers.image.title="my-addon-site"
LABEL org.opencontainers.image.source="https://github.com/<you>/<your-site-repo>"
COPY --from=build /app/addons/<slug> /app/addons/<slug>
```

Give the build an ignore file (where it goes is under Key points), so `COPY . .` does not copy your machine's installed packages and build output over what `npm ci` just installed in the image. Host `node_modules` built on a Mac are darwin-arm64; a native dependency among them breaks or misbehaves on Linux.

```text
node_modules
.git
*.js.map
*.tsbuildinfo
```

Key points:

- The `# renovate: datasource=docker depName=...` annotation on the line above `ARG` is what makes the auto-bump (next section) work. Without it Renovate ignores the ARG. Both `FROM` lines use the same ARG, so the add-on is compiled against exactly the core it runs on.
- The build context is the add-on's folder: `docker build -f <site-repo>/Dockerfile <path-to-addon>`. The `.dockerignore` sits at the root of that context, which is how Docker finds it; from the site repo, use `<site-repo>/Dockerfile.dockerignore` (a Dockerfile-specific ignore file) instead.
- The add-on is built at `/app/addons/<slug>`, the same place it runs from. Its `../../dist/...` imports then resolve to the image's own `/app/dist`, and `express`, `tslib` and the other host packages resolve from `/app/node_modules`. Building anywhere else compiles against, or loads, a second copy of core.
- `npm ci` installs devDependencies too (the compiler); `npm prune --omit=dev` drops them before the copy. `--ignore-scripts` skips `prepare` (husky).
- `/app/addons` is scanned by default, so no `addons-path` setting is needed. Add-ons there load in discovery order (alphabetical) unless they declare `dependencies` or `optionalDependencies` ([Dependency Example](#9-dependency-example)).
- The final stage is the plain runtime image, so the deployed artifact carries no npm. Its `CMD`, `ENTRYPOINT` and `WORKDIR /app` are inherited unchanged.
- The image is published for `linux/amd64` only. It runs on Apple Silicon under emulation, which works but is slow.

### Auto-bump with Renovate

Without automation, the `ARG NGDPBASE_VERSION` default rots. ngdpbase ships `v3.11.3` → your image still pulls `v3.10.3` → your container is missing CVE patches.

Add `renovate.json` to your site repo:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "packageRules": [
    {
      "matchDatasources": ["docker"],
      "matchPackageNames": ["ghcr.io/jwilleke/ngdpbase"],
      "automerge": false,
      "labels": ["dependencies", "ngdpbase-bump"],
      "commitMessageTopic": "ngdpbase",
      "groupName": "ngdpbase upstream"
    }
  ]
}
```

Enable Renovate on the repo (GitHub App or self-hosted). On every ngdpbase release, Renovate opens a PR that:

- 1 Bumps the `ARG NGDPBASE_VERSION=...` default in your Dockerfile.
- 2 Includes the upstream changelog/release notes from `ghcr.io/jwilleke/ngdpbase`'s OCI labels.
- 3 Triggers your CI to rebuild the image against the new base.

Reviewer merges → CI publishes a fresh combined image → your container is current. This is the __deterministic method for container deployment builds__ referenced in [#668](https://github.com/jwilleke/ngdpbase/issues/668): the platform handles publishing, Renovate handles propagation, no codegen required on either side.

If you prefer Dependabot, the equivalent `.github/dependabot.yml` entry is:

```yaml
version: 2
updates:
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "daily"
```

Renovate is recommended over Dependabot here because Renovate's `datasource=docker` annotation in the Dockerfile lets it find the ARG without the file being a literal `FROM image:tag` line — Dependabot only inspects literal `FROM` lines and won't pick up an ARG-driven version.

### What lives where

| Concern | Where it's owned |
|---|---|
| Building/publishing the ngdpbase image | `jwilleke/ngdpbase` (`.github/workflows/docker-build.yml`) — fully automated |
| Building/publishing the combined addon-site image | Your site repo (your own Dockerfile + your own CI workflow) |
| Bumping the `FROM` version | Renovate/Dependabot in your site repo — fully automated |
| Runtime addon registration | `addons-path` config on the deployed instance (ConfigMap, `.env`, etc.) |

ngdpbase does not need to know your addon exists. Your site repo does not need to know how ngdpbase is built. The only contract between them is: ngdpbase publishes images at `ghcr.io/jwilleke/ngdpbase:<version>`; you consume them with `FROM`.

---

## Related

| Resource | Contents |
|----------|----------|
| [`addons/journal/`](../../addons/journal/) | Worked example — personal journal, permissions in `config/default-config.json` |
| [`addons/calendar/`](../../addons/calendar/) | Worked example — calendar; depends on `forms` |
| [`addons/forms/`](../../addons/forms/) | Schema-driven forms. Enable it when you enable calendar |
| [`docs/platform/addon-architecture.md`](../platform/addon-architecture.md) | Load order and the module contract |
| [`docs/platform/addon-identity-contract.md`](../platform/addon-identity-contract.md) | Every place a slug is written |
| [`docs/platform/addon-page-handling.md`](../platform/addon-page-handling.md) | What syncs to an existing instance |
| [`docs/platform/deployment/addon-packaged.md`](../platform/deployment/addon-packaged.md) | npm discovery and the two-stage image |
| [`docs/platform/ngdp-as-platform.md`](../platform/ngdp-as-platform.md) | Platform overview and roadmap |
| [`docs/platform/platform-core-capabilities.md`](../platform/platform-core-capabilities.md) | All built-in managers and APIs |
| [`docs/private-stores.md`](../private-stores.md) | Private stores: layout, store kinds and the door, keys and recovery words, access, pages, links, search, trash and files |
| [AddonsManager source](../../src/managers/AddonsManager.ts) | Discovery, loading, lifecycle implementation |
| [security-developer-guide.md](security-developer-guide.md) | Authorization and context — mandatory; its [Addons](security-developer-guide.md#addons) section covers the config merge |
| [audit-developer-guide.md](audit-developer-guide.md) | Audit events — mandatory |
| [security-posture.md](../security-posture.md), [audit-posture.md](../audit-posture.md) | The standing law those guides apply |
| [configuration-developer-guide.md](configuration-developer-guide.md) | Merge layers |
| [`addons/README.md`](../../addons/README.md) | The addons that ship in this repository |
| [`docs/managers/AddonsManager.md`](../managers/AddonsManager.md) | AddonsManager: discovery, registration, lifecycle, dependencies |
| [`docs/system-category.md`](../system-category.md#system-categories-that-add-ons-bring) | System categories an addon brings |
| [`docs/platform/page-overrides.md`](../platform/page-overrides.md#how-add-ons-ship-default-overrides) | How an addon ships default overrides of special pages |
| [`docs/theming.md`](../theming.md#add-on-stylesheet-registration) | Registering an addon stylesheet |
| [`docs/platform/deployment/how-to-deploy.md`](../platform/deployment/how-to-deploy.md#3-deliver-addons) | Delivering addons to a deployment: bundled, drop-in, packaged |
| [`docs/platform/deployment/docker-compose.md`](../platform/deployment/docker-compose.md#adding-addons) | Addons under Docker Compose: derivative image or volume |
| [`docs/platform/deployment/kubernetes.md`](../platform/deployment/kubernetes.md#wrapper-image-vs-runtime-mounted-addons) | Addons under Kubernetes: wrapper image or runtime mount |
| [`docs/platform/deployment/direct-install.md`](../platform/deployment/direct-install.md#addon-discovery-failures) | Addon discovery failures on a direct install |
| [`docs/related-repositories.md`](../related-repositories.md) | Repositories and deployments that ship addons |
| [`docs/Forms-to-Calendar.md`](../Forms-to-Calendar.md) | One addon feeding another: forms to calendar |
| [`docs/planning/addons.md`](../planning/addons.md) | Domain addons: planning notes and open questions |

## How you know you are done

- The checks in [Testing and lint](#testing-and-lint), including `npm run lint:addons` and, after a build, `npm run check:addon-load`
- The security guide's and the audit guide's "How you know you are done" checks
- `npm run create:addon -- --id …`, then the enable key, then `./server.sh restart`, and the addon listed under `/admin` → Add-ons

## Known gaps

- [#686](https://github.com/jwilleke/ngdpbase/issues/686) — an addon discovered outside the default `./addons` path still starts disabled; the operator has to set `ngdpbase.addons.<slug>.enabled` to `true`.
- [#1813](https://github.com/jwilleke/ngdpbase/issues/1813) — [importing core](#importing-core--types-only): `lint:addons` reads `.ts` files only, so a plain-JavaScript addon's value import of `../../dist` is not refused (`check:addon-load` still imports it); and it resolves relative paths, so a bare `ngdpbase/…` specifier would not be seen (core has no `exports`, so one cannot load either).
- [#1865](https://github.com/jwilleke/ngdpbase/issues/1865) — `@jwilleke/ngdpbase-types` is on npm (first published at 5.18.0, released with each core version), but its public entry is incomplete: `PluginManager` and `AddonsManager` are not exported (`UserManager` is, with `UserUpdateInput` and `UserUpdateFn`, since [#2025](https://github.com/jwilleke/ngdpbase/issues/2025)), and core declares two `PluginContext` types (an annotated `execute(context: PluginContext)` does not type-check against `SimplePlugin`, and neither declares `userContext`). With the real logger type `host.logger.info()` returns the logger, so a `(m): void => host.logger.info(m)` arrow does not compile; use a block body. `create:addon --repo` still generates the build-against-core CI step, which an add-on using this package does not need. `openAddonTestDatabase` opens a new database per call, so a dependent addon's ledger cannot yet join an owner's test database as it joins the owner's file on a site.
- [#1904](https://github.com/jwilleke/ngdpbase/issues/1904) — [checklists](#choices-from-your-manager-and-checklists): forms money is US dollars only. The running total is shown in USD, as the `amount` field shows "$" and parses two decimals; there is no currency setting. The browser cannot call `formatMoney` or the add-on's `parseAmount`, so `forms-submit.js` carries a copy of each, held to the originals by `formsSubmitJs.test.ts`. The form builder lists the `checklist` type and its inline options, but has no input for `optionsSource` or `totalField`; set those in the definition file. A builder save keeps them ([#1921](https://github.com/jwilleke/ngdpbase/issues/1921)).
- [#1921](https://github.com/jwilleke/ngdpbase/issues/1921) — `views/header.ejs` shows the page editor's Save and Cancel for any view whose `title` starts with the word "Edit" and a space (`title.startsWith('Edit ')`), and those need a `pageName`. An add-on view with no page must not title itself `Edit …`: the form builder's edit page did, and every edit of a form answered 500. The builder is titled `Form Builder — Edit Form` now; the header still decides edit mode from the title.
- [#1913](https://github.com/jwilleke/ngdpbase/issues/1913) — [lines](#lines-repeating-rows-of-fields): the form builder lists the `lines` type but cannot edit sub-fields, `minRows`, `maxRows`, `amountField` or `totalField`; write them in the definition file (the builder keeps them on save, and refuses a `lines` field with no sub-fields). A row cannot be removed below one even with `minRows: 0`, since an empty row is not sent. The submission detail page in the forms admin shows each row's raw values (amounts in cents), as it shows top-level amounts.
- [#1830](https://github.com/jwilleke/ngdpbase/issues/1830) — [installed add-ons](#installed-add-ons) have no admin Update action yet (`addon-update` is declared and switched off), and the installed copies are not yet in the site backup.
- [#1706](https://github.com/jwilleke/ngdpbase/issues/1706) — the [view script contract](#scripts-in-a-view-the-csp-nonce-contract) is checked only for bundled add-ons. An external add-on's views are not checked; its author finds a violation only in the browser console, once [#1705](https://github.com/jwilleke/ngdpbase/issues/1705) sends the script policy in report-only mode. Inline scripts a plugin writes into page HTML cannot carry a nonce, because that HTML is cached; they move to static files under [#1733](https://github.com/jwilleke/ngdpbase/issues/1733).
- [#1883](https://github.com/jwilleke/ngdpbase/issues/1883) — [site-critical addons](#when-an-addon-does-not-load-site-critical):
  - There is no notification level above `error`, so "critical" is `error` with "Critical:" in the title. `error` is also the level email escalation sends by default, when it is on (`ngdpbase.notifications.escalation.levels`).
  - `/admin/addons` shows the reason an addon did not load, but not whether it is site-critical.
  - An addon whose `config/default-config.json` can't be parsed loads without its defaults, so its own `site-critical: true` isn't seen. A site that must not run without it sets the key in `app-custom-config.json` too.
  - An addon that catches `openAddonDatabase`'s error and returns from `register()` counts as loaded, so it never blocks the site. Let the error leave `register()`.
  - An enabled addon whose install failed ([#1830](https://github.com/jwilleke/ngdpbase/issues/1830)) sends two notifications: the install problem, and that it did not load.
- [#1930](https://github.com/jwilleke/ngdpbase/issues/1930) — [contacts](#contacts-and-identity-records): the shipped catalog grants `identity-read` to admins and demo admins and `identity-manage` to admins only, so an add-on's own policy must grant them before its users can use a picker. A door's refusal is not yet recorded as `authorization-deny` ([#1825](https://github.com/jwilleke/ngdpbase/issues/1825)). Deleting an organization leaves the affiliations that name it.
- [#1951](https://github.com/jwilleke/ngdpbase/issues/1951) — [turning off Comments and Footnotes](#turning-off-comments-and-footnotes): a `comments:` or `footnotes:` flag added to a seed page that a site already holds does not reach it, because reseed and Required Pages Sync compare the body, not the frontmatter. Change the body in the same release, or declare the flag on the add-on's own system-category, which applies to its pages already seeded and which the site cannot override.
- [#1957](https://github.com/jwilleke/ngdpbase/issues/1957) — [form notices](#ship-form-definitions): the "New form submission" notification is addressed to the holders of the form's `notifyRole`, but `/admin/notifications` and the admin dashboard list every notification (`getAllNotifications`), whatever its targets. Anyone who can view those admin pages sees a notice addressed to `treasurer`. No other page shows notifications by target yet.
- [#1973](https://github.com/jwilleke/ngdpbase/issues/1973) — [forms an add-on provides](#ship-form-definitions):
  - Versions compare as `x.y.z` only. A pre-release version (`1.2.0-rc.1`) makes `registerShippedForm` throw, as a malformed `minVersion` is refused.
  - The version recorded is the `package.json` `version`; Admin → Add-ons shows the module's own `version`. Keep them the same, or the two pages disagree.
  - The notice for an older add-on is raised at every start until a newer one is installed; nothing remembers it was sent.
  - An add-on cannot remove a form it no longer ships: the copy stays, read-only, until an administrator clears its submissions and deletes it.
  - `formVersion` is stored on the submission and passed to your handler; the forms admin pages don't show it, though the CSV export has it as a column.
- [#1414](https://github.com/jwilleke/ngdpbase/issues/1414) — [the store door](#core-owns-the-door) shows the kind's id, not a label or description the add-on declares: `renderStoreDoor` in `src/routes/WikiRoutes.ts` passes `storeLabel` and `storeBlurb` empty.
- [#1965](https://github.com/jwilleke/ngdpbase/issues/1965) — [the listings](#the-manifest) name each add-on by its slug: the manifest has no display name. The description shown is the module's `description`, which is written for administrators, so the bundled journal's still says "wiki pages". Listings change on the page cache's account and configuration versions; turning an add-on on or off in Admin → Add-ons takes a restart, as loading does.
- [#1974](https://github.com/jwilleke/ngdpbase/issues/1974) — [PDF](#make-a-pdf-and-email-it): the same HTML gives the same bytes only on the same provider and engine version; another site, provider or engine may differ. Core ships no font files of its own, so embed yours as `data:` URIs. `PdfUnavailableError` and `AttachmentRefusedError` are types only in `@jwilleke/ngdpbase-types`; test the error's `code`. A render waiting for a slot has no queue limit.
- [#1998](https://github.com/jwilleke/ngdpbase/issues/1998) — [shipping a job paused](#a-job-that-runs-on-a-schedule): the add-on config layer does not check whose job a `ngdpbase.jobs.<id>.enabled` key names, so an add-on's file could pause core's or another add-on's job. Name only your own. `scheduleTimeZone()` is the site's zone; a job whose schedule names its own `tz` passes that zone to `zonedParts` itself.
- [#1999](https://github.com/jwilleke/ngdpbase/issues/1999) — [a job's own permissions](#permissions): the job's policies are not yet shown in the admin roles matrix (it lists roles); read them in Configuration (`ngdpbase.access.policies`). A job id's `<slug>.` prefix is checked in an add-on's policies, but not when the job registers: `registerJob` cannot tell which add-on calls it, and a second registration of an id still replaces the first with a warning.
- [#1979](https://github.com/jwilleke/ngdpbase/issues/1979) — [import shims](#import-shims-and-receivers-ice-1979): only uploads are a source, and only inbound shims run; export (`out`), scheduled URL sources (feeds) and the takeout import come later. No core screen starts an engine run yet, so an addon starts its own from its route. The manifest's `shims` and `receivers` are checked by the host at registration, not yet by a manifest schema (#1966).

---

Last updated: 2026-10-25
