[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/BaseContext](../README.md) / BaseContext

# Abstract Class: BaseContext

Defined in: src/context/BaseContext.ts:40

## Extended by

- [`ApiContext`](../../ApiContext/classes/ApiContext.md)
- [`default`](../../WikiContext/classes/default.md)

## Constructors

### Constructor

> `protected` __new BaseContext__(`engine`, `subject`): `BaseContext`

Defined in: src/context/BaseContext.ts:58

#### Parameters

##### engine

[`EngineLike`](../interfaces/EngineLike.md)

##### subject

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md) \| `null`

#### Returns

`BaseContext`

## Properties

### \_subject

> `protected` `readonly` __\_subject__: [`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md) \| `null`

Defined in: src/context/BaseContext.ts:48

The caller's subject as the middleware wrote it, or `null` for a context
built without one (a boot-time render, a test fixture).

Read it through [getActor](#getactor); that is the accessor callers and manager
doors use, and it is the one place the anonymous case is decided.

***

### engineRef

> `protected` `readonly` __engineRef__: [`EngineLike`](../interfaces/EngineLike.md)

Defined in: src/context/BaseContext.ts:50

## Methods

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

***

### getPrincipals()

> __getPrincipals__(): `string`[]

Defined in: src/context/BaseContext.ts:187

The identifiers that match audience-style filters — every role, plus the
username when there is one. Used where running the full evaluator per
result would be too expensive (search filtering).

#### Returns

`string`[]

***

### hasPermission()

> __hasPermission__(`action`): `Promise`\<`boolean`\>

Defined in: src/context/BaseContext.ts:110

May this caller perform `action` at all? The canonical global check,
asked of the PDP (#1431 step 14): the token and share ceilings, then the
policies, with deny policies and role expansion.

For a check against a PAGE, ask [hasPermissionOn](#haspermissionon): the PDP then
reads the page's own attributes (its system-category, its owner) from the
PIP (#2255). Asked here, a page write (`page-edit`, `-delete`, `-rename`)
means "on some category", which is right for an affordance or a token's
scope and wrong for a door.

#### Parameters

##### action

`string`

#### Returns

`Promise`\<`boolean`\>

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

***

### hasSubject()

> __hasSubject__(): `boolean`

Defined in: src/context/BaseContext.ts:95

True when a real subject was supplied — `getActor()` is not the anonymous fallback.

#### Returns

`boolean`

***

### holdsPermission()

> __holdsPermission__(`action`): `Promise`\<`boolean`\>

Defined in: src/context/BaseContext.ts:124

Does this request's subject HOLD the permission (#1635)? Policy alone,
without the step-up freshness rule — for affordances only (show this
button, show this section), so a person whose sign-in is not fresh still
sees the way to the prompt. A door or action asks [hasPermission](#haspermission).

#### Parameters

##### action

`string`

#### Returns

`Promise`\<`boolean`\>

***

### holdsPermissionOn()

> __holdsPermissionOn__(`action`, `pageName`): `Promise`\<`boolean`\>

Defined in: src/context/BaseContext.ts:172

[hasPermissionOn](#haspermissionon) as an affordance (#2255): does the subject HOLD
`action` on this page, policy alone, without the step-up rule? So the
step-up fallback of a page-scoped check asks about the same page.

#### Parameters

##### action

`string`

##### pageName

`string`

#### Returns

`Promise`\<`boolean`\>
