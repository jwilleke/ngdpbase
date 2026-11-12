[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AddonsManager](../README.md) / AddonModule

# Interface: AddonModule

Defined in: src/managers/AddonsManager.ts:130

Standard interface that all add-ons must implement

## Properties

### author?

> `optional` __author?__: `string`

Defined in: src/managers/AddonsManager.ts:141

Author name or organization

***

### dependencies?

> `optional` __dependencies?__: `string`[]

Defined in: src/managers/AddonsManager.ts:144

List of add-on names this add-on depends on

***

### description?

> `optional` __description?__: `string`

Defined in: src/managers/AddonsManager.ts:138

Human-readable description

***

### name

> __name__: `string`

Defined in: src/managers/AddonsManager.ts:132

Unique identifier for the add-on

***

### optionalDependencies?

> `optional` __optionalDependencies?__: `string`[]

Defined in: src/managers/AddonsManager.ts:150

# 1808: add-ons to load first when they are installed and enabled. Unlike
`dependencies`, a missing or disabled one is skipped, not an error.

***

### version

> __version__: `string`

Defined in: src/managers/AddonsManager.ts:135

Semantic version string

## Methods

### backupFolders()?

> `optional` __backupFolders__(`config`): [`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

Defined in: src/managers/AddonsManager.ts:173

Folders it keeps data in besides its `dataPath` (#1985), given its
configuration. Its `dataPath` is backed up and restored without being
declared; an add-on declares only further folders, and writes no backup
code. BackupManager archives each one, stages it in a site restore, and
puts it in place before `register()` runs at the next start.

#### Parameters

##### config

`Record`\<`string`, `unknown`\>

#### Returns

[`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

***

### profileSection()?

> `optional` __profileSection__(`user`, `ctx`): [`AddonProfileSection`](AddonProfileSection.md) \| `Promise`\<[`AddonProfileSection`](AddonProfileSection.md) \| `null`\> \| `null`

Defined in: src/managers/AddonsManager.ts:216

Optional `/profile` page extension hook (#534).

When implemented, the addon contributes a section to the core profile
page rather than maintaining a standalone settings route. The returned
`html` is inserted __inside__ the core preferences form, so the form
fields it carries are submitted with the existing `POST /preferences`
and surfaced to `saveProfileSection()` for persistence.

Return `null` to opt out per-user (e.g. when the addon's feature is
disabled for this user's roles).

⚠️ SECURITY — the returned `html` is rendered with EJS `<%- %>` (RAW,
NOT escaped) inside the user's `/profile` form. __The addon is fully
responsible for escaping any user-controlled data it interpolates.__
Use `<%= %>` in your own EJS templates, or an explicit escape helper.
A buggy `profileSection()` that string-concatenates user input becomes
stored-XSS against every user who views their profile.

Two specific things to avoid:

- Do NOT emit `<input name="_csrf" …>` — that would override the
    host form's CSRF token and corrupt the user's save.
- Do NOT emit a wrapping `<form>` — your fields submit with the host
    preferences form. A nested `<form>` is invalid HTML and browsers
    will hoist your inputs unpredictably.

RECOMMENDED — include a hidden marker so your paired `saveProfileSection`
can distinguish "section was rendered but checkboxes unchecked" from
"section was not rendered at all" (addon disabled mid-session, cached
form). Without it, absent checkbox fields look identical to "user
submitted no such field" and you may silently clobber stored values.

`ctx` is the signed-in user's own context, forwarded from the request:
pass it to your manager's door (and to the PDP) instead of rebuilding a
subject from `user` (#2018).

#### Parameters

##### user

[`AddonProfileUser`](../type-aliases/AddonProfileUser.md)

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

[`AddonProfileSection`](AddonProfileSection.md) \| `Promise`\<[`AddonProfileSection`](AddonProfileSection.md) \| `null`\> \| `null`

***

### register()

> __register__(`engine`, `config`, `host?`): `void` \| `Promise`\<`void`\>

Defined in: src/managers/AddonsManager.ts:160

Called during app startup if add-on is enabled.
Use this to register routes, initialize databases, etc.

# 1813: `host` carries the core values an add-on uses (ApiContext,
recordAuditEvent, logger, guardedFetch, …), built for this add-on and
frozen. An add-on that takes two arguments keeps working until it moves.

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

##### config

`Record`\<`string`, `unknown`\>

##### host?

[`AddonHost`](../../../utils/addonHost/interfaces/AddonHost.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### saveProfileSection()?

> `optional` __saveProfileSection__(`ctx`, `body`): `void` \| `Promise`\<`void`\>

Defined in: src/managers/AddonsManager.ts:249

Optional save handler paired with `profileSection()` (#534).

Receives a shallow-cloned `req.body` from `POST /preferences`; the addon
extracts whichever fields its `profileSection()` form rendered and
persists them. Errors are caught by AddonsManager and logged — they
do NOT block the core-preferences save or other addons' saves.

Two pitfalls the implementation must guard against (the host cannot
do this for you):

  1. ABSENT-FIELD CLOBBER. HTML checkboxes only submit when checked, so
     an absent key is ambiguous between "user unchecked it" and "the
     field was never rendered". Without a presence signal (see the
     recommended hidden marker on `profileSection()`), writing
     `body['x'] === 'on'` unconditionally turns every save where the
     section was hidden into a stealth reset to `false`.

  2. CONFIG-GATED FIELDS. If your partial gates a field behind an admin
     config flag (`<% if (enabled) %>`), your save handler MUST re-check
     the same flag server-side before writing — otherwise a crafted
     POST can bypass the admin's gate.

__Since #1234 the first argument is the caller's context, not a name.__
`ctx` is the request's subject (`PermissionSubject`: `username`, `roles`,
`isAuthenticated`, `ipAddress`, `viaToken` / `viaShare` when delegated)
— forward it to whatever you write (`userManager.updateUser(ctx.username,
updates, ctx)`), never rebuild one from `ctx.username`. An addon still
written against the old `(username, body)` shape gets a warning at load
naming it; its saves then fail per call and are logged.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### body

`Record`\<`string`, `unknown`\>

#### Returns

`void` \| `Promise`\<`void`\>

***

### shutdown()?

> `optional` __shutdown__(): `void` \| `Promise`\<`void`\>

Defined in: src/managers/AddonsManager.ts:254

Optional cleanup on app shutdown.

#### Returns

`void` \| `Promise`\<`void`\>

***

### status()?

> `optional` __status__(): [`AddonStatusDetails`](AddonStatusDetails.md) \| `Promise`\<[`AddonStatusDetails`](AddonStatusDetails.md)\>

Defined in: src/managers/AddonsManager.ts:178

Optional health check returning add-on status details.

#### Returns

[`AddonStatusDetails`](AddonStatusDetails.md) \| `Promise`\<[`AddonStatusDetails`](AddonStatusDetails.md)\>
