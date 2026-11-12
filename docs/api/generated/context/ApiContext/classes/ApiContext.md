[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/ApiContext](../README.md) / ApiContext

# Class: ApiContext

Defined in: src/context/ApiContext.ts:121

## Extends

- [`BaseContext`](../../BaseContext/classes/BaseContext.md)

## Properties

### \_subject

> `protected` `readonly` __\_subject__: [`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md) \| `null`

Defined in: src/context/BaseContext.ts:48

The caller's subject as the middleware wrote it, or `null` for a context
built without one (a boot-time render, a test fixture).

Read it through [getActor](../../BaseContext/classes/BaseContext.md#getactor); that is the accessor callers and manager
doors use, and it is the one place the anonymous case is decided.

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`_subject`](../../BaseContext/classes/BaseContext.md#_subject)

***

### displayName

> `readonly` __displayName__: `string` \| `null`

Defined in: src/context/ApiContext.ts:132

Caller's display name, or null

***

### email

> `readonly` __email__: `string` \| `null`

Defined in: src/context/ApiContext.ts:135

Caller's email address, or null

***

### engine

> `readonly` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/context/ApiContext.ts:123

Reference to the wiki engine

***

### engineRef

> `protected` `readonly` __engineRef__: [`EngineLike`](../../BaseContext/interfaces/EngineLike.md)

Defined in: src/context/BaseContext.ts:50

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`engineRef`](../../BaseContext/classes/BaseContext.md#engineref)

***

### isAuthenticated

> `readonly` __isAuthenticated__: `boolean`

Defined in: src/context/ApiContext.ts:126

Whether the caller has an active authenticated session

***

### roles

> `readonly` __roles__: `string`[]

Defined in: src/context/ApiContext.ts:138

Caller's assigned roles (always an array, never undefined)

***

### subject

> `readonly` __subject__: [`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md) \| `null`

Defined in: src/context/ApiContext.ts:165

The request's subject exactly as the middleware wrote it (#1179/#1382).

The fields above are a flattened copy for convenience; this is the context
itself, to forward to a manager door that takes one — never rebuilt from
the fields, which is the #1173 defect. `null` for a request with no subject.

***

### username

> `readonly` __username__: `string` \| `null`

Defined in: src/context/ApiContext.ts:129

Caller's username, or null for anonymous

***

### viaProxy?

> `readonly` `optional` __viaProxy?__: [`ProxyClaim`](../../../managers/UserManager/interfaces/ProxyClaim.md)

Defined in: src/context/ApiContext.ts:156

