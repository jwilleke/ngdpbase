[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuthProvider](../README.md) / ViaToken

# Interface: ViaToken

Defined in: src/providers/BaseAuthProvider.ts:70

Identity and authority of a delegated agent token (#946).

Roles are deliberately absent: they are resolved live from the user record,
so a token never carries a snapshot of authority that could outlive a change
to the account.

## Properties

### aal?

> `optional` __aal?__: `1` \| `2` \| `3`

Defined in: src/providers/BaseAuthProvider.ts:78

The assurance level stored with the token when it was made (#2261); absent on an older token.

***

### id

> __id__: `string`

Defined in: src/providers/BaseAuthProvider.ts:72

Token record id

***

### name

> __name__: `string`

Defined in: src/providers/BaseAuthProvider.ts:74

Human-readable token name, used in logs and page provenance

***

### scopes

> __scopes__: `string`[]

Defined in: src/providers/BaseAuthProvider.ts:76

Scope ceiling this token may act within
