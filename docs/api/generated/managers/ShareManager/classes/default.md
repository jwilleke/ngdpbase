[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ShareManager](../README.md) / default

# Class: default

Defined in: src/managers/ShareManager.ts:83

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `ShareManager`

Defined in: src/managers/ShareManager.ts:95

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`ShareManager`

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

### extend()

> __extend__(`id`, `hours`, `by`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/ShareManager.ts:326

Extend a live link by up to [SHARE\_EXTEND\_MAX\_HOURS](../variables/SHARE_EXTEND_MAX_HOURS.md) hours (#1388).
Only its issuer may, as often as they like, and past the lifetime maximum:
that limits a link only when it is made. An expired, revoked or
never-expiring link is not extended.

#### Parameters

##### id

`string`

##### hours

`number`

##### by

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

#### Returns

`Promise`\<`string` \| `null`\>

The new expiry, or null when there was nothing to extend

***

### get()

> __get__(`id`): [`ShareRecord`](../../../types/Share/interfaces/ShareRecord.md) \| `null`

Defined in: src/managers/ShareManager.ts:511

Look up a share record by management id (management UI detail view).

#### Parameters

##### id

`string`

#### Returns

[`ShareRecord`](../../../types/Share/interfaces/ShareRecord.md) \| `null`

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

### getLockbox()

> __getLockbox__(`token`, `kind`, `key?`): [`Lockbox`](../../../utils/shareLockbox/interfaces/Lockbox.md) \| `null`

Defined in: src/managers/ShareManager.ts:727

A lockbox of a live link, for the recipient's browser to open — or null,
the same for an unknown link, one that is not locked, and a missing item.

#### Parameters

##### token

`string`

##### kind

`"files"` \| `"pages"` \| `"manifest"`

##### key?

`string`

#### Returns

[`Lockbox`](../../../utils/shareLockbox/interfaces/Lockbox.md) \| `null`

***

### getManagerStats()

> __getManagerStats__(): `Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/ShareManager.ts:490

# 1006: active links, and how many of the total that is.

Counts only. This manager holds capability tokens — a share link IS the
credential — so the count is the most that may ever appear here.

#### Returns

`Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

#### Overrides

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

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/managers/ShareManager.ts:99

Initialize the manager with configuration

Override this method in subclasses to perform initialization logic.
Always call super.initialize() first in overridden implementations.

#### Returns

`Promise`\<`void`\>

#### Example

```ts
async initialize(config: Record<string, any> = {}): Promise<void> {
  await super.initialize(config);
  // Your initialization logic here
  console.log('MyManager initialized');
}
```

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

> __isEnabled__(): `boolean`

Defined in: src/managers/ShareManager.ts:128

#### Returns

`boolean`

***

### isEncryptedVault()

> __isEncryptedVault__(`owner`, `vault`): `Promise`\<`boolean`\>

Defined in: src/managers/ShareManager.ts:299

Whether `owner`'s vault is encrypted: read from its `store.json`, the one
file of a vault that is never sealed — or its kind is sealed (#1834), so a
link into a sealed kind's vault is never issued as if it were plain.

#### Parameters

##### owner

`string`

##### vault

`string`

#### Returns

`Promise`\<`boolean`\>

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

### isLockedLink()

> __isLockedLink__(`token`): `boolean`

Defined in: src/managers/ShareManager.ts:740

True when a link is locked for a key, and so is opened in the recipient's browser (#1388).

#### Parameters

##### token

`string`

#### Returns

`boolean`

***

### issue()

> __issue__(`scope`, `ttl`, `issuer`, `options?`): `Promise`\<[`ShareRecord`](../../../types/Share/interfaces/ShareRecord.md)\>

Defined in: src/managers/ShareManager.ts:221

Issue a new share: a delegation by `issuer` of `actions` over `resources`
(#1221, epic #1225).

The route asks policy for `share-create` before calling this (#1224, #1638).
Here the delegation rule is enforced: __nobody delegates what they do not
hold.__ Every action the share would carry is checked against the
issuer's live authority through the PDP (`PolicyDecisionPoint.permits`), with the
issuer's own context (P1) so a token-bound issuer is bounded by the token
ceiling too. A share asking for an action the issuer lacks is refused
outright rather than trimmed silently — trimming would issue a credential
the issuer did not describe.

#### Parameters

##### scope

[`ShareScope`](../../../types/Share/type-aliases/ShareScope.md)

##### ttl

[`ShareTtl`](../../../types/Share/type-aliases/ShareTtl.md)

##### issuer

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### options?

###### actions?

readonly `string`[]

###### resources?

readonly [`ShareResource`](../../../types/Share/interfaces/ShareResource.md)[]

#### Returns

`Promise`\<[`ShareRecord`](../../../types/Share/interfaces/ShareRecord.md)\>

***

### issueVaultShare()

> __issueVaultShare__(`scope`, `lifetimeHours`, `issuer`, `options?`): `Promise`\<[`ShareRecord`](../../../types/Share/interfaces/ShareRecord.md)\>

Defined in: src/managers/ShareManager.ts:255

Issue a link to a vault's content (#1388): chosen pages, or the whole vault.

Only the vault's owner issues one — no role, admin included, shares
someone else's vault. The lifetime is the owner's choice, up to the
`shareMaxDays` of the vault's system-category; there is no link that never
expires. Read-only, like every share.

#### Parameters

##### scope

[`VaultShareScope`](../../../types/Share/interfaces/VaultShareScope.md)

The vault, and its page uuids or null for the whole vault

##### lifetimeHours

`number`

How long the link lasts, in hours

##### issuer

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

The owner, as the request's own subject

##### options?

`label`: the owner's note for the link, never logged or
  audited. `lockedFor`: for an encrypted vault, the public half of the
  link's key pair, made in the owner's browser — required there, refused
  anywhere else.

###### label?

`string`

###### lockedFor?

[`LinkPublicKey`](../../../utils/shareLockbox/interfaces/LinkPublicKey.md)

#### Returns

`Promise`\<[`ShareRecord`](../../../types/Share/interfaces/ShareRecord.md)\>

***

### linkBaseUrl()

> __linkBaseUrl__(`requestOrigin`): `string`

Defined in: src/managers/ShareManager.ts:146

The origin every share link is minted and shown with, no trailing slash.

`ngdpbase.share.public-base-url` when it is set and valid: an instance
whose own address is private (a LAN name) can hand out links that open
from outside, through a tunnel or proxy that carries only `/share/…`.
Otherwise the configured `ngdpbase.application.base-url`, else the
request's own origin. Read on every call, so a change made on the admin
screen applies to the next link shown.

#### Parameters

##### requestOrigin

`string`

#### Returns

`string`

***

### list()

> __list__(`owner?`): [`ShareRecord`](../../../types/Share/interfaces/ShareRecord.md)[]

Defined in: src/managers/ShareManager.ts:503

#### Parameters

##### owner?

`string`

#### Returns

[`ShareRecord`](../../../types/Share/interfaces/ShareRecord.md)[]

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

### maxShareDays()

> __maxShareDays__(`vault`): `number`

Defined in: src/managers/ShareManager.ts:314

The longest a new link to `vault` may last, in days (#1388).

#### Parameters

##### vault

`string`

#### Returns

`number`

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

### prepareLockboxes()

> __prepareLockboxes__(`record`, `ownerCtx`): `Promise`\<`number`\>

Defined in: src/managers/ShareManager.ts:682

Prepare and lock everything a link to an encrypted vault covers. `ownerCtx` must hold the vault's key.

#### Parameters

##### record

[`ShareRecord`](../../../types/Share/interfaces/ShareRecord.md)

##### ownerCtx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`number`\>

***

### publicOriginTlsWarning()

> __publicOriginTlsWarning__(`nativeTls`): `string` \| `null`

Defined in: src/managers/ShareManager.ts:161

The one startup warning for a public origin on an instance that terminates
TLS itself (#2117), or null. A plain-http connection to such an instance
gets the #1163 redirect to `ngdpbase.application.base-url`, so a tunnel or
proxy in front that connects over http sends every link's visitor to the
site's own (possibly private) address. Whether a proxy exists, and how it
connects, cannot be seen from here; the warning says what it must do.

#### Parameters

##### nativeTls

`boolean`

#### Returns

`string` \| `null`

***

### recordAccess()

> __recordAccess__(`token`): `void`

Defined in: src/managers/ShareManager.ts:521

Record one anonymous access hit against the share behind `token`
(decision 5: hits are logged as aggregated counts, not per-view rows).
Counts flush to the log + audit trail lazily once the window elapses,
and on shutdown. No-op for unknown tokens.

#### Parameters

##### token

`string`

#### Returns

`void`

***

### recordVaultVisit()

> __recordVaultVisit__(`token`, `what`, `ipAddress?`): `Promise`\<`void`\>

Defined in: src/managers/ShareManager.ts:575

Record one visit through a vault link (#1388): every page or file opened
is its own `share-access` record, naming it by uuid or file id, never by
title. Keyword links keep their batched counts.

#### Parameters

##### token

`string`

##### what

###### file?

`string`

###### list?

`true`

###### page?

`string`

##### ipAddress?

`string`

#### Returns

`Promise`\<`void`\>

***

### refreshLockboxesForPage()

> __refreshLockboxesForPage__(`ownerCtx`, `change`): `Promise`\<`void`\>

Defined in: src/managers/ShareManager.ts:699

A page of `owner`'s vault changed (#1388): refresh it in every live link
to that vault that covers it — or take it out, when it was deleted or
moved away. Called by PageManager with the saving owner's context, which
holds the vault key. Best-effort: one link's failure never stops a save.

#### Parameters

##### ownerCtx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### change

###### name

`string` \| `null`

###### previousName?

`string` \| `null`

###### uuid?

`string`

#### Returns

`Promise`\<`void`\>

***

### resolveScope()

> __resolveScope__(`scope`, `ctx`): `Promise`\<[`ResolvedShareScope`](../interfaces/ResolvedShareScope.md)\>

Defined in: src/managers/ShareManager.ts:545

Resolve a validated scope to its current content set, applying the
safe-by-construction exclusions (decisions 1 and 3).

#### Parameters

##### scope

[`ShareScope`](../../../types/Share/type-aliases/ShareScope.md)

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`ResolvedShareScope`](../interfaces/ResolvedShareScope.md)\>

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

### revoke()

> __revoke__(`id`, `revokedBy`): `Promise`\<`boolean`\>

Defined in: src/managers/ShareManager.ts:459

Revoke a share by management id. Immediate; the record is retained
(revokedAt set) for audit. Returns false for unknown or already-revoked.

#### Parameters

##### id

`string`

##### revokedBy

`string`

#### Returns

`Promise`\<`boolean`\>

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

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/ShareManager.ts:922

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

### subjectFor()

> __subjectFor__(`token`): [`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md) \| `null`

Defined in: src/managers/ShareManager.ts:429

Resolve a token into the subject the ordinary evaluator understands
(#1222, epic #1225): nobody, carrying what the issuer delegated.

The routes hand this subject to the same doors as any request; there is
no second evaluator. `hasPermission` and `PolicyInformationPoint` read `viaShare` as
a ceiling and re-check the issuer live. Null for an unknown, revoked or
expired token — the same three the routes must not tell apart.

The grant is a copy of the record's arrays, so nothing downstream can
widen the share by mutating what it was handed.

#### Parameters

##### token

`string`

#### Returns

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md) \| `null`

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

### validate()

> __validate__(`token`): [`ShareScope`](../../../types/Share/type-aliases/ShareScope.md) \| `null`

Defined in: src/managers/ShareManager.ts:413

Validate a token. Returns the scope for a live share, or null.

Unknown, expired, and revoked tokens are indistinguishable to the
caller — routes render an identical 404 for all three so share
existence never leaks.

#### Parameters

##### token

`string`

#### Returns

[`ShareScope`](../../../types/Share/type-aliases/ShareScope.md) \| `null`
