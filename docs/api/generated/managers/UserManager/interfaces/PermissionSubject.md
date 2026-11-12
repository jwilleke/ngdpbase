[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/UserManager](../README.md) / PermissionSubject

# Interface: PermissionSubject

Defined in: src/managers/UserManager.ts:172

Who a permission check is about.

__Forward the context you were given; do not rebuild one.__ `viaToken` is
optional because an ordinary session request has none — which means the type
cannot force you to carry it. Rebuilding a subject from parts therefore still
compiles, and still drops the ceiling. What stops that is
`scripts/check-permission-subject.ts`, not the compiler.

## Extended by

- [`UserContext`](../../../context/WikiContext/interfaces/UserContext.md)
- [`UserContext`](../../../parsers/context/ParseContext/interfaces/UserContext.md)

## Properties

### aalCap?

> `optional` __aalCap?__: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

Defined in: src/managers/UserManager.ts:210

The highest level this account's allowed sign-in methods can reach, at
least 1 (#1690). A role's required level never exceeds it: an account
with no way to reach AAL2 holds its roles at AAL1. Set where the request
subject is built, beside `signIn` — under `viaProxy`, the actor's
account's cap, since it is the actor who signs in (#1762).

***

### bearerWithoutLevel?

> `optional` __bearerWithoutLevel?__: `true`

Defined in: src/managers/UserManager.ts:216

Set by the bearer middleware on a subject authenticated by a JWT that
records no sign-in level (Authentik, #2287): its `subject:aal` is missing,
not AAL 1. Set from the verified result, never from a request field.

***

### ipAddress?

> `optional` __ipAddress?__: `string`

Defined in: src/managers/UserManager.ts:187

The address the request came from (#1179) — provenance for the record, set where the request subject is built.

***

### isAuthenticated

> __isAuthenticated__: `boolean`

Defined in: src/managers/UserManager.ts:175

***

### privateStoreHandle?

> `optional` __privateStoreHandle?__: `string`

Defined in: src/managers/UserManager.ts:194

Opaque handle to this session's unlocked private-store keys (#1382).
Random — not the session id — created at password login and dropped at
logout; resolved live, so after logout it reaches nothing. Set only where
the request subject is built; never recorded (`actorOf` must not gain it).

***

### roles

> __roles__: `string`[]

Defined in: src/managers/UserManager.ts:174

***

### signIn?

> `optional` __signIn?__: [`SignInRecord`](../../AuthManager/interfaces/SignInRecord.md)

Defined in: src/managers/UserManager.ts:202

How and when this session signed in (#1525, #1635): the factors and when
each was last satisfied. Set only where the request subject is built from
the session, so the PDP can decide a step-up permission itself — the door
decides, not the route in front of it. Never recorded. Under `viaProxy`
it is the actor's: the proxy's own fresh sign-in is what counts (#1762).

***

### username

> __username__: `string`

Defined in: src/managers/UserManager.ts:173

***

### viaProxy?

> `optional` __viaProxy?__: [`ProxyClaim`](ProxyClaim.md)

Defined in: src/managers/UserManager.ts:185

Present only when someone is acting for this subject's person under a
proxy grant (#1762). Forwarded like `viaToken`; never combined with a
token or a share (the PDP refuses a subject carrying both).

***

### viaShare?

> `optional` __viaShare?__: [`ShareGrant`](../../../types/Share/interfaces/ShareGrant.md)

Defined in: src/managers/UserManager.ts:179

Present only when the request presented a share token (#1222). Forwarded like `viaToken`.

***

### viaToken?

> `optional` __viaToken?__: [`AgentTokenGrant`](AgentTokenGrant.md)

Defined in: src/managers/UserManager.ts:177

Present only when the request authenticated with an agent token.
