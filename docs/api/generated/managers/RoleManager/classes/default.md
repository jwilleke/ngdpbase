[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/RoleManager](../README.md) / default

# Class: default

Defined in: src/managers/RoleManager.ts:73

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `RoleManager`

Defined in: src/managers/RoleManager.ts:98

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`RoleManager`

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

### description

> `readonly` __description__: `"Canonical OrganizationRole records (#617 follow-up)"` = `'Canonical OrganizationRole records (#617 follow-up)'`

Defined in: src/managers/RoleManager.ts:74

Short description of what this manager does.
Used by admin UIs, addon registries, and introspection tools.
Override in subclasses to provide a human-readable description.

#### Overrides

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

### applyRoleDiff()

> __applyRoleDiff__(`username`, `oldRoles`, `newRoles`): `Promise`\<`void`\>

Defined in: src/managers/RoleManager.ts:405

Make the user's memberships go from `oldRoles` to `newRoles`. Used by
UserManager when an account is created or edited; the account write
records its own audit event, so this records none.

All or nothing (#2015): when any change cannot be made, the ones already
made are undone and a `RoleChangeError` is thrown, after it is logged as
an error and admins are notified. That includes a change that cannot even
be attempted: no IdentityManager, no Person record for the username, or no
anchor Organization.

#### Parameters

##### username

`string`

##### oldRoles

`string`[]

##### newRoles

`string`[]

#### Returns

`Promise`\<`void`\>

***

### assignRole()

> __assignRole__(`username`, `roleName`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/RoleManager.ts:367

Assign one role to an existing account, and record it (#1204). A role
that cannot be given is refused (#2015): the error is thrown, admins are
notified, and the attempt is recorded as a failed user-edit.

#### Parameters

##### username

`string`

##### roleName

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`boolean`\>

***

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

Defined in: src/managers/RoleManager.ts:192

Role membership is in the backup (#1876): the role records folder, as `<stem>.roles.tar` beside the document. Without it restored users would have no roles. BackupManager backs it up, stages it in a site restore and puts it
in place at the next start, before the records are read (#1985).

#### Returns

[`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backupFolders`](../../BaseManager/classes/default.md#backupfolders)

***

### create()

> __create__(`role`): `Promise`\<[`Role`](../../../types/Role/interfaces/Role.md)\>

Defined in: src/managers/RoleManager.ts:237

#### Parameters

##### role

[`Role`](../../../types/Role/interfaces/Role.md)

#### Returns

`Promise`\<[`Role`](../../../types/Role/interfaces/Role.md)\>

***

### delete()

> __delete__(`id`): `Promise`\<`boolean`\>

Defined in: src/managers/RoleManager.ts:249

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### getById()

> __getById__(`ctx`, `id`): `Promise`\<[`Role`](../../../types/Role/interfaces/Role.md) \| `null`\>

Defined in: src/managers/RoleManager.ts:202

One role record by `@id`: its members are identity records, so `identity-read`, or core's own work (#2018).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### id

`string`

#### Returns

`Promise`\<[`Role`](../../../types/Role/interfaces/Role.md) \| `null`\>

***

### getByOrgAndPosition()

> __getByOrgAndPosition__(`organizationId`, `namedPosition`): `Promise`\<[`Role`](../../../types/Role/interfaces/Role.md) \| `null`\>

Defined in: src/managers/RoleManager.ts:207

#### Parameters

##### organizationId

`string`

##### namedPosition

`string`

#### Returns

`Promise`\<[`Role`](../../../types/Role/interfaces/Role.md) \| `null`\>

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

### getProvider()

> __getProvider__(): [`RoleProvider`](../../../types/RoleProvider/interfaces/RoleProvider.md) \| `null`

Defined in: src/managers/RoleManager.ts:197

Provider accessor, mainly for tests.

#### Returns

[`RoleProvider`](../../../types/RoleProvider/interfaces/RoleProvider.md) \| `null`

***

### grantToEveryAccountOnce()

> __grantToEveryAccountOnce__(`roleName`, `usernames`, `ctx`): `Promise`\<`number`\>

Defined in: src/managers/RoleManager.ts:427

Give `roleName` to every account in `usernames`, once (#1539).

For a role every account must hold — `ngdpbase.user.account-roles` — that
arrives on an instance which already has people. The role's record not
existing is the record that it was never given: this adds every account,
which creates the record, and from then on finds the record and does
nothing, so an admin's later removal from one person stands. Each grant is
a role change and is recorded as one, under the system context `ctx`,
deferred until the audit sink is up when this runs at boot.

# 2015: each account gets the role or not. One that does not is recorded as
a failed user-edit, and every miss is an error in the log and one error
notification for admins naming the accounts to fix by hand. The boot goes
on: nobody asked, so there is nobody to refuse.

#### Parameters

##### roleName

`string`

##### usernames

readonly `string`[]

##### ctx

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

#### Returns

`Promise`\<`number`\>

how many accounts were given the role (0 once it has been given)

***

### hasRole()

> __hasRole__(`ctx`, `username`, `roleName`): `Promise`\<`boolean`\>

Defined in: src/managers/RoleManager.ts:358

Whether `username` holds `roleName` now, asked by `ctx`; decided as [resolveUserRoles](#resolveuserroles) (#2018).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string`

##### roleName

`string`

#### Returns

`Promise`\<`boolean`\>

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/RoleManager.ts:102

Initialize the manager with configuration

Override this method in subclasses to perform initialization logic.
Always call super.initialize() first in overridden implementations.

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object

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

### invalidateCache()

> __invalidateCache__(): `void`

Defined in: src/managers/RoleManager.ts:261

Clear all caches. Called on every write (create/update/delete) — the
simplest correct invalidation strategy. Per-key invalidation is an
optimization that can come later if measurement shows it matters.
Public so callers (e.g., admin "rebuild" tools) can force a cache miss.

#### Returns

`void`

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

### list()

> __list__(): `Promise`\<[`Role`](../../../types/Role/interfaces/Role.md)[]\>

Defined in: src/managers/RoleManager.ts:233

#### Returns

`Promise`\<[`Role`](../../../types/Role/interfaces/Role.md)[]\>

***

### listByMember()

> __listByMember__(`personId`): `Promise`\<[`Role`](../../../types/Role/interfaces/Role.md)[]\>

Defined in: src/managers/RoleManager.ts:220

#### Parameters

##### personId

`string`

#### Returns

`Promise`\<[`Role`](../../../types/Role/interfaces/Role.md)[]\>

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

### moveMemberships()

> __moveMemberships__(`fromPersonId`, `toPersonId`): `Promise`\<`number`\>

Defined in: src/managers/RoleManager.ts:476

Move every membership held by one Person `@id` to another (#1930): when
IdentityManager joins an account to an existing person, the roles the
account's person held go with the account. Returns how many records
changed. IdentityManager's join records the change. All or nothing (#2015).

# 2040: the roles go only with credentials. The join gives the account
(`fromPersonId`'s credentials) to `toPersonId`, which is still a contact
while the roles move, so the check is that `fromPersonId` is a user: a
contact's memberships never move to anyone.

#### Parameters

##### fromPersonId

`string`

##### toPersonId

`string`

#### Returns

`Promise`\<`number`\>

***

### operatorRequiredAal()

> __operatorRequiredAal__(): `Record`\<`string`, `1` \| `2` \| `3`\>

Defined in: src/managers/RoleManager.ts:314

The `required-aal` levels the OPERATOR set in their own config (#448,
# 1523), as opposed to the shipped defaults. An operator's level that no
factor can reach refuses the boot; a shipped default that cannot be reached
only degrades, so an upgrade never locks an instance out.

#### Returns

`Record`\<`string`, `1` \| `2` \| `3`\>

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

### removeAllMemberships()

> __removeAllMemberships__(`username`): `Promise`\<() => `Promise`\<`void`\>\>

Defined in: src/managers/RoleManager.ts:493

Remove a deleted account's Person from every role it held. All or nothing
(#2015): when any removal fails the others are put back and it throws, so
the account delete is refused. Returns the undo, for a delete that fails
after this: it gives every role back. An account with no Person holds no
role, so there is nothing to remove.

#### Parameters

##### username

`string`

#### Returns

`Promise`\<() => `Promise`\<`void`\>\>

***

### removeRole()

> __removeRole__(`username`, `roleName`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/RoleManager.ts:387

Remove one role from an existing account, and record it (#1204); refused like `assignRole` when it cannot be done.

#### Parameters

##### username

`string`

##### roleName

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`boolean`\>

***

### reportContactMembersAtBoot()

> __reportContactMembersAtBoot__(): `Promise`\<`Record`\<`string`, `number`\>\>

Defined in: src/managers/RoleManager.ts:737

Check the role records for members that are contacts (#2040), once at
start-up when every manager is up. Nothing is dropped or rewritten: each
role holding contacts is named, with how many, in a needs-attention entry
on the dashboard and a log line, and administrators get one notification
(not a second while the first is still active). A contact cannot sign in,
so such a membership gives nothing; an administrator decides what to do.

#### Returns

`Promise`\<`Record`\<`string`, `number`\>\>

role name → how many of its members are contacts

***

### resolveUserRoles()

> __resolveUserRoles__(`ctx`, `username`): `Promise`\<`string`[]\>

Defined in: src/managers/RoleManager.ts:288

A user's base role names: the `namedPosition` of every role record whose
`member[]` holds the user's Person `@id` (#617).

The pseudo-roles `'Authenticated'` and `'All'` are NOT added here — the
caller adds those when constructing `userContext.roles`.

Returns `[]` when IdentityManager is unavailable, there is no account by
that username, no record lists them, or the lookup throws. An account
missing its identity record gets it here (#2037).

`ctx` is who is asking (#2018), decided by IdentityManager's door: a user
about themselves under `profile-manage`, about anyone else under
`identity-read`; core's own work passes the system context. A refusal is
thrown as `ContactRefusedError`, never answered as "no roles".

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string`

#### Returns

`Promise`\<`string`[]\>

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

### roleIdleTimeouts()

> __roleIdleTimeouts__(): `Record`\<`string`, `number`\>

Defined in: src/managers/RoleManager.ts:330

The roles that set their own idle timeout (#1546): role name → minutes,
from each definition's optional `idle-timeout-minutes`. Only positive
numbers count; empty when no role sets one, which is the shipped default.

#### Returns

`Record`\<`string`, `number`\>

***

### roleRequiredAal()

> __roleRequiredAal__(): `Record`\<`string`, `1` \| `2` \| `3`\>

Defined in: src/managers/RoleManager.ts:346

The assurance level each role requires of a sign-in (#1523): role name →
AAL 1–3, from each definition's `required-aal`. A role without one (or
`anonymous`) requires nothing beyond being signed in.

#### Returns

`Record`\<`string`, `1` \| `2` \| `3`\>

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

### update()

> __update__(`id`, `patch`): `Promise`\<[`Role`](../../../types/Role/interfaces/Role.md) \| `null`\>

Defined in: src/managers/RoleManager.ts:243

#### Parameters

##### id

`string`

##### patch

[`RoleUpdate`](../../../types/Role/type-aliases/RoleUpdate.md)

#### Returns

`Promise`\<[`Role`](../../../types/Role/interfaces/Role.md) \| `null`\>
