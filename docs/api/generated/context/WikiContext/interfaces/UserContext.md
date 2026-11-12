[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/WikiContext](../README.md) / UserContext

# Interface: UserContext

Defined in: src/context/WikiContext.ts:66

User context - session or authentication context

## Extends

- [`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md)

## Indexable

> \[`key`: `string`\]: `unknown`

Additional user context data

## Properties

### aalCap?

> `optional` __aalCap?__: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

Defined in: src/managers/UserManager.ts:210

The highest level this account's allowed sign-in methods can reach, at
least 1 (#1690). A role's required level never exceeds it: an account
with no way to reach AAL2 holds its roles at AAL1. Set where the request
subject is built, beside `signIn` — under `viaProxy`, the actor's
account's cap, since it is the actor who signs in (#1762).

#### Inherited from

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md).[`aalCap`](../../../managers/UserManager/interfaces/PermissionSubject.md#aalcap)

***

### authenticated?

> `optional` __authenticated?__: `boolean`

Defined in: src/context/WikiContext.ts:79

Alias for isAuthenticated (legacy templates)

***

### bearerWithoutLevel?

> `optional` __bearerWithoutLevel?__: `true`

Defined in: src/managers/UserManager.ts:216

Set by the bearer middleware on a subject authenticated by a JWT that
records no sign-in level (Authentik, #2287): its `subject:aal` is missing,
not AAL 1. Set from the verified result, never from a request field.

#### Inherited from

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md).[`bearerWithoutLevel`](../../../managers/UserManager/interfaces/PermissionSubject.md#bearerwithoutlevel)

***

### displayName?

> `optional` __displayName?__: `string`

Defined in: src/context/WikiContext.ts:77

User display name

***

### ipAddress?

> `optional` __ipAddress?__: `string`

Defined in: src/managers/UserManager.ts:187

The address the request came from (#1179) — provenance for the record, set where the request subject is built.

#### Inherited from

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md).[`ipAddress`](../../../managers/UserManager/interfaces/PermissionSubject.md#ipaddress)

***

### isAuthenticated

> __isAuthenticated__: `boolean`

Defined in: src/managers/UserManager.ts:175

#### Inherited from

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md).[`isAuthenticated`](../../../managers/UserManager/interfaces/PermissionSubject.md#isauthenticated)

***

### isTest?

> `optional` __isTest?__: `boolean`

Defined in: src/context/WikiContext.ts:90

A test account (#1805), from the account record. An attribute for the host
and its add-ons to enforce their own rules from; no policy reads it.

***

### locale?

> `optional` __locale?__: `string`

Defined in: src/context/WikiContext.ts:83

Shorthand for preferences.locale

***

### preferences?

> `optional` __preferences?__: [`UserPreferences`](UserPreferences.md)

Defined in: src/context/WikiContext.ts:81

User preferences for formatting, locale, etc.

***

### privateStoreHandle?

> `optional` __privateStoreHandle?__: `string`

Defined in: src/managers/UserManager.ts:194

Opaque handle to this session's unlocked private-store keys (#1382).
Random — not the session id — created at password login and dropped at
logout; resolved live, so after logout it reaches nothing. Set only where
the request subject is built; never recorded (`actorOf` must not gain it).

#### Inherited from

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md).[`privateStoreHandle`](../../../managers/UserManager/interfaces/PermissionSubject.md#privatestorehandle)

***

### roles

> __roles__: `string`[]

Defined in: src/managers/UserManager.ts:174

#### Inherited from

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md).[`roles`](../../../managers/UserManager/interfaces/PermissionSubject.md#roles)

***

### signIn?

> `optional` __signIn?__: [`SignInRecord`](../../../managers/AuthManager/interfaces/SignInRecord.md)

Defined in: src/managers/UserManager.ts:202

How and when this session signed in (#1525, #1635): the factors and when
each was last satisfied. Set only where the request subject is built from
the session, so the PDP can decide a step-up permission itself — the door
decides, not the route in front of it. Never recorded. Under `viaProxy`
it is the actor's: the proxy's own fresh sign-in is what counts (#1762).

#### Inherited from

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md).[`signIn`](../../../managers/UserManager/interfaces/PermissionSubject.md#signin)

***

### timezone?

> `optional` __timezone?__: `string`

Defined in: src/context/WikiContext.ts:85

Shorthand for preferences.timezone

***

### username

> __username__: `string`

Defined in: src/managers/UserManager.ts:173

#### Inherited from

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md).[`username`](../../../managers/UserManager/interfaces/PermissionSubject.md#username)

***

### viaProxy?

> `optional` __viaProxy?__: [`ProxyClaim`](../../../managers/UserManager/interfaces/ProxyClaim.md)

Defined in: src/managers/UserManager.ts:185

Present only when someone is acting for this subject's person under a
proxy grant (#1762). Forwarded like `viaToken`; never combined with a
token or a share (the PDP refuses a subject carrying both).

#### Inherited from

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md).[`viaProxy`](../../../managers/UserManager/interfaces/PermissionSubject.md#viaproxy)

***

### viaShare?

> `optional` __viaShare?__: [`ShareGrant`](../../../types/Share/interfaces/ShareGrant.md)

Defined in: src/managers/UserManager.ts:179

Present only when the request presented a share token (#1222). Forwarded like `viaToken`.

#### Inherited from

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md).[`viaShare`](../../../managers/UserManager/interfaces/PermissionSubject.md#viashare)

***

### viaToken?

> `optional` __viaToken?__: [`AgentTokenGrant`](../../../managers/UserManager/interfaces/AgentTokenGrant.md)

Defined in: src/managers/UserManager.ts:177

Present only when the request authenticated with an agent token.

#### Inherited from

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md).[`viaToken`](../../../managers/UserManager/interfaces/PermissionSubject.md#viatoken)
