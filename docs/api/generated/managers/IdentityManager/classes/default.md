[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/IdentityManager](../README.md) / default

# Class: default

Defined in: src/managers/IdentityManager.ts:126

IdentityManager — the identity record of every digital identity, user or
contact (#617), and the door for them (#1930). Named PersonManager until
# 2038; `getManager('PersonManager')` still answers with it for one release
(`MANAGER_ALIASES` in `src/core/Engine.ts`). What is stored keeps its
"person" names: `data/persons/`, `ngdpbase.application.persons.*`, the
`Person` types, `person:<uuid>`, the `person-*` audit actions.

A person may have an account or not. Each account has exactly one person
(`identifier` = the username); a person with no account has the identifier
`person:<uuid>`, which no username may take. UserManager calls the door on
the account lifecycle under a system context.

The door: `create`, `update`, `delete`, `get`, `list`, `search` and
`linkAccount` take the caller's context first and ask the PDP: `identity-read`
to list, search or get; `identity-manage` to change (`linkAccount` also `user-edit`). Each change is recorded as
the `identity-manage` audit event. A refusal throws `ContactRefusedError`.

Every lookup takes the caller's context too (#2018): `getById`,
`getByIdentifier` and `getByUserIdentifier`. A user reads their own identity
record, and `update` changes it, under `profile-manage`; anyone else's needs
`identity-read` / `identity-manage`. Core's own reads (RoleManager resolving
roles on every request, UserManager's account lifecycle) pass the system
context, allowed without a policy evaluation (`requireRecordAccess`).

A later sign-up joins a person with no account in one of two ways: the new
account confirms an emailed link (`offerSignUpLink` → `confirmSignUpLink`),
or an administrator links them (`linkAccount`). Either way the existing
person keeps its `@id` and takes the account; the person made for the new
account is folded into it and removed, so there is never a second person.

`getByUserIdentifier(ctx, username)` returns a user's identity record and
makes it when the user has none (#2037): every user has exactly one.

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `IdentityManager`

Defined in: src/managers/IdentityManager.ts:152

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`IdentityManager`

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

> `readonly` __description__: `"Identity records of users and contacts (#617)"` = `'Identity records of users and contacts (#617)'`

Defined in: src/managers/IdentityManager.ts:127

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

Defined in: src/managers/IdentityManager.ts:238

Person records are in the backup (#1876), as `<stem>.persons.tar` beside the document. BackupManager backs it up, stages it in a site restore and puts it
in place at the next start, before the records are read (#1985).

#### Returns

[`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backupFolders`](../../BaseManager/classes/default.md#backupfolders)

***

### canAnswer()

> __canAnswer__(): `boolean`

Defined in: src/managers/IdentityManager.ts:817

Whether the identity store can answer lookups now (#2041): false when it
started degraded (no provider). A start-up conversion asks this first and
postpones the whole pass when it is false.

#### Returns

`boolean`

***

### checkContactDetails()

> __checkContactDetails__(`input`): `void`

Defined in: src/managers/IdentityManager.ts:485

Check `input` as [updateContactDetails](#updatecontactdetails) would, writing nothing
(#2073): throws [ContactDetailsInvalidError](ContactDetailsInvalidError.md) for a bad part. For a
caller that writes something else first (the /profile card writes the
account's name and email), so a bad detail refuses the whole save before
anything is written.

#### Parameters

##### input

[`ContactDetailsInput`](../../../types/Person/interfaces/ContactDetailsInput.md)

#### Returns

`void`

***

### confirmSignUpLink()

> __confirmSignUpLink__(`ctx`, `token`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

Defined in: src/managers/IdentityManager.ts:590

The new account confirms the emailed link: it is joined to the person.
Single use. The link is the authority — it proves the address and is
bound to the account it was sent for — so no permission is asked; the
change is recorded under the account's own context. Null for a link that
is unknown, used, expired, or another account's.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### token

`string`

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

***

### conversionPass()

> __conversionPass__(`ctx`): `object`

Defined in: src/managers/IdentityManager.ts:860

One start-up conversion pass over stored references (#2097): `convert`
is [convertRecordedUser](#convertrecordeduser)'s value, and `counts` tallies its outcomes
(values converted to an @id, orphans found or made, "no user recorded"
values) for the caller's counts-only report. When the store cannot
answer it throws `IdentityStoreUnavailableError`, so the caller postpones
its pass rather than skip a record.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`object`

##### convert

> __convert__: (`stored`) => `Promise`\<`string`\>

###### Parameters

###### stored

`string`

###### Returns

`Promise`\<`string`\>

##### counts

> __counts__: `object`

###### counts.converted

> __converted__: `number`

###### counts.noUser

> __noUser__: `number`

###### counts.orphans

> __orphans__: `number`

***

### convertRecordedUser()

> __convertRecordedUser__(`ctx`, `stored`): `Promise`\<\{ `outcome`: `"orphan"` \| `"kept"` \| `"converted"` \| `"orphaned"` \| `"no-user"`; `value`: `string`; \}\>

Defined in: src/managers/IdentityManager.ts:829

[convertReference](#convertreference) for records that may hold a value meaning "no
user was recorded" (#2097): `migrated`, `unknown`, `import`
(NO\_RECORDED\_USER) become `orphan:<value>` without a lookup,
outcome `no-user`, so an account that later takes one of those names
gains nothing, and the caller does not count them as needing attention.
Everything else is `convertReference`'s, and throws as it does.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### stored

`string`

#### Returns

`Promise`\<\{ `outcome`: `"orphan"` \| `"kept"` \| `"converted"` \| `"orphaned"` \| `"no-user"`; `value`: `string`; \}\>

***

### convertReference()

> __convertReference__(`ctx`, `stored`): `Promise`\<\{ `outcome`: `"orphan"` \| `"kept"` \| `"converted"` \| `"orphaned"`; `value`: `string`; \}\>

Defined in: src/managers/IdentityManager.ts:802

What a stored reference to a user should become, for a start-up
conversion (#2041). `stored` is what a record holds today:

- an `@id` (`urn:`), an orphan (`orphan:<name>`), `anonymous`, the
  system principal or an empty value: `kept` (`orphan` when it is an
  orphan, so the caller can count them);
- a username with an account: that identity's `@id`, `converted`;
- a username with no account: `orphan:<name>`, `orphaned`. The record is
  then nobody's: a later account with the same name never takes it over,
  and no "is it mine" check matches it.

Throws when the identity store cannot answer (and so does nothing to the
record): the caller postpones its whole pass to the next start, rather
than orphan a name it could not look up. Ask [canAnswer](#cananswer) first.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### stored

`string`

#### Returns

`Promise`\<\{ `outcome`: `"orphan"` \| `"kept"` \| `"converted"` \| `"orphaned"`; `value`: `string`; \}\>

***

### create()

> __create__(`ctx`, `input`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)\>

Defined in: src/managers/IdentityManager.ts:375

Create a person. With no `identifier` the person has no account and gets
`person:<uuid>`. An `identifier` must be an existing account that has no
person yet: that is how UserManager makes the person for a new account.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### input

[`PersonInput`](../../../types/Person/type-aliases/PersonInput.md)

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)\>

***

### declineSignUpLink()

> __declineSignUpLink__(`ctx`, `token`): `boolean`

Defined in: src/managers/IdentityManager.ts:598

The new account says the record is not theirs: the link is dropped.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### token

`string`

#### Returns

`boolean`

***

### defaultCountry()

> __defaultCountry__(): `string`

Defined in: src/managers/IdentityManager.ts:490

The country a phone or address is read with when none is chosen (#2073): `ngdpbase.application.persons.default-country`, `US` when unset or unknown.

#### Returns

`string`

***

### delete()

> __delete__(`ctx`, `id`): `Promise`\<`boolean`\>

Defined in: src/managers/IdentityManager.ts:495

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### describeReference()

> __describeReference__(`ctx`, `stored`): `Promise`\<`string`\>

Defined in: src/managers/IdentityManager.ts:940

How a stored reference to a user is shown to people (#2097, operator
2026-10-26): the username followed by the id, `jim (urn:uuid:3f6c…)`. An
orphan shows as `jim (no account)`, an `@id` whose account is gone as
`urn:uuid:… (no account)`; anything else (a username not yet converted,
`anonymous`, the system principal) as it is. Resolved when shown, never
stored. Never throws for a store that is down.

`ctx` is whoever the name is shown to. Showing who wrote a page needs no
`identity-read`: only the username and the id are shown, as a page always
showed its author's username, so the record is read as core's own lookup
(the system context, naming the caller in its reason).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### stored

`unknown`

#### Returns

`Promise`\<`string`\>

***

### get()

> __get__(`ctx`, `id`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

Defined in: src/managers/IdentityManager.ts:316

One person by `@id`: [getById](#getbyid), the caller's own under `profile-manage`, anyone else's under `identity-read`.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### id

`string`

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

***

### getById()

> __getById__(`ctx`, `id`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

Defined in: src/managers/IdentityManager.ts:251

One identity record by `@id` (#2018): the caller's own under
`profile-manage`, anyone else's under `identity-read`, core's own work
under the system context. A refusal throws `ContactRefusedError`.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### id

`string`

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

***

### getByIdentifier()

> __getByIdentifier__(`ctx`, `identifier`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

Defined in: src/managers/IdentityManager.ts:261

The identity record whose `identifier` is `identifier` (a username, or a
contact's `person:<uuid>`), decided as [getById](#getbyid) before it is read.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### identifier

`string`

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

***

### getByUserIdentifier()

> __getByUserIdentifier__(`ctx`, `username`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

Defined in: src/managers/IdentityManager.ts:750

The identity record of the user `username`, made when the user has none
(#2037). Every user has exactly one identity record; one made outside
`UserManager.createUser` (an account written straight into the user
store) gets it here, from the account's display name and email.

The read is decided as [getByIdentifier](#getbyidentifier) (#2018): a signed-in user's
own under `profile-manage`, anyone else's under `identity-read`, core's own
work under the system context. Making the missing record is core's
bookkeeping, not the caller's contact management, so it goes through
[create](#create) under the system context, naming the caller, and is
recorded as `identity-manage`. One at a time per username, so two lookups
never make two records. Null when there is no account by that name.
Never a second record: a contact with the same email is left alone
(an administrator links it, [linkAccount](#linkaccount)).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string`

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

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

Defined in: src/managers/IdentityManager.ts:297

# 1006: how many people this instance holds. Count only, never records.

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

### getProvider()

> __getProvider__(): [`PersonProvider`](../../../types/PersonProvider/interfaces/PersonProvider.md) \| `null`

Defined in: src/managers/IdentityManager.ts:242

#### Returns

[`PersonProvider`](../../../types/PersonProvider/interfaces/PersonProvider.md) \| `null`

***

### identityIdOf()

> __identityIdOf__(`ctx`, `username`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/IdentityManager.ts:776

The `@id` of the user `username`'s identity record, or null (#2041): null
when there is no account by that name, and null when the identity store
cannot answer (degraded, unreadable), logged without the name. The door
for a write or a record that refers to a user: it then keeps working as
it does for a name with no account, and never fails because the identity
store is down. Read as [getByUserIdentifier](#getbyuseridentifier), which a caller that
must tell "no account" from "cannot answer" uses instead (a start-up
conversion, with [canAnswer](#cananswer)). A refusal still throws.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string`

#### Returns

`Promise`\<`string` \| `null`\>

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/IdentityManager.ts:156

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

Defined in: src/managers/IdentityManager.ts:728

Clear all caches. Called on every write — the simplest correct
invalidation. Per-key invalidation can come later if needed.

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

### isAccountless()

> `static` __isAccountless__(`person`): `boolean`

Defined in: src/managers/IdentityManager.ts:303

True when the person has no account: its identifier is `person:<uuid>` (#1930).

#### Parameters

##### person

`Pick`\<[`Person`](../../../types/Person/interfaces/Person.md), `"identifier"`\>

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

### linkAccount()

> __linkAccount__(`ctx`, `personId`, `username`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)\>

Defined in: src/managers/IdentityManager.ts:509

An administrator joins a person who has no account to an account (#1930),
for when the email differs or none was given. Asks `identity-manage` and
`user-edit`. The person keeps its `@id`; the account's own person, if it
has one, is folded in and removed.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### personId

`string`

##### username

`string`

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)\>

***

### list()

> __list__(`ctx`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)[]\>

Defined in: src/managers/IdentityManager.ts:310

Every person, for a caller who may read contacts (`identity-read`).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)[]\>

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

### offerSignUpLink()

> __offerSignUpLink__(`ctx`, `username`): `Promise`\<[`LinkOfferOutcome`](../type-aliases/LinkOfferOutcome.md)\>

Defined in: src/managers/IdentityManager.ts:525

Offer a new account the person with no account who has the same email
("Is this you?"): a single-use link is mailed to that address, and the
account joins the person only when it confirms. Called by UserManager
after an account is created. Skipped when email links are not available
on this site; nothing is offered when no person, or more than one, has
that address (an administrator links those by hand). `ctx` is the context
the account was created under, named in the log.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string`

#### Returns

`Promise`\<[`LinkOfferOutcome`](../type-aliases/LinkOfferOutcome.md)\>

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

### referencesOf()

> __referencesOf__(`ctx`, `username`): `Promise`\<`string`[]\>

Defined in: src/managers/IdentityManager.ts:900

The stored values that name the user `username` (#2097): their identity
`@id` and, for records not yet converted, their username — the batch form
of [refersTo](#refersto), for a list filter that compares many records (the
page index, the search index). A "no user recorded" name is left out, and
no orphan is ever in it. Only the username when the store cannot answer.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string` \| `null` \| `undefined`

#### Returns

`Promise`\<`string`[]\>

***

### refersTo()

> __refersTo__(`ctx`, `stored`, `username`): `Promise`\<`boolean`\>

Defined in: src/managers/IdentityManager.ts:886

Whether a stored reference names the user `username` (#2097): it is their
identity `@id`, or, on a record not yet converted, their username. An
orphan (`orphan:<name>`) and a "no user recorded" value never match
anyone, so a later account with the same name inherits nothing. The `@id`
is looked up with [identityIdOf](#identityidof): false when the store cannot answer.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### stored

`unknown`

##### username

`string` \| `null` \| `undefined`

#### Returns

`Promise`\<`boolean`\>

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

### search()

#### Call Signature

> __search__(`ctx`, `query`, `options?`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)[]\>

Defined in: src/managers/IdentityManager.ts:333

Persons whose name (`name`, `givenName`, `familyName`) or `email` contains
`query`, ignoring case; an empty query matches everyone. `accountless`
narrows to persons with no account. At most `limit` results
(`ngdpbase.application.persons.search.limit` by default).

Or by affiliation (#2039): `search(ctx, { affiliation: { memberOf, title?,
current? } })` finds every identity, users and contacts alike, with an
affiliation to that organization: with that title when one is given, and
held today (the first and last day included) unless `current` is false.
Each match says whether it has credentials and which affiliations matched.
Checked like any read of others' records: `identity-read`.

##### Parameters

###### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

###### query

`string`

###### options?

###### accountless?

`boolean`

###### limit?

`number`

##### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)[]\>

#### Call Signature

> __search__(`ctx`, `query`): `Promise`\<[`IdentityMatch`](../interfaces/IdentityMatch.md)[]\>

Defined in: src/managers/IdentityManager.ts:334

Persons whose name (`name`, `givenName`, `familyName`) or `email` contains
`query`, ignoring case; an empty query matches everyone. `accountless`
narrows to persons with no account. At most `limit` results
(`ngdpbase.application.persons.search.limit` by default).

Or by affiliation (#2039): `search(ctx, { affiliation: { memberOf, title?,
current? } })` finds every identity, users and contacts alike, with an
affiliation to that organization: with that title when one is given, and
held today (the first and last day included) unless `current` is false.
Each match says whether it has credentials and which affiliations matched.
Checked like any read of others' records: `identity-read`.

##### Parameters

###### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

###### query

[`IdentitySearch`](../interfaces/IdentitySearch.md)

##### Returns

`Promise`\<[`IdentityMatch`](../interfaces/IdentityMatch.md)[]\>

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

### signUpLinkOffer()

> __signUpLinkOffer__(`ctx`, `token`): `Promise`\<[`LinkOfferDetails`](../interfaces/LinkOfferDetails.md) \| `null`\>

Defined in: src/managers/IdentityManager.ts:575

What the confirmation page shows, for the signed-in account the link was sent to; null for an unknown, used, expired or other account's link.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### token

`string`

#### Returns

`Promise`\<[`LinkOfferDetails`](../interfaces/LinkOfferDetails.md) \| `null`\>

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

### storedReferenceOf()

> __storedReferenceOf__(`ctx`, `username`): `Promise`\<`string`\>

Defined in: src/managers/IdentityManager.ts:845

What a new record stores for the user `username` (#2097): their identity
`@id`; a "no user recorded" value (`migrated`, `unknown`, `import`) as
its orphan form, so no account ever gains it; a principal (`anonymous`,
the system principal), an `@id` or an orphan as it is; a name with no
account, or any name when the store cannot answer ([identityIdOf](#identityidof)),
as given. The one rule for page authors and editors, tombstones and file
uploaders.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string`

#### Returns

`Promise`\<`string`\>

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

> __update__(`ctx`, `id`, `patch`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

Defined in: src/managers/IdentityManager.ts:420

Change a person's fields, affiliations included. `@id` and `identifier`
never change here. The caller's own identity record under
`profile-manage`, anyone else's under `identity-manage` (#2018).

Affiliations (#2039): one with the site's own organization is a fact, so
adding, changing or removing one also asks `identity-manage`, even on the
caller's own record; one with any other organization is a claim, which a
user may set on their own record under `profile-manage`.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### id

`string`

##### patch

[`PersonChange`](../../../types/Person/type-aliases/PersonChange.md)

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

***

### updateContactDetails()

> __updateContactDetails__(`ctx`, `id`, `input`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

Defined in: src/managers/IdentityManager.ts:463

The parts of an identity record a user keeps on `/profile` (#2073):
given and family name, phones, the emergency contact, the home and
mailing addresses, languages, a photo and links. A part left out of
`input` is not touched; a text given empty is removed.

- Phones are stored in E.164 with any extension apart (`extension`),
  read with the country chosen beside each one (the configured default,
  `ngdpbase.application.persons.default-country`, when none is given); a
  number typed with a leading `+` keeps its own country code.
- A phone, the emergency contact and the mailing address each take the
  place of the record's first entry of their kind in `contactPoint`
  (a ContactPoint by `contactType`, the mailing address as the
  `mailing` PostalAddress), keeping that entry's other fields; every
  other entry, an add-on's included, is kept as it is.
- Languages are stored as tags ("es"), given by name or tag.

Everything is checked before anything is written: a bad part throws
[ContactDetailsInvalidError](ContactDetailsInvalidError.md), naming the part and the rule, never
the value. The access and the record are [update](#update)'s: the caller's
own record under `profile-manage`, anyone else's under `identity-manage`,
recorded as an `identity-manage` update naming the fields that changed.
Nothing changed, nothing is written or recorded.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### id

`string`

##### input

[`ContactDetailsInput`](../../../types/Person/interfaces/ContactDetailsInput.md)

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

***

### usernameOf()

> __usernameOf__(`ctx`, `stored`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/IdentityManager.ts:914

The username a stored reference names (#2097), for code that needs the
sign-in name (a vault path, a preference): an `@id` gives its account's
username, an orphan gives null, anything else (a username not yet
converted, `anonymous`, the system principal) is returned as it is. Null
for an `@id` with no account (deleted, or a contact's) and when the store
cannot answer, logged without the value; a refusal still throws.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### stored

`unknown`

#### Returns

`Promise`\<`string` \| `null`\>
