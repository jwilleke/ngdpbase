[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ValidationManager](../README.md) / default

# Class: default

Defined in: src/managers/ValidationManager.ts:230

ValidationManager - Ensures all files follow UUID naming and metadata conventions

Validates page metadata and enforces architectural constraints including UUID-based
naming, required metadata fields, valid system categories, and keyword limits.

 ValidationManager

## See

[BaseManager](../../BaseManager/classes/default.md) for base functionality

## Example

```ts
const validationManager = engine.getManager('ValidationManager');
const result = validationManager.validatePage(metadata);
if (!result.valid) console.error(result.errors);
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `ValidationManager`

Defined in: src/managers/ValidationManager.ts:246

Creates a new ValidationManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`ValidationManager`

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

### backup()

> __backup__(`_options?`): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/BaseManager.ts:663

Backup manager data

MUST be overridden by all managers that manage persistent data.
Default implementation returns an empty backup object.

#### Parameters

##### \_options?

[`ManagerBackupOptions`](../../BaseManager/interfaces/ManagerBackupOptions.md)

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Backup data object containing all manager state

#### Throws

If backup operation fails

#### Example

```ts
async backup(): Promise<BackupData> {
  return {
    managerName: this.constructor.name,
    timestamp: new Date().toISOString(),
    data: {
      users: Array.from(this.users.values()),
      settings: this.settings
    }
  };
}
```

#### Inherited from

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

### canBePrivate()

> __canBePrivate__(`category`): `boolean`

Defined in: src/managers/ValidationManager.ts:602

Whether pages of this system-category can be private: it declares a vault (`storageLocation.privatestore`, #1504).

#### Parameters

##### category

`string`

#### Returns

`boolean`

***

### checkConflicts()

> __checkConflicts__(`uuid`, `title`, `slug`, `ctx`): `Promise`\<[`ConflictCheckResult`](../interfaces/ConflictCheckResult.md)\>

Defined in: src/managers/ValidationManager.ts:1114

Check for conflicts with existing pages (duplicate title, slug, or UUID mismatch).

Used when saving a page and when comparing shipped pages (required pages,
add-on pages) against live pages. Checks slug first (most precise), then
title. A name clashes only when another page holds exactly that title or
slug (`PageManager.uuidHoldingName`), never by the plural or fuzzy
matching a link uses (#2140).

#### Parameters

##### uuid

`string`

The UUID of the page being checked

##### title

`string`

The page title

##### slug

`string`

The page slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`ConflictCheckResult`](../interfaces/ConflictCheckResult.md)\>

Conflict result

#### Async

***

### collectContentErrors()

> __collectContentErrors__(`content`, `context?`): `Promise`\<`object`[]\>

Defined in: src/managers/ValidationManager.ts:971

Collect blocking validation errors for save-time enforcement (#596).

Delegates to FilterManager's chain (#1117 — the one owner of the filter
capability), which runs each enabled filter's own collectErrors()
method. Only `severity: 'error'` rule violations are returned —
warnings are surfaced through the render-time annotation path inside
MarkupParser, not here.

Public surface for the save path: WikiRoutes.savePage calls this and
returns 400 with the structured error array if non-empty. Frontend uses
each error's `rule`, `message`, and optional `line`/`column` to surface
the problem to the editor.

Returns an empty array when:

- content is empty or not a string
- FilterManager is not available (shouldn't happen at runtime)
- the pipeline is disabled in config, or no filter implements collectErrors

#### Parameters

##### content

`string`

The page content to validate

##### context?

Optional context (pageName, userName) passed through to filters

###### pageName?

`string`

###### userName?

`string`

#### Returns

`Promise`\<`object`[]\>

Array of blocking validation errors; empty array when content passes

***

### generateFilename()

> __generateFilename__(`metadata`): `string`

Defined in: src/managers/ValidationManager.ts:1148

Generate UUID-based filename from metadata

#### Parameters

##### metadata

[`PageMetadata`](../interfaces/PageMetadata.md)

Page metadata containing UUID

#### Returns

`string`

Filename in UUID.md format

***

### generateFixSuggestions()

> __generateFixSuggestions__(`filename`, `metadata`): [`FixSuggestions`](../interfaces/FixSuggestions.md)

Defined in: src/managers/ValidationManager.ts:1179

Generate suggestions to fix validation issues

#### Parameters

##### filename

`string`

Current filename

##### metadata

`Record`\<`string`, `unknown`\>

Current metadata

#### Returns

[`FixSuggestions`](../interfaces/FixSuggestions.md)

Fix suggestions

***

### generatePrivateSlug()

> __generatePrivateSlug__(`owner`, `store`, `title`): `string`

Defined in: src/managers/ValidationManager.ts:1066

The slug of a private page (#1456, operator 2026-09-22):
`vaults--{owner}-{store}-{title}` (`private--` until #1507). The prefix is reserved —
[generateSlug](#generateslug) collapses dash runs, so no public slug can contain
`--`, and a public save never has to consult private slugs. A clash among
one owner's stores is resolved by the caller, in that owner's stores only.

#### Parameters

##### owner

`string`

##### store

`string`

##### title

`string`

#### Returns

`string`

***

### generateSlug()

> __generateSlug__(`title`): `string`

Defined in: src/managers/ValidationManager.ts:1049

Generate URL-safe slug from title.
Unicode characters are transliterated to ASCII equivalents before stripping
so that titles like "Aβ" produce "abeta" rather than "a" (#295).

#### Parameters

##### title

`string`

Page title

#### Returns

`string`

URL-safe slug

***

### generateValidMetadata()

> __generateValidMetadata__(`title`, `options?`): [`PageMetadata`](../interfaces/PageMetadata.md)

Defined in: src/managers/ValidationManager.ts:1009

Generate properly formatted metadata for a new page

#### Parameters

##### title

`string`

Page title

##### options?

[`GenerateMetadataOptions`](../interfaces/GenerateMetadataOptions.md) = `{}`

Additional metadata options

#### Returns

[`PageMetadata`](../interfaces/PageMetadata.md)

Complete metadata object with all required fields

***

### getAllSystemCategories()

> __getAllSystemCategories__(): [`CategoryConfig`](../interfaces/CategoryConfig.md)[]

Defined in: src/managers/ValidationManager.ts:615

Get all enabled system categories

#### Returns

[`CategoryConfig`](../interfaces/CategoryConfig.md)[]

Array of category configurations

***

### getCategoryConfig()

> __getCategoryConfig__(`label`): [`CategoryConfig`](../interfaces/CategoryConfig.md) \| `null`

Defined in: src/managers/ValidationManager.ts:528

Get system category configuration by label

#### Parameters

##### label

`string`

Category label (e.g., "General", "System")

#### Returns

[`CategoryConfig`](../interfaces/CategoryConfig.md) \| `null`

Category configuration or null if not found

***

### getCategoryStored()

> __getCategoryStored__(`category`): [`CategoryStored`](../type-aliases/CategoryStored.md) \| `null`

Defined in: src/managers/ValidationManager.ts:549

Where a system-category's pages are stored on the site (#1503): see
[categoryStored](../functions/categoryStored.md). Null for a system-category the site does not
know; no rule refuses a page for that.

#### Parameters

##### category

`string`

Category label

#### Returns

[`CategoryStored`](../type-aliases/CategoryStored.md) \| `null`

***

### getDefaultPrivate()

> __getDefaultPrivate__(`category`, `preferences?`): `boolean`

Defined in: src/managers/ValidationManager.ts:565

How a new page's Private box starts for this system-category and this
person (#1504): the entry's `defaultPrivate` — `true`, `false`, or
`choice`, where the person's `<system-category>.defaultPrivate`
preference decides and someone who has not chosen starts private. No
`defaultPrivate`, or an unknown system-category, starts public. It only
sets the start: the box on the page always wins.

#### Parameters

##### category

`string`

the system-category's label

##### preferences?

`Record`\<`string`, `unknown`\>

the person's saved preferences

#### Returns

`boolean`

***

### getDefaultStatus()

> __getDefaultStatus__(): `string`

Defined in: src/managers/ValidationManager.ts:499

# 893: the status an ABSENT frontmatter field means (catalog default:true
entry). This value is never written to frontmatter.

#### Returns

`string`

***

### getDefaultSystemCategory()

> __getDefaultSystemCategory__(): `string`

Defined in: src/managers/ValidationManager.ts:635

Get the default system category

#### Returns

`string`

Default category label

***

### getDefaultSystemKeywords()

> __getDefaultSystemKeywords__(): `string`[]

Defined in: src/managers/ValidationManager.ts:514

Get system keyword labels marked default:true in ngdpbase.system-keywords config.
These are applied automatically to every new page in generateValidMetadata().

#### Returns

`string`[]

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

### getShareMaxDays()

> __getShareMaxDays__(`vaultId`): `number`

Defined in: src/managers/ValidationManager.ts:591

The longest a new share link to this vault may last, in days (#1388): the
`shareMaxDays` of the system-category whose `privatestore` names the vault,
set by that entry's `owner`. [DEFAULT\_SHARE\_MAX\_DAYS](../variables/DEFAULT_SHARE_MAX_DAYS.md) when the entry
sets none or no entry names the vault. It limits a link only when it is
made; the owner may extend a live link past it.

#### Parameters

##### vaultId

`string`

#### Returns

`number`

***

### getValidKnowledgeRoles()

> __getValidKnowledgeRoles__(): `string`[]

Defined in: src/managers/ValidationManager.ts:506

Get all valid knowledge-role labels (#706).

#### Returns

`string`[]

***

### getValidStatuses()

> __getValidStatuses__(): `string`[]

Defined in: src/managers/ValidationManager.ts:491

# 893: valid status labels, ordered ascending by catalog `order`
(lowest → highest lifecycle rank). Copy — callers can't mutate state.

#### Returns

`string`[]

***

### getValidSystemKeywords()

> __getValidSystemKeywords__(): `string`[]

Defined in: src/managers/ValidationManager.ts:415

Get all valid system keyword strings.

#### Returns

`string`[]

***

### getVaultId()

> __getVaultId__(`category`): `string` \| `null`

Defined in: src/managers/ValidationManager.ts:579

The vault a private page of this system-category goes to (#1505): the
vault id its `storageLocation.privatestore` names, or null when it has no
vault (its pages can never be private).

#### Parameters

##### category

`string`

#### Returns

`string` \| `null`

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/ValidationManager.ts:270

Initialize the ValidationManager

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object

#### Returns

`Promise`\<`void`\>

#### Async

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

### isValidSlug()

> __isValidSlug__(`slug`): `boolean`

Defined in: src/managers/ValidationManager.ts:862

Validate slug format (URL-safe)

#### Parameters

##### slug

`string`

The slug to validate

#### Returns

`boolean`

True if valid

***

### loadKnowledgeRoles()

> __loadKnowledgeRoles__(`configManager`): `void`

Defined in: src/managers/ValidationManager.ts:425

Load knowledge-role catalog (#706) from ConfigurationManager.
Mirrors loadSystemCategories(). The constructor seeds a hardcoded
fallback (`['source','citation','concept']`) so the hard-reject enum
check still works if the catalog can't be read.

#### Parameters

##### configManager

[`default`](../../ConfigurationManager/classes/default.md) \| `undefined`

#### Returns

`void`

***

### loadStatuses()

> __loadStatuses__(`configManager`): `void`

Defined in: src/managers/ValidationManager.ts:459

# 893: load the editorial lifecycle catalog from `ngdpbase.status` config.
Entries carry label / description / order (ascending rank) / enabled and
one default:true entry (the state an absent status field means). Falls
back to the hardcoded trio only when config is unavailable.

#### Parameters

##### configManager

[`default`](../../ConfigurationManager/classes/default.md) \| `undefined`

#### Returns

`void`

***

### loadSystemCategories()

> __loadSystemCategories__(`configManager`): `void`

Defined in: src/managers/ValidationManager.ts:329

Load system categories from ConfigurationManager

#### Parameters

##### configManager

[`default`](../../ConfigurationManager/classes/default.md) \| `undefined`

Configuration manager instance

#### Returns

`void`

***

### loadSystemKeywords()

> __loadSystemKeywords__(`configManager`): `void`

Defined in: src/managers/ValidationManager.ts:386

Load system keywords from ConfigurationManager.
Mirrors loadSystemCategories() — populates this.validSystemKeywords.

#### Parameters

##### configManager

[`default`](../../ConfigurationManager/classes/default.md) \| `undefined`

#### Returns

`void`

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

### offersDefaultPrivatePreference()

> __offersDefaultPrivatePreference__(`category`): `boolean`

Defined in: src/managers/ValidationManager.ts:607

Whether this system-category lets each person choose (`defaultPrivate: 'choice'`), so a preference is shown (#1504).

#### Parameters

##### category

`string`

#### Returns

`boolean`

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

### restore()

> __restore__(`backupData`, `_options?`): `Promise`\<`void`\>

Defined in: src/managers/BaseManager.ts:691

Restore manager data from backup

MUST be overridden by all managers that manage persistent data.
Default implementation only validates that backup data is provided.

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

Backup data object from backup() method

##### \_options?

[`ManagerRestoreOptions`](../../BaseManager/interfaces/ManagerRestoreOptions.md)

#### Returns

`Promise`\<`void`\>

#### Throws

If restore operation fails or backup data is missing

#### Example

```ts
async restore(backupData: BackupData): Promise<void> {
  if (!backupData || !backupData.data) {
    throw new Error('Invalid backup data');
  }
  this.users = new Map(backupData.data.users.map(u => [u.id, u]));
  this.settings = backupData.data.settings;
}
```

#### Inherited from

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

### sanitizeMetadata()

> __sanitizeMetadata__(`metadata`): `Record`\<`string`, `unknown`\>

Defined in: src/managers/ValidationManager.ts:669

Sanitize all string metadata fields before saving.

- URL-decodes values so that `%09Illinois` becomes `\tIllinois` before trimming
- Trims all leading/trailing Unicode whitespace (spaces, tabs, newlines, NBSP, etc.)
- For `user-keywords`: trims each element and removes any that become empty

Should be called once at the top of every save path so callers never need
to remember to sanitize individually.

#### Parameters

##### metadata

`Record`\<`string`, `unknown`\>

Raw metadata from request or front-matter

#### Returns

`Record`\<`string`, `unknown`\>

New object with sanitized values (original unchanged)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/BaseManager.ts:638

Shutdown the manager and cleanup resources

Override this method in subclasses to perform cleanup logic.
Always call super.shutdown() at the end of overridden implementations.

#### Returns

`Promise`\<`void`\>

#### Example

```ts
async shutdown(): Promise<void> {
  // Your cleanup logic here
  await this.closeConnections();
  await super.shutdown();
}
```

#### Inherited from

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

### validateContent()

> __validateContent__(`content`): [`ContentValidationResult`](../interfaces/ContentValidationResult.md)

Defined in: src/managers/ValidationManager.ts:927

Validate page content (optional checks)

#### Parameters

##### content

`string`

The page content

#### Returns

[`ContentValidationResult`](../interfaces/ContentValidationResult.md)

Content validation result

***

### validateExistingFile()

> __validateExistingFile__(`filePath`, `fileData`): [`PageValidationResult`](../interfaces/PageValidationResult.md)

Defined in: src/managers/ValidationManager.ts:1161

Validate and fix an existing page file

#### Parameters

##### filePath

`string`

Path to the existing file

##### fileData

[`FileData`](../interfaces/FileData.md)

Object with content and metadata from gray-matter

#### Returns

[`PageValidationResult`](../interfaces/PageValidationResult.md)

Validation result with fix suggestions

***

### validateFilename()

> __validateFilename__(`filename`): [`ValidationResult`](../interfaces/ValidationResult.md)

Defined in: src/managers/ValidationManager.ts:705

Validate that a filename follows UUID naming convention

#### Parameters

##### filename

`string`

The filename to validate

#### Returns

[`ValidationResult`](../interfaces/ValidationResult.md)

Validation result with success and error properties

***

### validateMetadata()

> __validateMetadata__(`metadata`): [`MetadataValidationResult`](../interfaces/MetadataValidationResult.md)

Defined in: src/managers/ValidationManager.ts:733

Validate page metadata contains all required fields with proper values

#### Parameters

##### metadata

`Record`\<`string`, `unknown`\>

The metadata object to validate

#### Returns

[`MetadataValidationResult`](../interfaces/MetadataValidationResult.md)

Validation result with success, error, and warnings properties

***

### validatePage()

> __validatePage__(`filename`, `metadata`, `content?`): [`PageValidationResult`](../interfaces/PageValidationResult.md)

Defined in: src/managers/ValidationManager.ts:874

Validate a complete page before saving

#### Parameters

##### filename

`string`

The target filename

##### metadata

`Record`\<`string`, `unknown`\>

The page metadata

##### content?

`string` \| `null` = `null`

The page content (optional validation)

#### Returns

[`PageValidationResult`](../interfaces/PageValidationResult.md)

Comprehensive validation result
