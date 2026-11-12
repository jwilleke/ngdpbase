[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / PageViewInput

# Interface: PageViewInput

Defined in: src/utils/auditEvents.ts:272

## Extends

- `CommonInput`

## Properties

### ipAddress

> __ipAddress__: `string` \| `undefined`

Defined in: src/utils/auditEvents.ts:130

#### Inherited from

`CommonInput.ipAddress`

***

### pageName

> __pageName__: `string`

Defined in: src/utils/auditEvents.ts:273

***

### username

> __username__: `string` \| `undefined`

Defined in: src/utils/auditEvents.ts:129

#### Inherited from

`CommonInput.username`

***

### uuid

> __uuid__: `string` \| `null` \| `undefined`

Defined in: src/utils/auditEvents.ts:274

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
