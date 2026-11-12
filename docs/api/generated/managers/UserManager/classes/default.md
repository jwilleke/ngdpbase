[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/UserManager](../README.md) / default

# Class: default

Defined in: src/managers/UserManager.ts:337

UserManager - Handles user authentication, authorization, and roles

Similar to JSPWiki's UserManager with role-based permissions. This manager
orchestrates user operations through a pluggable provider system, allowing
different storage backends (file, database, LDAP, etc.) to be used.

Key responsibilities:

- User authentication (login/logout)
- Password management with hashing
- Role and permission management
- Session management
- User profile management
- Provider abstraction for storage

Follows JSPWiki's provider pattern where the actual storage implementation
is abstracted behind a provider interface. This allows for different storage
backends (file, database, LDAP, etc.) to be swapped via configuration.

 UserManager

## See

- [BaseManager](../../BaseManager/classes/default.md) for base functionality
- FileUserProvider for default provider implementation

## Example

```ts
const userManager = engine.getManager('UserManager');
const ok = await authManager.authenticate('password', { username: 'admin', password: 'password' });
if (user) logger.info('Logged in:', user.username);
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `UserManager`

Defined in: src/managers/UserManager.ts:352

Creates a new UserManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`UserManager`

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

### assertAdminEmailUnshared()

> __assertAdminEmailUnshared__(`username`, `email`, `ctx`, `roles?`): `Promise`\<`void`\>

Defined in: src/managers/UserManager.ts:493

An account holding the admin role never shares its email (#2073, operator
2026-10-25), either way round: refused when `username` is or will be an
administrator and another account holds `email`, and when another account
holding `email` is an administrator. `roles` are the account's roles
after the change, when the change sets them; otherwise its current ones
are read. Throws `UserCreateError('admin-email-shared')`; the message names
the accounts, for the log and an administrator, never for a visitor.

#### Parameters

##### username

`string`

##### email

`unknown`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### roles?

readonly `string`[]

#### Returns

`Promise`\<`void`\>

***

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/UserManager.ts:1855

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

### checkDisplayNamePageConflict()

> __checkDisplayNamePageConflict__(`displayName`, `excludeUsername?`): `Promise`\<`boolean`\>

Defined in: src/managers/UserManager.ts:918

Check if a display name conflicts with existing page names or other users

#### Parameters

##### displayName

`string`

Display name to check

##### excludeUsername?

`string` \| `null` = `null`

Username to exclude from the check (for updates)

#### Returns

`Promise`\<`boolean`\>

True if conflict exists

***

### createDefaultAdmin()

> __createDefaultAdmin__(): `Promise`\<`void`\>

Defined in: src/managers/UserManager.ts:794

Create the bootstrap admin account.

Called only when the user store is empty. The password is
`ngdpbase.user.security.defaultpassword`, which ships as `admin123` so a
first run needs no setup; a headless install refuses that well-known value
(#1087), and startup warns while the admin still uses it. Low first-run
friction is a decision: warn, never force (crypto/auth review, 2026-10-05).

#### Returns

`Promise`\<`void`\>

***

### createSession()

> __createSession__(`username`, `additionalData?`): `Promise`\<`string`\>

Defined in: src/managers/UserManager.ts:1779

#### Parameters

##### username

`string`

##### additionalData?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`Promise`\<`string`\>

***

### createUser()

> __createUser__(`userData`, `ctx`): `Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>\>

Defined in: src/managers/UserManager.ts:1090

Create new user

#### Parameters

##### userData

`UserCreateInput`

User data

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>\>

Created user (without password)

***

### createUserPage()

