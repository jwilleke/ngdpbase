[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Share](../README.md) / ShareGrant

# Interface: ShareGrant

Defined in: src/types/Share.ts:74

What a request that presented a share token carries (#1222, epic #1225).

The share-side twin of `AgentTokenGrant`: it rides on `PermissionSubject`
as `viaShare`, and the evaluator applies it as a ceiling — the action must
be one of `actions`, the resource must be covered by `resources`, the share
must not have passed `expiresAt`, and `issuer` must STILL hold the action
when the decision is made. A delegation, not a copy of authority: revoke
the issuer's role and every share they issued stops on the next request.

## Properties

### actions

> __actions__: `string`[]

Defined in: src/types/Share.ts:80

Actions delegated, a subset of what the issuer held at issue.

***

### expiresAt

> __expiresAt__: `string` \| `null`

Defined in: src/types/Share.ts:84

ISO 8601 expiry, or null = until revoked.

***

### id

> __id__: `string`

Defined in: src/types/Share.ts:76

The share's management id — what audit records name.

***

### issuer

> __issuer__: `string`

Defined in: src/types/Share.ts:78

Username of the delegator; resolved live at every decision.

***

### resources

> __resources__: [`ShareResource`](ShareResource.md)[]

Defined in: src/types/Share.ts:82

What the delegation covers.
