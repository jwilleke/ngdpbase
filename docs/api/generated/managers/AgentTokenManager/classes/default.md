[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AgentTokenManager](../README.md) / default

# Class: default

Defined in: src/managers/AgentTokenManager.ts:248

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `AgentTokenManager`

Defined in: src/managers/AgentTokenManager.ts:282

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`AgentTokenManager`

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

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/AgentTokenManager.ts:857

Backup manager data

MUST be overridden by all managers that manage persistent data.
Default implementation returns an empty backup object.

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

### extend()

> __extend__(`id`, `subject`, `hours?`, `now?`): `Promise`\<[`AgentTokenPublic`](../type-aliases/AgentTokenPublic.md) \| `null`\>

Defined in: src/managers/AgentTokenManager.ts:719

Extend one of the caller's own live tokens (#1734): move its expiry later
by `hours` (the maximum when omitted), never beyond now + `max-ttl-hours`.
The token string and its scopes do not change, so the agent holding it
keeps working without a new hand-over.

- Only the token's owner extends it. An admin does not extend someone
  else's token: like minting, a token's lifetime traces to the person who
  chose to delegate. Returns null for a token that is not the caller's, so
  the route answers it as one that does not exist.
- The owner must hold `token-extend`, asked of the PDP with the subject the
  request carries, so step-up applies and a delegated credential is refused.
- An expired or revoked token is not extended: mint a new one.

Recorded before the expiry moves, like mint and revoke: `token-extend` is
declared on-failure: refuse, so a lifetime change that cannot be audited
does not happen.

#### Parameters

##### id

`string`

##### subject

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### hours?

`number`

##### now?

`number` = `...`

#### Returns

`Promise`\<[`AgentTokenPublic`](../type-aliases/AgentTokenPublic.md) \| `null`\>

The updated record, or null when the caller has no such token

#### Throws

Error with a caller-safe message when the extension is refused

***

### flushLastUsed()

> __flushLastUsed__(): `Promise`\<`number`\>

Defined in: src/managers/AgentTokenManager.ts:408

Write out buffered `lastUsedAt` stamps, if any.

Public so a caller — a test, or a shutdown path — can make the in-memory
stamp durable on demand without waiting for the maintenance tick.

#### Returns

`Promise`\<`number`\>

***

### getById()

> __getById__(`id`): [`AgentTokenPublic`](../type-aliases/AgentTokenPublic.md) \| `null`

Defined in: src/managers/AgentTokenManager.ts:639

#### Parameters

##### id

`string`

#### Returns

[`AgentTokenPublic`](../type-aliases/AgentTokenPublic.md) \| `null`

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

Defined in: src/managers/AgentTokenManager.ts:628

# 1006: how many live tokens exist. Never which, and never their values.

This manager is the reason the contract is counts-only rather than the
`getAll()` originally asked for: it holds bearer credentials, and a
generic enumeration on the base class would hand them to the first
generic caller. `listAll()` returns `AgentTokenPublic`, which already
excludes the secret — this reports its LENGTH and not its contents.

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

Defined in: src/managers/AgentTokenManager.ts:286

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

### listAll()

> __listAll__(`now?`): [`AgentTokenPublic`](../type-aliases/AgentTokenPublic.md)[]

Defined in: src/managers/AgentTokenManager.ts:633

#### Parameters

##### now?

`number` = `...`

#### Returns

[`AgentTokenPublic`](../type-aliases/AgentTokenPublic.md)[]

***

### listForOwner()

> __listForOwner__(`owner`, `now?`): [`AgentTokenPublic`](../type-aliases/AgentTokenPublic.md)[]

Defined in: src/managers/AgentTokenManager.ts:612

Live (not expired, not revoked) tokens for an owner.

#### Parameters

##### owner

`string`

##### now?

`number` = `...`

#### Returns

[`AgentTokenPublic`](../type-aliases/AgentTokenPublic.md)[]

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

### mint()

> __mint__(`subject`, `name`, `scopes`, `ttlHours?`, `now?`): `Promise`\<[`MintResult`](../interfaces/MintResult.md)\>

Defined in: src/managers/AgentTokenManager.ts:447

Mint a token for `subject`, the owner acting through a session (#1178).

Takes the subject rather than a username because minting asks a policy
question: does the owner hold every scope the token would carry? A scope
the owner lacks is inert at use time (effective permission is owner ∩
scopes), so refusing it here is honesty rather than security — a token
that silently cannot do the thing it names is a support ticket. The
refusal names the missing scopes so the caller can act on it.

# 1762 slice 6: a subject acting for the owner under a proxy grant mints
the owner's token. The same `permits` question then asks the proxy
ceiling, so every scope must be in the grant, held by the owner and held
by the person acting. The token records that person (`approvedBy`) and the
grant (`proxyGrantId`); it works only while that grant is in force.

#### Parameters

##### subject

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### name

`string`

##### scopes

`string`[]

##### ttlHours?

`number`

##### now?

`number` = `...`

#### Returns

`Promise`\<[`MintResult`](../interfaces/MintResult.md)\>

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

### purgeExpired()

> __purgeExpired__(`now?`): `Promise`\<`number`\>

Defined in: src/managers/AgentTokenManager.ts:799

Drop expired/revoked records past the retention window.

The audit log is unaffected — and since #1111 that is true rather than
aspirational: `token-mint` and `token-revoke` events outlive the records
here, so purging loses the credential and keeps the history of it. Before
that, this comment claimed an audit trail that did not exist, which made
`retention-days` load-bearing by accident.

#### Parameters

##### now?

`number` = `...`

#### Returns

`Promise`\<`number`\>

***

### restore()

> __restore__(`_backupData`): `Promise`\<`void`\>

Defined in: src/managers/AgentTokenManager.ts:890

Refuse. A token backup carries no hashes, so there is nothing to restore
from (#1111).

This used to inherit `BaseManager`'s no-op default, which meant
`restorable: false` was honoured because nobody had implemented the
alternative rather than because anything declined. If someone later wrote a
restore from that payload, records would return with NO hash, and whether
they failed closed would depend entirely on how `verify()` compares. A
refusal that is written down cannot be undone by accident.

#### Parameters

##### \_backupData

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

### revoke()

> __revoke__(`id`, `ctx`, `now?`): `Promise`\<`boolean`\>

Defined in: src/managers/AgentTokenManager.ts:662

Revoke a token. Effective immediately — verify() reads the in-memory store
per request, so there is no cache to wait out. `ctx` is who revoked it:
under a proxy grant (#1762 slice 6) the record names the represented
person and the person acting, and `revokedBy` is the person acting.

#### Parameters

##### id

`string`

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### now?

`number` = `...`

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

Defined in: src/managers/AgentTokenManager.ts:842

Flush pending stamps. Without this, `lastUsedAt` movement since the
last sweep is lost on a clean shutdown. The sweep job itself is stopped
by BackgroundJobManager's shutdown handoff (#1721).

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

### verify()

> __verify__(`token`, `now?`): `Promise`\<[`AgentTokenPublic`](../type-aliases/AgentTokenPublic.md) \| `null`\>

Defined in: src/managers/AgentTokenManager.ts:588

Verify a presented cleartext token.
Returns a COPY of the record when valid, else null. Buffers `lastUsedAt`.

No disk IO: see rule 1 in the file header. The stamp lands in memory and is
flushed by the maintenance tick, so a token used a thousand times a minute
costs one write, not a thousand writes and a thousand backup files.

#### Parameters

##### token

`string`

##### now?

`number` = `...`

#### Returns

`Promise`\<[`AgentTokenPublic`](../type-aliases/AgentTokenPublic.md) \| `null`\>
