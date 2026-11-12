[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/UserManager](../README.md) / ProxyClaim

# Interface: ProxyClaim

Defined in: src/managers/UserManager.ts:106

A person acting for another under a proxy grant (#1762 slice 2), as a
subject carries it. The subject's `username` and `roles` are the person
REPRESENTED; this names who is actually acting and under which grant.

The PDP re-reads the grant on every decision (`AuthManager.liveProxyGrant`)
— nothing here is trusted beyond naming it — and bounds the action by the
grant's permissions and by what `actor` holds, live. A proxy is not a
delegated credential for step-up: the actor's own fresh sign-in counts, so
the subject's `signIn` and `aalCap` are the ACTOR's (the session's).

`kind: 'impersonation'` is reserved for #1763 "view as"; nothing admits it
yet, so a subject carrying it is refused everywhere.

## Properties

### actor

> __actor__: `string`

Defined in: src/managers/UserManager.ts:111

Who is acting: the grant's proxy.

***

### grantId

> __grantId__: `string`

Defined in: src/managers/UserManager.ts:109

The grant's id in the credentials store.

***

### keyHandle?

> `optional` __keyHandle?__: `string`

Defined in: src/managers/UserManager.ts:120

The actor's OWN private-store handle (#1762 slice 5): where a key copy
opened under this grant is held (`privateStoreUnlock.openKeyCopy`). It
reaches only that copy — never the actor's own keys — and only while the
copy was opened for this grant and this represented person (`dekFor`).

***

### kind

> __kind__: `"proxy"` \| `"impersonation"`

Defined in: src/managers/UserManager.ts:107

***

### scopes

> __scopes__: `string`[]

Defined in: src/managers/UserManager.ts:113

The grant's permissions as the subject was built with them; the live grant must still carry every one.