The proxy grant this request acts under, when it does (#1762). Carried for the same reason as `viaToken`: a job started from this context keeps it.

***

### viaShare?

> `readonly` `optional` __viaShare?__: [`ShareGrant`](../../../types/Share/interfaces/ShareGrant.md)

Defined in: src/context/ApiContext.ts:153

The share this request presented, when it did (#1222). Carried for the same reason as `viaToken`.

***

### viaToken?

> `readonly` `optional` __viaToken?__: [`AgentTokenGrant`](../../../managers/UserManager/interfaces/AgentTokenGrant.md)

Defined in: src/context/ApiContext.ts:150

The agent token this request arrived with, when it did (#1173).

Absent before this: `from()` copied five fields off `req.userContext` and
`viaToken` was not one of them, so every `ctx.hasPermission()` — including
every addon API route using `requirePermission()` — resolved against the
token OWNER's live roles with the token's scope ceiling unable to run. The
same defect #1164 fixed in route code, reached through a context class
instead, and invisible to a check that only scans `src/routes/`.

## Accessors

### ipAddress

#### Get Signature

> __get__ __ipAddress__(): `string` \| `undefined`

Defined in: src/context/ApiContext.ts:172

The address the request came from (#1179), read from the subject the
middleware wrote — not a copy. Forwarded with the context, so a job or a
record an add-on starts from it carries the provenance (#1667).

##### Returns

`string` \| `undefined`

***

### isTest

#### Get Signature

> __get__ __isTest__(): `boolean`

Defined in: src/context/ApiContext.ts:182

Whether the caller is signed in to a test account (#1805), read from the
subject the middleware wrote (the account record's flag). An attribute for
an add-on to enforce its own rules from; no policy reads it.

##### Returns

`boolean`

## Methods

### actingUsername()

> __actingUsername__(): `string`

Defined in: src/context/ApiContext.ts:266

The username this request acts as, for a feature that belongs to a
person (a journal, a reservation). Asked AFTER `requirePermission`: policy
decides whether the caller may, this only says whether there is someone
to act as (#1430). A permission delegated to anonymous visitors still
finds nobody here, so the refusal is a 401, never a crash on a missing
name.

#### Returns

`string`

#### Example

```ts
await ctx.requirePermission('page-edit');
const username = ctx.actingUsername(); // → 401 if nobody is signed in
```

***

### enforceDeny()

> __enforceDeny__(`permission`, `decision`, `resource?`): `Promise`\<`never`\>

Defined in: src/context/ApiContext.ts:348

Turn a deny into the refusal (#1431) — the one implementation of refusal
shaping, shared by [requirePermission](#requirepermission) and every manager that asks
the PDP itself. Always throws:

- a step-up deny (`reason` [STEP\_UP\_REASON](../../../types/Policy/variables/STEP_UP_REASON.md)) on a request:
  `AuthManager.askForFreshSignIn` answers and records the reauth prompt —
  `ApiError(403, …, reauth)`, or no `reauth` for a delegated credential
  (agent token, share), which cannot give a fresh sign-in;
- any other deny (policy, or a token, share or proxy ceiling): `ApiError(401)`
  for a caller who has not signed in, `ApiError(403)` for one who has;
- an allow: a programming error. A refusal never silently passes.

#### Parameters

##### permission

`string`

##### decision

[`Decision`](../../../types/Policy/interfaces/Decision.md)

##### resource?

[`OwnedAuditResource`](../../../security/ownedRecords/interfaces/OwnedAuditResource.md)

#### Returns

`Promise`\<`never`\>

#### Example

```ts
const d = await pdp.decideOwnedRecord(ctx.subject, { action: 'phr-read', resource: { type: 'phr-record', id, attributes: { owner } } });
if (!d.permit) await ctx.enforceDeny('phr-read', d, { type: 'phr-record', id, owner, ownerUser });
```

***

### from()

> `static` __from__(`req`, `engine`): `ApiContext`

Defined in: src/context/ApiContext.ts:227

Build an ApiContext from an Express request and engine reference.

Reads `req.userContext` (set by the session middleware in app.ts) and
normalises the values into a fully-typed object. Always succeeds — an
unauthenticated request produces a context with `isAuthenticated: false`
and an empty/anonymous roles array.

#### Parameters

##### req

`Request`

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`ApiContext`

***

### getActor()

> __getActor__(): [`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md)

Defined in: src/context/BaseContext.ts:77

The subject this context was handed, forwarded — never rebuilt.

A caller with no session is `ANONYMOUS_SUBJECT`: a real, named caller that
policy evaluates like any other, not an absence. That is why this returns
a subject rather than `null` — "nobody in particular" is an answer, and
making every call site invent its own fallback is how a default actor gets
introduced (P1).

The returned object is the stored reference. Do not copy it field by
field: a rebuilt subject drops whatever the copier did not think of, which
has so far been `viaToken` (#1173), `viaShare` (#1222) and
`privateStoreHandle` (#1382).

#### Returns

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md)

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`getActor`](../../BaseContext/classes/BaseContext.md#getactor)

***

### getPrincipals()

> __getPrincipals__(): `string`[]

Defined in: src/context/BaseContext.ts:187

The identifiers that match audience-style filters — every role, plus the
username when there is one. Used where running the full evaluator per
result would be too expensive (search filtering).

#### Returns

`string`[]

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`getPrincipals`](../../BaseContext/classes/BaseContext.md#getprincipals)

***

### hasPermission()

> __hasPermission__(`action`): `Promise`\<`boolean`\>

Defined in: src/context/BaseContext.ts:110

May this caller perform `action` at all? The canonical global check,
asked of the PDP (#1431 step 14): the token and share ceilings, then the
policies, with deny policies and role expansion.

For a check against a PAGE, ask [hasPermissionOn](../../BaseContext/classes/BaseContext.md#haspermissionon): the PDP then
reads the page's own attributes (its system-category, its owner) from the
PIP (#2255). Asked here, a page write (`page-edit`, `-delete`, `-rename`)
means "on some category", which is right for an affordance or a token's
scope and wrong for a door.

#### Parameters

##### action

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`hasPermission`](../../BaseContext/classes/BaseContext.md#haspermission)

***

### hasPermissionOn()

> __hasPermissionOn__(`action`, `pageName`): `Promise`\<`boolean`\>

Defined in: src/context/BaseContext.ts:151

A capability asked about the page it is for (#1539, #2255). For a page in
a vault: the container rule first — the owner, never a role, the same
rule as Tier 0 of the page tiers — then the capability with the page's
`vault`, so a policy on the `vault` resource type (`vault-owner`)
decides. For any other page, the PDP is asked about the page by name and
reads its system-category and owner from the PIP, so the policies on its
category decide. A route that acts on a named page asks this instead of
the bare capability.

#### Parameters

##### action

`string`

##### pageName

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`hasPermissionOn`](../../BaseContext/classes/BaseContext.md#haspermissionon)

***

### hasSubject()

> __hasSubject__(): `boolean`

Defined in: src/context/BaseContext.ts:95

True when a real subject was supplied — `getActor()` is not the anonymous fallback.

#### Returns

`boolean`

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`hasSubject`](../../BaseContext/classes/BaseContext.md#hassubject)

***

### holdsPermission()

> __holdsPermission__(`action`): `Promise`\<`boolean`\>

Defined in: src/context/BaseContext.ts:124

Does this request's subject HOLD the permission (#1635)? Policy alone,
without the step-up freshness rule — for affordances only (show this
button, show this section), so a person whose sign-in is not fresh still
sees the way to the prompt. A door or action asks [hasPermission](../../BaseContext/classes/BaseContext.md#haspermission).

#### Parameters

##### action

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`holdsPermission`](../../BaseContext/classes/BaseContext.md#holdspermission)

***

### holdsPermissionOn()

> __holdsPermissionOn__(`action`, `pageName`): `Promise`\<`boolean`\>

Defined in: src/context/BaseContext.ts:172

[hasPermissionOn](../../BaseContext/classes/BaseContext.md#haspermissionon) as an affordance (#2255): does the subject HOLD
`action` on this page, policy alone, without the step-up rule? So the
step-up fallback of a page-scoped check asks about the same page.

#### Parameters

##### action

`string`

##### pageName

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`BaseContext`](../../BaseContext/classes/BaseContext.md).[`holdsPermissionOn`](../../BaseContext/classes/BaseContext.md#holdspermissionon)

***

### requirePermission()

> __requirePermission__(`permission`): `Promise`\<`void`\>

Defined in: src/context/ApiContext.ts:322

Throws unless policy grants the caller this permission.

# 1399: the refusal classifies itself — 401 for a caller who has not
signed in, 403 for one who has. That is the ONE sanctioned use of
`isAuthenticated` (security-posture P2): it never decides, it only says
which refusal to send after policy has already said no. Before this,
every route paired `requireAuthenticated()` with this call to get the 401,
which read as though authentication were half the gate.

# 1745: a refusal for someone who HOLDS the permission is the step-up one
(#1635) — their sign-in is not fresh enough. It carries `reauth`, built
where core routes build it (AuthManager.askForFreshSignIn, #1758), and the prompt is
audited there; a delegated credential gets no `reauth`. The refusal itself
is [enforceDeny](#enforcedeny)'s, shared with managers that ask the PDP directly.

#### Parameters

##### permission

`string`

#### Returns

`Promise`\<`void`\>

#### Example

```ts
await ctx.requirePermission('search-user'); // → 401 anonymous, 403 signed in
```
