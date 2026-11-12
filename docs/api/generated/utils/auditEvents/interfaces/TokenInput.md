[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / TokenInput

# Interface: TokenInput

Defined in: src/utils/auditEvents.ts:162

## Extends

- `CommonInput`

## Properties

### aal?

> `optional` __aal?__: `1` \| `2` \| `3`

Defined in: src/utils/auditEvents.ts:181

Only meaningful for `mint` (#2287): the sign-in level stored with the token; absent when it stored none.

***

### expiresAt?

> `optional` __expiresAt?__: `string`

Defined in: src/utils/auditEvents.ts:175

The expiry granted: meaningful for `mint` and `extend`; ignored otherwise.

***

### id

> __id__: `string`

Defined in: src/utils/auditEvents.ts:165

Token id — the handle every later question about this credential uses.

***

### ipAddress

> __ipAddress__: `string` \| `undefined`

Defined in: src/utils/auditEvents.ts:130

#### Inherited from

`CommonInput.ipAddress`

***

### name?

> `optional` __name?__: `string` \| `null`

Defined in: src/utils/auditEvents.ts:171

Operator-supplied label. Optional; a token need not be named.

***

### op

> __op__: [`TokenOp`](../type-aliases/TokenOp.md)

Defined in: src/utils/auditEvents.ts:163

***

### owner

> __owner__: `string`

Defined in: src/utils/auditEvents.ts:167

Whose token it is, which is not always who acted (an admin may revoke): their identity

#### Id

(#2041), or a name with no account as given.

***

### ownerUser?

> `optional` __ownerUser?__: `string`

Defined in: src/utils/auditEvents.ts:169

The token owner's username, written beside `owner` (#2041) so the rows still list after the account is deleted.

***

### previousExpiresAt?

> `optional` __previousExpiresAt?__: `string`

Defined in: src/utils/auditEvents.ts:177

The expiry before an `extend` (#1734); ignored otherwise.

***

### revokedBy?

> `optional` __revokedBy?__: `string`

Defined in: src/utils/auditEvents.ts:179

Only meaningful for `revoke`; ignored otherwise.

***

### scopes?

> `optional` __scopes?__: readonly `string`[]

Defined in: src/utils/auditEvents.ts:173

Only meaningful for `mint`; ignored otherwise.

***

### username

> __username__: `string` \| `undefined`

Defined in: src/utils/auditEvents.ts:129

#### Inherited from

`CommonInput.username`

***

### viaProxy?

> `optional` __viaProxy?__: [`ProxyClaim`](../../../managers/UserManager/interfaces/ProxyClaim.md) \| `null`

Defined in: src/utils/auditEvents.ts:137

The proxy grant the request acted under (#1762 slice 3). Forwarded from the
caller's context beside `viaToken`, never rebuilt: the row then names the
represented person in `user` and the person who acted in `actor`.

#### Inherited from

`CommonInput.viaProxy`

***

### viaToken?

> `optional` __viaToken?__: [`AuditViaToken`](AuditViaToken.md) \| `null`

Defined in: src/utils/auditEvents.ts:131

#### Inherited from

`CommonInput.viaToken`