> __createUserPage__(`user`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/UserManager.ts:958

Create a user page for a new user.

The page is the new user's (#1462): they are its author. Authored by the
admin who created the account — or by whoever ran self-registration —
`author-lock` would leave the account's own owner unable to edit it.
It is written by a system job through the write door (#1815), with the
new user named as the one it is made for.

#### Parameters

##### user

[`User`](../../../types/User/interfaces/User.md)

User object

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who created the account, for the log line only

#### Returns

`Promise`\<`boolean`\>

True if user page was created successfully

***

### deleteSession()

> __deleteSession__(`sessionId`): `Promise`\<`void`\>

Defined in: src/managers/UserManager.ts:1806

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<`void`\>

***

### deleteUser()

> __deleteUser__(`username`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/UserManager.ts:1480

Delete user

#### Parameters

##### username

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`boolean`\>

***

### deleteUserSessions()

> __deleteUserSessions__(`username`, `reason`, `from?`): `Promise`\<`number`\>

Defined in: src/managers/UserManager.ts:1821

End every signed-in session of `username` in the live session store
(#1937): the account was deleted or turned off (`AuthManager.closeAccess`).
Each goes through `endSession` (its keys dropped, `authentication-logout`
recorded with the reason) and is removed from the store. Returns how many.
The provider's own session list was cleared here before; nothing writes it,
and the store express-session reads was never touched.

#### Parameters

##### username

`string`

##### reason

`"account-deleted"` \| `"account-disabled"`

##### from?

###### ipAddress?

`string`

#### Returns

`Promise`\<`number`\>

***

### endStaleSessions()

> __endStaleSessions__(): `Promise`\<`number`\>

Defined in: src/managers/UserManager.ts:1832

End every signed-in session in the store that no longer belongs to its
account (#1937): the account is gone, turned off, another account of the
same name, or its password changed since (`checkSessionAccount`, the
per-request rule). Run once at startup, so sessions left from before the
fix, or from a close the store missed, do not wait for their next request.

#### Returns

`Promise`\<`number`\>

***

### getContactRecipient()

> __getContactRecipient__(`recipientOverride`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/UserManager.ts:1624

# 658: resolve the recipient address for /contact submissions.

1. Trimmed `recipientOverride` (from `ngdpbase.application.contact.recipient`)
   if non-empty — used verbatim, may be a list or alias.
2. Else: first user with the `admin` role whose email is non-empty AND
   not the install-default sentinel `admin@localhost`. The sentinel
   keeps the contact feature dormant on fresh installs that haven't
   set a real admin email yet, instead of mailing into a black hole.
3. Else: `null` — caller must render "Contact form is not configured"
   rather than attempting to send.

The returned address is server-side only; never render it to clients.

#### Parameters

##### recipientOverride

`string`

#### Returns

`Promise`\<`string` \| `null`\>

***

### getCurrentUserProvider()

> __getCurrentUserProvider__(): [`UserProvider`](../../../types/Provider/interfaces/UserProvider.md) \| `null`

Defined in: src/managers/UserManager.ts:594

Get the current user provider instance

#### Returns

[`UserProvider`](../../../types/Provider/interfaces/UserProvider.md) \| `null`

The active provider

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

### getSession()

> __getSession__(`sessionId`): `Promise`\<[`UserSession`](../../../types/User/interfaces/UserSession.md) \| `null`\>

Defined in: src/managers/UserManager.ts:1799

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<[`UserSession`](../../../types/User/interfaces/UserSession.md) \| `null`\>

***

### getUser()

> __getUser__(`username`): `Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\> \| `undefined`\>

Defined in: src/managers/UserManager.ts:1565

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\> \| `undefined`\>

***

### getUserByEmail()

> __getUserByEmail__(`email`): `Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\> \| `undefined`\>

Defined in: src/managers/UserManager.ts:1591

#### Parameters

##### email

`string`

#### Returns

`Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\> \| `undefined`\>

***

### getUsers()

> __getUsers__(): `Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>[]\>

Defined in: src/managers/UserManager.ts:1555

#### Returns

`Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>[]\>

***

### getUsersByEmail()

> __getUsersByEmail__(`email`): `Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>[]\>

Defined in: src/managers/UserManager.ts:475

Every account holding this email (#2073): two or more accounts may share
one (a couple, an older adult and a carer). Compared trimmed and in any
case, with no provider rules (plus addressing is a different address).
Empty for no email. Without the password hash.

#### Parameters

##### email

`unknown`

#### Returns

`Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>[]\>

***

### hashPassword()

> __hashPassword__(`password`): `Promise`\<`string`\>

Defined in: src/managers/UserManager.ts:625

Hash a password for storage (#1042).

scrypt with a per-user random salt. Was one round of SHA-256 with a single
instance-wide salt, which is fast to crack offline and made two users with
the same password produce identical hashes.

#### Parameters

##### password

`string`

Plain text password

#### Returns

`Promise`\<`string`\>

Self-describing hash: `scrypt$N$r$p$salt$hash`

***

### hasPassword()

> __hasPassword__(`username`): `Promise`\<`boolean`\>

Defined in: src/managers/UserManager.ts:1583

Whether the account signs in with a password of its own: a local account
whose record carries a hash. Asked here because this is the one door that
sees the hash — `getUser()` strips it, which is why AuthManager's
last-way-in rule, asking through `getUser()`, saw no password on any
account and refused to remove anyone's only passkey (#1524).

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`boolean`\>

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/UserManager.ts:371

Initialize the UserManager and load the configured provider

Loads the user provider, role definitions, and creates a default admin
user if no users exist.

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object (unused, reads from ConfigurationManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available or provider fails to load

#### Example

```ts
await userManager.initialize();
// Creates default admin if no users exist
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

### isAdminUsingDefaultPassword()

> __isAdminUsingDefaultPassword__(): `Promise`\<`boolean`\>

Defined in: src/managers/UserManager.ts:696

Check whether the admin account still has the configured bootstrap
password. False when none is configured — there is then no shipped,
well-known credential to warn about.

#### Returns

`Promise`\<`boolean`\>

True if admin still has the bootstrap password

***

### isEmailShared()

> __isEmailShared__(`email`, `ownUsername`): `Promise`\<`boolean`\>

Defined in: src/managers/UserManager.ts:534

Whether an account other than `ownUsername` holds this email too (#2073): for the note at save and the admins' marker.

#### Parameters

##### email

`unknown`

##### ownUsername

`string` \| `null`

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

### recordSignIn()

> __recordSignIn__(`username`): `Promise`\<`void`\>

Defined in: src/managers/UserManager.ts:880

Count a completed sign-in on the account: last sign-in and sign-in count (#1758; AuthManager calls it for a sign-in, never a re-check).

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`void`\>

***

### reportSessionCookieWithheld()

> __reportSessionCookieWithheld__(): `void`

Defined in: src/managers/UserManager.ts:546

The session cookie is `secure` and a request came over plain http, so
express-session sent no cookie and nobody can sign in (#2071). Sessions
are this manager's, so the report is too: an error in the log, the
dashboard's "needs your attention", and a notification for admins, once
per process. Every later call is one boolean check, because app.ts calls
this on each such request.

#### Returns

`void`

***

### resetPasswordWithRecoveryWords()

> __resetPasswordWithRecoveryWords__(`username`, `words`, `newPassword`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/UserManager.ts:1271

A forgotten password, reset with the 12 recovery words (#1452).

The words are the account owner's own escrow: they unwrap the key the
password used to, so proving them is proving you are the person the key
was made for. The password wrap is replaced first — the recovery wrap and
the key are unchanged, so every encrypted store still opens — and then the
sign-in password is set, through `updateUser`, so the two stay one
password and the change is recorded like any other.

`false`, changing nothing, for any reason it cannot be done: no such
account, an inactive or external one, no keys, or words that do not open
them. The caller cannot tell which, so the door cannot be used to learn
which accounts exist.

#### Parameters

##### username

`string`

##### words

`string`

##### newPassword

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`boolean`\>

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/managers/UserManager.ts:1885

Restore manager data from backup

MUST be overridden by all managers that manage persistent data.
Default implementation only validates that backup data is provided.

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

Backup data object from backup() method

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

### searchUsers()

> __searchUsers__(`query`, `options`, `ctx`): `Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>[]\>

Defined in: src/managers/UserManager.ts:1646

Search users by username, displayName, or email (case-insensitive substring).
Optionally filter by role and active status.

Decides `search-user` itself, with `ctx` (#2018): every user holds it as
shipped, anonymous does not. A refusal throws `ContactRefusedError`. Core's
own lookups (a notice's recipients, a role's holders) pass the system
context with a reason, allowed without a policy evaluation.

#### Parameters

##### query

`string`

##### options

###### activeOnly?

`boolean`

###### limit?

`number`

###### role?

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>[]\>

***

### setFirstPassword()

> __setFirstPassword__(`username`, `newPassword`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/managers/UserManager.ts:1301

A user's first password, chosen by themselves (#2049: after an
invitation signed them in). Only for their own account, signed in as
themselves (no token, share link or proxy), under `account-security`,
and only while the account has no password: a password already set is
changed on the profile, which asks for the current one. `false`,
changing nothing, otherwise. The length rule is the route's, as for
every password form. Recorded like any password change (`user-edit`).

#### Parameters

##### username

`string`

##### newPassword

`string`

##### ctx

[`PermissionSubject`](../interfaces/PermissionSubject.md)

#### Returns

`Promise`\<`boolean`\>

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

### storedPasswordHash()

> __storedPasswordHash__(`username`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/UserManager.ts:861

The stored password hash of an active local account, or null (#1758).
The password check is `PasswordAuthProvider`'s, through AuthManager — the
one door for every check of a secret; this manager keeps the hash on the
account and hands it only to that check. `getUser()` still strips it.

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`string` \| `null`\>

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

### updateUser()

> __updateUser__(`username`, `updates`, `ctx`): `Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>\>

Defined in: src/managers/UserManager.ts:1334

Change an account (#2025: one change at a time per account).

`updates` is the fields to merge, or a function that works them out from
the account as it is now: `(current) => updates`. The function runs inside
the account's `KeyedSerial` key, between the read and the write, so two
changes to one account never read the same old record. It gets a copy of
the account without the password hash, and returns the fields to merge, or
`undefined` to change nothing (nothing is written or recorded). It must not
call `updateUser` for the same account: the key is not re-entrant.
Either form is checked, applied and recorded the same way.

Returns the account as written (as read, when nothing changed), without
the password hash: the hash never leaves UserManager except to the
password check (`storedPasswordHash`).

#### Parameters

##### username

`string`

##### updates

[`UserUpdateInput`](../interfaces/UserUpdateInput.md) \| [`UserUpdateFn`](../type-aliases/UserUpdateFn.md)

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>\>

***

### upgradePasswordHash()

> __upgradePasswordHash__(`username`, `newHash`, `legacy`): `Promise`\<`void`\>

Defined in: src/managers/UserManager.ts:873

Replace a stored hash with one at the current cost, after a successful
check (#1042): the only moment it can be done, since the old digest can't
be converted. Called by `PasswordAuthProvider` (#1758).

#### Parameters

##### username

`string`

##### newHash

`string`

##### legacy

`boolean`

#### Returns

`Promise`\<`void`\>

***

### usernamesSharingAnEmail()

> __usernamesSharingAnEmail__(): `Promise`\<`Set`\<`string`\>\>

Defined in: src/managers/UserManager.ts:524

The usernames of every account whose email another account holds too (#2073): the admins' marker on the user list.

#### Returns

`Promise`\<`Set`\<`string`\>\>

***

### verifyPassword()

> __verifyPassword__(`password`, `hash`): `Promise`\<`boolean`\>

Defined in: src/managers/UserManager.ts:640

Verify a password against a stored hash, in either scheme (#1042).

Pre-#1042 hashes keep verifying against the instance-wide salt — the
plaintext is not recoverable, so they cannot be converted in bulk. They are
upgraded individually by `PasswordAuthProvider` on the next successful check (#1758).

#### Parameters

##### password

`string`

Plain text password

##### hash

`string`

Stored hash, either scheme

#### Returns

`Promise`\<`boolean`\>

True if password matches
