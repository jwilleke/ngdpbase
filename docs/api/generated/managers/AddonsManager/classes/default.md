[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AddonsManager](../README.md) / default

# Class: default

Defined in: src/managers/AddonsManager.ts:515

AddonsManager - Manages optional add-on modules

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `AddonsManager`

Defined in: src/managers/AddonsManager.ts:548

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`AddonsManager`

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`constructor`](../../BaseManager/classes/default.md#constructor)

## Properties

### config?

> `protected` `optional` __config?__: `Record`\<`string`, `unknown`\>

Defined in: src/managers/BaseManager.ts:325

Configuration passed during initialization

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`config`](../../BaseManager/classes/default.md#config)

***

### description?

> `readonly` `optional` __description?__: `string`

Defined in: src/managers/BaseManager.ts:335

Short description of what this manager does.
Used by admin UIs, addon registries, and introspection tools.
Override in subclasses to provide a human-readable description.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`description`](../../BaseManager/classes/default.md#description)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:319

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`engine`](../../BaseManager/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/managers/BaseManager.ts:322

Initialization status flag

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`initialized`](../../BaseManager/classes/default.md#initialized)

## Methods

### addonBackupFolders()

> __addonBackupFolders__(): `object`[]

Defined in: src/managers/AddonsManager.ts:1317

Each loaded add-on's `dataPath` and declared folders (#1985), in load order: what BackupManager backs up for it.

#### Returns

`object`[]

***

### addonShipsTheme()

> __addonShipsTheme__(`addonPath`): `boolean`

Defined in: src/managers/AddonsManager.ts:1705

True if the add-on ships a deployable theme. `theme/theme.json` is the
presence sentinel (mirrors `pages/` needing at least one `.md`).

#### Parameters

##### addonPath

`string`

#### Returns

`boolean`

***

### addonsLoaded()

> __addonsLoaded__(): `boolean`

Defined in: src/managers/AddonsManager.ts:1282

Whether this boot's load pass is over (#1973): every enabled add-on has
had its `register()` called, loaded or not. Until then, what an add-on has
not registered yet says nothing about whether it still provides it.

#### Returns

`boolean`

***

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/AddonsManager.ts:2611

Backup add-on manager state

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### backupFolders()

> __backupFolders__(): [`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

Defined in: src/managers/BaseManager.ts:390

Where this manager keeps its data as folders or files (#1985): declared,
never backed up by hand. BackupManager archives each beside the backup
document (`<stem>.<part>.tar`), stages it in a site restore, and puts the
staged copy in place at the next start, in `initialize()` above, before
the subclass reads it. Resolved from the configuration, so it can be
answered before the subclass's own `initialize()` has run. Default none.

A manager with data in the document as well keeps its `backup()`; a
declared part's record goes beside that data (`data[part]`), or is the
entry's `data` when the manager has none and declares one part.

#### Returns

[`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`backupFolders`](../../BaseManager/classes/default.md#backupfolders)

***

### canDisable()

> __canDisable__(`addonName`): \{ `ok`: `true`; \} \| \{ `blockedBy`: `string`[]; `ok`: `false`; \}

Defined in: src/managers/AddonsManager.ts:1248

Validate that an add-on can be safely disabled (#617).

Mirrors the enable-time topological-sort dep check at `resolveLoadOrder()`:
if any *enabled* add-on declares `dependencies: ['<addonName>']`, the
disable is blocked and the dependent's name is returned. Callers should
surface the blocker to the operator and refuse the disable.

#### Parameters

##### addonName

`string`

The add-on the operator wants to disable.

#### Returns

\{ `ok`: `true`; \} \| \{ `blockedBy`: `string`[]; `ok`: `false`; \}

`{ ok: true }` if safe to disable. Otherwise
                  `{ ok: false, blockedBy: ['dep1', 'dep2', ...] }` with
                  the names of every enabled addon that depends on it.

***

### checkInstalledUpdates()

> __checkInstalledUpdates__(`ctx`): `Promise`\<[`UpdateCheck`](../../../utils/addonInstaller/interfaces/UpdateCheck.md)[]\>

Defined in: src/managers/AddonsManager.ts:858

# 2100: for each add-on in `ngdpbase.addons.install`, the pinned release,
the configured range, and the newest release in it that is newer — asked
of the registry now. Called when an administrator opens the add-ons page
or presses Check; never at start. Registry unreachable is an answer
(`registryUnreachable`), not an error.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`UpdateCheck`](../../../utils/addonInstaller/interfaces/UpdateCheck.md)[]\>

***

### deployAddonTheme()

> __deployAddonTheme__(`addonName`): `Promise`\<\{ `deployed`: `boolean`; `message`: `string`; `ok`: `boolean`; \}\>

Defined in: src/managers/AddonsManager.ts:1769

# 443: Dashboard-triggered theme (re)deploy — always overwrites so theme
updates shipped by the add-on can be pulled in without a server restart
(theme CSS is served as static files; a page reload suffices).

#### Parameters

##### addonName

`string`

Add-on name

#### Returns

`Promise`\<\{ `deployed`: `boolean`; `message`: `string`; `ok`: `boolean`; \}\>

Result for the admin UI

***

### discoverAddons()

> __discoverAddons__(): `Promise`\<`void`\>

Defined in: src/managers/AddonsManager.ts:967

Discover available add-ons by scanning all configured addons directories.

#### Returns

`Promise`\<`void`\>

***

### enabledAddonsFor()

> __enabledAddonsFor__(`ctx`): `Promise`\<`string`[]\>

Defined in: src/managers/AddonsManager.ts:2274

The per-person add-ons this subject has turned on (#1963): each loaded
add-on whose manifest says `perPerson: true` and whose switch, the
person's preference `<slug>.enabled`, is `true`.

It reads exactly those keys and no other preference, so no access check
or listing built on it can come to depend on an arbitrary setting. An
anonymous subject, an unknown or inactive account, and the system
principal (which has no account) have none.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose add-ons: the request's subject, or a job's context

#### Returns

`Promise`\<`string`[]\>

The slugs, in load order

***

### executiveCardsFor()

> __executiveCardsFor__(`ctx`): `Promise`\<[`ExecutiveCardView`](../interfaces/ExecutiveCardView.md)[]\>

Defined in: src/managers/AddonsManager.ts:2397

The Executive Hub's cards for one viewer (#2093): each card whose
permission the PDP permits `ctx`, asked with that context, with the
figures its add-on's `summary(ctx)` reads for them. A card the viewer may
not see is left out; a summary that throws shows the card with its
figures marked as not read, and is logged by add-on name only. No
context, or no PDP, shows no cards.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`ExecutiveCardView`](../interfaces/ExecutiveCardView.md)[]\>

***

### findOrphanedAddonPages()

> __findOrphanedAddonPages__(): `Promise`\<`object`[]\>

Defined in: src/managers/AddonsManager.ts:2459

# 930: addon-seeded instance pages whose source file the addon __no longer
ships__ ("source removed"). Leave-and-flag — this only *detects*; nothing is
deleted here. The admin surface surfaces these and offers an opt-in,
versioned removal.

Enumeration uses the indexed `system-category: addon` (via the search index)
to narrow to addon pages — a small candidate set — instead of scanning the
whole page store. Each candidate is attributed to its addon via the `addon`
frontmatter stamp and diffed against that addon's CURRENT source UUID set.
If search is unavailable, returns `[]` (detection is best-effort, never a
source of deletions).

#### Returns

`Promise`\<`object`[]\>

***

### getAddonConfig()

> __getAddonConfig__(`addonName`): `Record`\<`string`, `unknown`\>

Defined in: src/managers/AddonsManager.ts:1326

Get add-on specific configuration

#### Parameters

##### addonName

`string`

#### Returns

`Record`\<`string`, `unknown`\>

***

### getAddonNames()

> __getAddonNames__(): `string`[]

Defined in: src/managers/AddonsManager.ts:2428

Get list of all discovered add-on names

#### Returns

`string`[]

***

### getAddonVersion()

> __getAddonVersion__(`slug`): `string` \| `undefined`

Defined in: src/managers/AddonsManager.ts:1271

The installed version of an add-on (#1973): the `version` in its
package.json, or its module's `version` when the package.json has none.
Undefined for an add-on that was not discovered.

#### Parameters

##### slug

`string`

The add-on's slug

#### Returns

`string` \| `undefined`

***

### getDashboardCards()

> __getDashboardCards__(`surface?`): [`AddonDashboardCard`](../interfaces/AddonDashboardCard.md)[]

Defined in: src/managers/AddonsManager.ts:2385

Return the registered cards for one surface, in registration order.
The admin dashboard route calls it with no argument for the `/admin` cards.

#### Parameters

##### surface?

[`AddonCardSurface`](../type-aliases/AddonCardSurface.md) = `'admin'`

#### Returns

[`AddonDashboardCard`](../interfaces/AddonDashboardCard.md)[]

***

### getEnabledAddonPagesDirectories()

> __getEnabledAddonPagesDirectories__(): `object`[]

Defined in: src/managers/AddonsManager.ts:2436

Return the `pages/` directory path for each enabled addon that has one.
Used by Required Pages Sync to surface addon pages alongside required pages.

#### Returns

`object`[]

***

### getEngine()

> __getEngine__(): [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:458

Get the wiki engine instance

#### Returns

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Example

```ts
const config = this.getEngine().getConfig();
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getEngine`](../../BaseManager/classes/default.md#getengine)

***

### getManagerStats()

> __getManagerStats__(): `Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/BaseManager.ts:799

What this manager holds (#1006).

__Counts and health only — never item contents.__ That is the whole safety
property, and it is why this is not the `getAll()` the question originally
asked for. `AgentTokenManager` holds bearer credentials, `UserManager`
holds users, `ShareManager` holds capability tokens; a generic enumeration
on the base class means the first generic caller — an admin dump panel, a
search indexer, a debug route — reaches all of it by default. A count
cannot leak what it counts.

Optional by override, with a safe default, exactly like `backup()` and
`toMarqueeText()` above. A manager holding no countable collection omits
`count` rather than reporting `0`, because "nothing to count" and "none"
are different answers and an admin row that shows `0` for
`RenderingManager` is noise.

__Never throws.__ A broken manager reports `healthy: false`; it does not
take down the page rendering every other manager. The base wraps nothing,
so an override that can fail must catch its own errors — see the note on
`safeGetManagerStats()`.

__Named `getManagerStats`, not `getStats`.__ Two managers already have a
`getStats()` returning their own domain shape — `FilterManager` (pipeline
statistics, #615) and `NotificationManager` (`NotificationStats`, read by
a live route). Both are correct for what they do, and taking the name from
them would either break those callers or leave `getStats()` meaning two
different things depending on the manager, which is the exact confusion
this contract exists to remove. A generic caller needs a name that means
one thing everywhere.

#### Returns

`Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

#### Example

```ts
async getManagerStats(): Promise<ManagerStats> {
  const active = this.list('').filter((r) => !r.revokedAt);
  return { ...await super.getManagerStats(), count: active.length };
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getManagerStats`](../../BaseManager/classes/default.md#getmanagerstats)

***

### getManagerStatus()

> __getManagerStatus__(): [`ManagerStatus`](../../BaseManager/interfaces/ManagerStatus.md)

Defined in: src/managers/BaseManager.ts:528

What this manager is doing (#1155).

Not `getStatus()`: that name is already taken by `AddonsManager` and
`BackgroundJobManager` for entirely different things, and a base-class
method silently overridden by two subclasses would be worse than a longer
name.

#### Returns

[`ManagerStatus`](../../BaseManager/interfaces/ManagerStatus.md)

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getManagerStatus`](../../BaseManager/classes/default.md#getmanagerstatus)

***

### getProfileSections()

> __getProfileSections__(`user`, `ctx`): `Promise`\<[`AddonProfileSectionEntry`](../interfaces/AddonProfileSectionEntry.md)[]\>

Defined in: src/managers/AddonsManager.ts:2100

Collect profile-page sections contributed by loaded addons (#534).

Iterates every loaded addon that implements `profileSection()`, fans
out IN PARALLEL via `Promise.allSettled`, then packages results for
`profile.ejs`. Errors and `null` returns are skipped (malformed shapes
are logged so addon authors get a diagnostic instead of an invisibly-
missing card). One failing addon must not break the profile page.

Mirrors the `getStatus()` pattern but runs in parallel so page-render
latency is bounded by the slowest addon, not the sum.

Result order follows registration order of the addons map so the
displayed section order is stable across renders.

#### Parameters

##### user

[`AddonProfileUser`](../type-aliases/AddonProfileUser.md)

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`AddonProfileSectionEntry`](../interfaces/AddonProfileSectionEntry.md)[]\>

***

### getRegisteredStylesheets()

> __getRegisteredStylesheets__(): `string`[]

Defined in: src/managers/AddonsManager.ts:2359

Return the ordered list of stylesheet URLs registered by all add-ons.
Called by the template layer to inject <link> tags into <head>.

#### Returns

`string`[]

***

### getStatus()

> __getStatus__(): `Promise`\<[`AddonStatus`](../interfaces/AddonStatus.md)[]\>

Defined in: src/managers/AddonsManager.ts:2040

Get status of all discovered add-ons

#### Returns

`Promise`\<[`AddonStatus`](../interfaces/AddonStatus.md)[]\>

***

### hasAddon()

> __hasAddon__(`addonName`): `boolean`

Defined in: src/managers/AddonsManager.ts:2564

Check if an add-on exists (discovered)

#### Parameters

##### addonName

`string`

#### Returns

`boolean`

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/AddonsManager.ts:564

Initialize the AddonsManager

Reads configuration, discovers add-ons, and loads enabled ones
in dependency order.

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`initialize`](../../BaseManager/classes/default.md#initialize)

***

### invalidateHandlerCache()

> `protected` __invalidateHandlerCache__(`pageUuid`): `void`

Defined in: src/managers/BaseManager.ts:463

A page's data changed outside savePage: its cached content goes, and every cached render re-renders (#1751).

#### Parameters

##### pageUuid

`string`

#### Returns

`void`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`invalidateHandlerCache`](../../BaseManager/classes/default.md#invalidatehandlercache)

***

### isEnabled()

> __isEnabled__(`addonName`): `boolean`

Defined in: src/managers/AddonsManager.ts:1220

Check if an add-on is enabled in configuration

#### Parameters

##### addonName

`string`

#### Returns

`boolean`

***

### isInitialized()

> __isInitialized__(): `boolean`

Defined in: src/managers/BaseManager.ts:446

Check if manager has been initialized

#### Returns

`boolean`

True if manager is initialized

#### Example

```ts
if (manager.isInitialized()) {
  // Safe to use manager
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`isInitialized`](../../BaseManager/classes/default.md#isinitialized)

***

### isLoaded()

> __isLoaded__(`addonName`): `boolean`

Defined in: src/managers/AddonsManager.ts:2571

Check if an add-on is loaded

#### Parameters

##### addonName

`string`

#### Returns

`boolean`

***

### isPerPerson()

> __isPerPerson__(`slug`): `boolean`

Defined in: src/managers/AddonsManager.ts:2249

Whether `slug` is an add-on whose manifest says `perPerson: true` (#1963),
loaded or still loading. ConsentManager asks it when an add-on registers
documents: they guard the per-person switch, so only such an add-on has any.

#### Parameters

##### slug

`string`

#### Returns

`boolean`

***

### listedAddons()

> __listedAddons__(): [`AddonListing`](../interfaces/AddonListing.md)[]

Defined in: src/managers/AddonsManager.ts:2220

The add-ons the site's listings show (#1965): enabled, and not
`listed: false` in their manifest, in load order. Cheap: it calls no
add-on's status(), so a page can render it.

#### Returns

[`AddonListing`](../interfaces/AddonListing.md)[]

***

### loadAddon()

> __loadAddon__(`addonName`): `Promise`\<`void`\>

Defined in: src/managers/AddonsManager.ts:1873

Load a single add-on

#### Parameters

##### addonName

`string`

#### Returns

`Promise`\<`void`\>

***

### markDegraded()

> `protected` __markDegraded__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:540

Record that this manager is configured, wanted, and not working.

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

true when this is a TRANSITION — a state or reason that differs
  from the current one. Only a transition is an event: a manager that
  starts degraded and stays degraded must not re-emit on every boot, or
  the signal is buried in its own noise.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markDegraded`](../../BaseManager/classes/default.md#markdegraded)

***

### markDisabled()

> `protected` __markDisabled__(`reason`): `boolean`

Defined in: src/managers/BaseManager.ts:555

Record that this manager is deliberately off. Not a problem (#1155).

#### Parameters

##### reason

`string`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markDisabled`](../../BaseManager/classes/default.md#markdisabled)

***

### markFailed()

> `protected` __markFailed__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:560

Record that this manager could not initialise at all (#1155).

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markFailed`](../../BaseManager/classes/default.md#markfailed)

***

### markNeedsAttention()

> `protected` __markNeedsAttention__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:550

Record that this manager works, but an administrator has something to do
(#1946). Still `degraded` — it stays on the dashboard, is audited, and
clears with `markReadyIfDegradedBy` — but shown as needing attention, not
as down.

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markNeedsAttention`](../../BaseManager/classes/default.md#markneedsattention)

***

### markReady()

> `protected` __markReady__(): `boolean`

Defined in: src/managers/BaseManager.ts:571

Record that this manager is working.

Clears the reason rather than leaving a stale one behind — a recovered
manager still carrying "the directory is not writable" is a worse lie than
no reason at all.

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markReady`](../../BaseManager/classes/default.md#markready)

***

### markReadyIfDegradedBy()

> `protected` __markReadyIfDegradedBy__(`reason`): `boolean`

Defined in: src/managers/BaseManager.ts:580

Record that this manager is working again, but only while it is still
degraded for `reason` — the one a check set, now cleared by re-running
it (#1842). A different fault set since stays reported.

#### Parameters

##### reason

`string`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markReadyIfDegradedBy`](../../BaseManager/classes/default.md#markreadyifdegradedby)

***

### perPersonAddons()

> __perPersonAddons__(): `string`[]

Defined in: src/managers/AddonsManager.ts:2257

# 1963: the loaded add-ons whose manifest says `perPerson: true`, in load
order — every slug an `addon:<slug>` page audience can match (#1964).

#### Returns

`string`[]

***

### preflightConfiguredPath()

> `protected` __preflightConfiguredPath__(`configKey`, `path`, `options?`): [`PathPreflightResult`](../../../utils/PathPreflight/interfaces/PathPreflightResult.md)

Defined in: src/managers/BaseManager.ts:495

Preflight a configured filesystem path before any mkdir/write happens.

Wraps `checkConfiguredPath()` with a standardized warning log that names
the manager (`this.constructor.name`) and the originating config key.
Useful for paths that may live on volumes the OS has unmounted (notably
macOS `/Volumes/<X>/...`), where `fs.ensureDir` would otherwise crash
the engine with an opaque `EACCES`.

The caller decides what to do on failure (degrade, fall back to a
default, or treat as fatal).

#### Parameters

##### configKey

`string`

The config key that supplied this path — included in
                  the warning so operators know what to fix.

##### path

`string` \| `null` \| `undefined`

The resolved path to check.

##### options?

[`PathPreflightOptions`](../../../utils/PathPreflight/interfaces/PathPreflightOptions.md) = `{}`

#### Returns

[`PathPreflightResult`](../../../utils/PathPreflight/interfaces/PathPreflightResult.md)

The preflight result. `result.ok === true` means safe
                  to proceed.

#### Example

```ts
const preflight = this.preflightConfiguredPath(
  'ngdpbase.backup.directory',
  this.backupDirectory
);
if (!preflight.ok) {
  // degrade — disable feature, fall back to default, etc.
  return;
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`preflightConfiguredPath`](../../BaseManager/classes/default.md#preflightconfiguredpath)

***

### registerDashboardCard()

> __registerDashboardCard__(`card`): `void`

Defined in: src/managers/AddonsManager.ts:2367

Register a dashboard card for this add-on. Called from the add-on's register() function.
Live stats shown on the card are sourced from the add-on's existing status() method.

#### Parameters

##### card

[`AddonDashboardCard`](../interfaces/AddonDashboardCard.md)

#### Returns

`void`

***

### registerStylesheet()

> __registerStylesheet__(`url`, `addonName?`): `void`

Defined in: src/managers/AddonsManager.ts:2346

Register a stylesheet URL to be injected into every page's <head>.

Call this from your add-on's register() function:

```js
const addonsManager = engine.getManager('AddonsManager');
addonsManager.registerStylesheet('/addons/my-addon/css/style.css');
```

The URL must be publicly accessible (served via Express static or a CDN).
Add-on CSS files under `addons/<name>/public/` are automatically served at
`/addons/<name>/public/` when the server starts.

#### Parameters

##### url

`string`

Public URL of the stylesheet (e.g. '/addons/my-addon/css/style.css')

##### addonName?

`string` = `'unknown'`

Optional: name of the registering add-on (for logging)

#### Returns

`void`

***

### resolveLoadOrder()

> __resolveLoadOrder__(): `string`[]

Defined in: src/managers/AddonsManager.ts:1813

Resolve dependency order using topological sort

#### Returns

`string`[]

Array of add-on names in load order

#### Throws

Error if circular dependency detected

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/managers/AddonsManager.ts:2636

Restore is not supported for AddonsManager
(add-ons are discovered at startup)

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

***

### restoreIsStaged()

> __restoreIsStaged__(): `boolean`

Defined in: src/managers/BaseManager.ts:707

Whether this manager's `restore()` stages for the next start instead of
writing into the running site (#1723, #1876). BackupManager stages every
such manager in a site restore together, all or nothing, after a backup
of the live data. The default: true when it declares folders or files
(#1985), which BackupManager stages; otherwise false, the restore writes
live.

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`restoreIsStaged`](../../BaseManager/classes/default.md#restoreisstaged)

***

### safeGetManagerStats()

> __safeGetManagerStats__(): `Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/BaseManager.ts:819

`getManagerStats()` that cannot break the page it is rendered on.

The contract says an override must not throw, and saying so does not make
it true — an override reads a store, and a store can fail. This is what an
admin surface iterating every manager should call: one manager throwing
becomes one unhealthy row rather than a 500 for all of them.

#### Returns

`Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`safeGetManagerStats`](../../BaseManager/classes/default.md#safegetmanagerstats)

***

### saveProfileSections()

> __saveProfileSections__(`ctx`, `body`): `Promise`\<\{ `consentRequired`: [`ConsentRequiredError`](../../../types/Consent/classes/ConsentRequiredError.md)[]; \}\>

Defined in: src/managers/AddonsManager.ts:2192

Fan out `POST /preferences` body to every loaded addon that registered a
`saveProfileSection()` handler (#534).

Runs SEQUENTIALLY — each addon's read-modify-write of user preferences
(`updateUser`'s function form, #2025) must see the
previous addon's writes. Parallel execution would create a same-snapshot
race where two addons read identical preferences, each merge their own
keys, and the second writer clobbers the first writer's changes.
Self-inflicted by the original #534 PR; reverted to sequential here.

(`getProfileSections()` above stays parallel — it's a read path with no
cross-addon write contention.)

Body shape: the host normalizes whatever shape qs produced into FLAT
dotted keys before fan-out, so addons always see `body['journal.X']`
regardless of whether body-parser was configured with `allowDots: true`
(which would have produced `body.journal.X` instead). This is a
defensive contract — today's `express.urlencoded({ extended: true })`
leaves dotted form-field names flat by default, but a future config
change shouldn't silently break addons. See `flattenDottedKeys`.

Errors are caught per-addon and logged so one bad addon cannot block
other addons' saves or the core-preferences save.

# 1603: an add-on whose switch was refused because its documents are not
accepted yet (`ConsentRequiredError`) is returned, so the route can tell
the person what to accept instead of the save failing silently.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### body

`Record`\<`string`, `unknown`\>

#### Returns

`Promise`\<\{ `consentRequired`: [`ConsentRequiredError`](../../../types/Consent/classes/ConsentRequiredError.md)[]; \}\>

***

### seedAddonTheme()

> __seedAddonTheme__(`addonName`, `addonPath`, `overwrite?`): `Promise`\<\{ `deployed`: `boolean`; `message`: `string`; `ok`: `boolean`; \}\>

Defined in: src/managers/AddonsManager.ts:1728

# 443: Deploy an add-on's `theme/` into the instance `themes/<name>/`.

When an add-on ships a `theme/` subdirectory it should land in the
instance themes directory the same way `seedAddonPages()` handles
`pages/`. ThemeManager then reads it via `ngdpbase.theme.active` (set by
the addon's domainDefaults) — no ThemeManager change needed.

#### Parameters

##### addonName

`string`

Add-on name (also the destination theme folder)

##### addonPath

`string`

Filesystem path to the add-on directory

##### overwrite?

`boolean` = `false`

false (default) = first-boot copy, never overwrites an
                   existing `themes/<name>/` (preserves instance edits);
                   true = dashboard-triggered redeploy, replaces it.

#### Returns

`Promise`\<\{ `deployed`: `boolean`; `message`: `string`; `ok`: `boolean`; \}\>

Result describing what happened (for the admin UI).

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/AddonsManager.ts:2584

Graceful shutdown of all loaded add-ons

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`shutdown`](../../BaseManager/classes/default.md#shutdown)

***

### stagedRestoreAtStart()

> `protected` __stagedRestoreAtStart__(): [`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/managers/BaseManager.ts:398

What this start did with a staged restore of this manager's declared parts (#1985): null when there was none.

#### Returns

[`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`stagedRestoreAtStart`](../../BaseManager/classes/default.md#stagedrestoreatstart)

***

### storeDisableWarnings()

> __storeDisableWarnings__(`addonName`): `Promise`\<`string`[]\>

Defined in: src/managers/AddonsManager.ts:1976

What turning this addon off would shut (#1414): one line per store kind it
owns that users hold data in. Turning it off is warned, never refused —
nothing is destroyed, the kind stays in configuration, every copy stays on
disk (sealed ones keep their wrapped key), and turning it back on reopens
them. Separate from `canDisable`, which stays synchronous: counting copies
reads the disk.

#### Parameters

##### addonName

`string`

#### Returns

`Promise`\<`string`[]\>

***

### storeOwnerState()

> __storeOwnerState__(`addonName`): [`StoreOwnerState`](../../../utils/privateStoreDoor/type-aliases/StoreOwnerState.md)

Defined in: src/managers/AddonsManager.ts:2003

Where the addon that owns a store kind stands, for the store door (#1414):
loaded, enabled but failed to load, turned off, or not on this site.

#### Parameters

##### addonName

`string`

#### Returns

[`StoreOwnerState`](../../../utils/privateStoreDoor/type-aliases/StoreOwnerState.md)

***

### toFormOptions()

> __toFormOptions__(`_options?`, `_viewer?`): `Promise`\<[`FormOption`](../../../utils/pluginFormatters/interfaces/FormOption.md)[]\>

Defined in: src/managers/BaseManager.ts:758

Return the choices for a form dropdown, for the forms add-on's
`"optionsSource": "fetch:ManagerName.toFormOptions(list=funds)"`.

The same convention and the same safety rules as `toMarqueeText()`: it is
the one other method page content may reach (`resolveManagerOptions`), it
runs on every render for every viewer, and it must have no side effect.
Offer only what `_viewer` may see. The forms add-on calls it again when the
form is submitted and refuses a value that is not among the choices.

#### Parameters

##### \_options?

`Record`\<`string`, `string`\> = `{}`

Parsed args from the spec, as raw `{ key: value }` strings.

##### \_viewer?

`unknown`

The viewer's context.

#### Returns

`Promise`\<[`FormOption`](../../../utils/pluginFormatters/interfaces/FormOption.md)[]\>

`{ value, label }` choices (plain strings are accepted too), or `[]`.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`toFormOptions`](../../BaseManager/classes/default.md#toformoptions)

***

### toMarqueeText()

> __toMarqueeText__(`_options?`, `_viewer?`): `Promise`\<`string`\>

Defined in: src/managers/BaseManager.ts:740

Return a plain-text string suitable for use as MarqueePlugin banner text.

Override in subclasses to expose live manager data as a scrolling banner:

  [{MarqueePlugin fetch='PageManager.toMarqueeText()'}]
  [{MarqueePlugin fetch='PageManager.toMarqueeText(limit=5,sort=date-desc)'}]

The default returns '' (no output). Subclasses should return a concise,
single-line summary. Common options (limit, sortBy, sortOrder, since, before)
are available via ManagerFetchOptions; domain-specific keys are read directly
from the raw options object passed by the caller.

#### Parameters

##### \_options?

[`ManagerFetchOptions`](../../../utils/managerUtils/interfaces/ManagerFetchOptions.md) = `{}`

Parsed fetch args from the plugin invocation.

##### \_viewer?

`unknown`

The viewer's context (#1556): show only what they may see.
                 Page text reaches this method, and only this method, on
                 every render for every viewer.

#### Returns

`Promise`\<`string`\>

Plain text, or '' if this manager has nothing to display.

#### Example

```ts
async toMarqueeText(options: ManagerFetchOptions = {}): Promise<string> {
  const pages = await this.getRecentChanges(options.limit ?? 5);
  return 'Recent: ' + pages.map(p => p.name).join('  •  ');
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`toMarqueeText`](../../BaseManager/classes/default.md#tomarqueetext)

***

### updateInstalledAddon()

> __updateInstalledAddon__(`ctx`, `slug`, `version`): `Promise`\<[`UpdateOutcome`](../../../utils/addonInstaller/interfaces/UpdateOutcome.md)\>

Defined in: src/managers/AddonsManager.ts:874

# 2100: an administrator's Update. Downloads `version` of the installed
add-on `slug`, checks it exactly as a first install is checked (sha512,
provenance, contents, `ngdpbase.minVersion`) and stages it: it runs from
the next start. Asks the PDP for `config-manage`. Recorded as
`addon-update` (who, the add-on, from and to) before anything is written;
a record that cannot be written stops the Update.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### slug

`string`

##### version

`string`

#### Returns

`Promise`\<[`UpdateOutcome`](../../../utils/addonInstaller/interfaces/UpdateOutcome.md)\>
