[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/OidcManager](../README.md) / OidcManager

# Class: OidcManager

Defined in: src/managers/OidcManager.ts:212

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new OidcManager__(`engine`): `OidcManager`

Defined in: src/managers/OidcManager.ts:222

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`OidcManager`

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

Defined in: src/managers/OidcManager.ts:603

Who had granted which client access, for incident response — not a
restorable copy. The store's rows are short-lived or hold presentable
session ids; a restored one would revive access somebody may have ended.

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

### clientName()

> __clientName__(`clientId`): `Promise`\<`string`\>

Defined in: src/managers/OidcManager.ts:499

What to call a client on the consent page: its registered name, else its id.

#### Parameters

##### clientId

`string`

#### Returns

`Promise`\<`string`\>

***

### endSessionsFor()

> __endSessionsFor__(`username`): `Promise`\<`number`\>

Defined in: src/managers/OidcManager.ts:511

End every provider session of an account (#1572), so signing out of
ngdpbase also signs out of /oidc: the provider's own session cookie would
otherwise keep finishing sign-ins for someone who left. Grants stay —
consent is remembered — and tokens already issued run to their expiry.

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`number`\>

***

### findAccount()

> __findAccount__(`accountId`, `signIn?`): `Promise`\<`Record`\<`string`, `unknown`\> \| `undefined`\>

Defined in: src/managers/OidcManager.ts:531

The person's claims for the package, or undefined — which fails the
request closed — when the account is gone or disabled, or when this
sign-in is older than the account's last password change (#1592): an app
keeps nothing past a password change, as no web session does (#1482).
Never roles: a session can hold fewer roles than the account (#1569).
`test_account` is always a boolean (#1805), released with `profile`.

#### Parameters

##### accountId

`string`

##### signIn?

`SignInContext`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\> \| `undefined`\>

***

### finishConsent()

> __finishConsent__(`req`, `res`, `subject`): `Promise`\<`void`\>

Defined in: src/managers/OidcManager.ts:389

Finish the consent step (#1572) for `subject`. Acting for someone (#1762
slice 6), the approval is also recorded beside the grant: who approved it
and under which proxy grant, so the profile can say so, ending the proxy
grant revokes it, and it works only while that grant is in force. Recorded
in the audit log as an approval naming both people.

#### Parameters

##### req

`IncomingMessage`

##### res

`ServerResponse`

##### subject

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

#### Returns

`Promise`\<`void`\>

***

### getApiResource()

> __getApiResource__(): `string`

Defined in: src/managers/OidcManager.ts:332

The audience a token for ngdpbase's API names; empty when off.

#### Returns

`string`

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

### getIssuer()

> __getIssuer__(): `string`

Defined in: src/managers/OidcManager.ts:519

The issuer once configured; empty when off.

#### Returns

`string`

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

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/OidcManager.ts:226

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

### interactions()

> __interactions__(): `InteractionHelpers` \| `null`

Defined in: src/managers/OidcManager.ts:315

The package's interaction helpers for the sign-in bridge (#1572); null when not serving.

#### Returns

`InteractionHelpers` \| `null`

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

### listGrants()

> __listGrants__(`username`): `Promise`\<[`ApprovedApp`](../interfaces/ApprovedApp.md)[]\>

Defined in: src/managers/OidcManager.ts:439

The apps and devices `username` approved (#1601): one per live grant,
newest first. Empty when the provider is off.

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`ApprovedApp`](../interfaces/ApprovedApp.md)[]\>

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

### pendingRequest()

> __pendingRequest__(`req`, `res`): `Promise`\<\{ `params`: `Record`\<`string`, `unknown`\>; `startedAt`: `number`; \}\>

Defined in: src/managers/OidcManager.ts:325

The pending request's own parameters (`prompt`, `max_age`, …), which the
package's `details()` does not carry, and when it began (epoch seconds).
The bridge reads them to refuse a request for a fresh sign-in it cannot
give yet (#1525), and to accept one made after the request began.

#### Parameters

##### req

`IncomingMessage`

##### res

`ServerResponse`

#### Returns

`Promise`\<\{ `params`: `Record`\<`string`, `unknown`\>; `startedAt`: `number`; \}\>

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

### proxyApprovalRefusal()

> __proxyApprovalRefusal__(`subject`, `scope`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/OidcManager.ts:371

Why `subject` may not approve an app asking for `scope`, in plain words,
or null when they may (#1762 slice 6). Only someone acting for the person
under a proxy grant is asked: each permission the app asks for on
ngdpbase's API must be one the decision point permits that subject, which
under a proxy is the grant, the represented person and the person acting
all at once. The person themselves is not asked, as before: what an app
of theirs can do is bounded by what they hold, at every use.

#### Parameters

##### subject

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### scope

`string`

#### Returns

`Promise`\<`string` \| `null`\>

***

### recordEvent()

> __recordEvent__(`event`): `Promise`\<`void`\>

Defined in: src/managers/OidcManager.ts:554

Record one provider event in ngdpbase's audit log (#1575). The package
never passes a token, code or secret; the person is the account, the
resource is the app. Returns the promise so the package can count a
report the sink failed to take.

#### Parameters

##### event

`AuditEvent`

#### Returns

`Promise`\<`void`\>

***

### restore()

> __restore__(`_backupData`): `Promise`\<`void`\>

Defined in: src/managers/OidcManager.ts:616

Refuse: there is nothing to restore from; people sign in again and clients re-consent.

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

### revokeGrant()

> __revokeGrant__(`username`, `grantId`, `by`): `Promise`\<`boolean`\>

Defined in: src/managers/OidcManager.ts:480

End one of `username`'s grants and every code and token under it (#1601).
False when no such grant is theirs — never revokes another person's.
Recorded as oidcgrant-revoke by whoever revoked it (`by`, the owner when
not given), naming the owner, as an agent token's revoke is (#1764);
under a proxy grant, naming the person acting too (#1762 slice 6).

#### Parameters

##### username

`string`

##### grantId

`string`

##### by

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

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

Defined in: src/managers/OidcManager.ts:593

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

### start()

> __start__(`settings`): `Handler` \| `null`

Defined in: src/managers/OidcManager.ts:300

Build the server with the `trust proxy` decision app.ts made for Express.
Returns null when the manager is off or refused; the caller mounts nothing.

#### Parameters

##### settings

###### trustProxy

`boolean`

#### Returns

`Handler` \| `null`

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

### verifyAccessToken()

> __verifyAccessToken__(`token`): `Promise`\<[`VerifiedAccessToken`](../interfaces/VerifiedAccessToken.md) \| `null`\>

Defined in: src/managers/OidcManager.ts:343

Verify an access token presented to ngdpbase's API (#1576), in process:
it must exist, be unexpired, name this API as its audience, not be bound
to a key we do not check, and belong to an account that still passes
findAccount (active; no password change since the sign-in, #1592).
Null otherwise — never a reason, since the caller is unauthenticated.

#### Parameters

##### token

`string`

#### Returns

`Promise`\<[`VerifiedAccessToken`](../interfaces/VerifiedAccessToken.md) \| `null`\>
