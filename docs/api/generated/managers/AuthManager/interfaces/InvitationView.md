[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / InvitationView

# Interface: InvitationView

Defined in: src/managers/AuthManager.ts:786

An invitation as an administrator sees it (#2049): never the link or its token.

## Properties

### createdAt

> __createdAt__: `string`

Defined in: src/managers/AuthManager.ts:793

RFC 3339.

***

### createdBy

> __createdBy__: `string`

Defined in: src/managers/AuthManager.ts:791

Who sent it.

***

### expiresAt

> __expiresAt__: `string`

Defined in: src/managers/AuthManager.ts:795

RFC 3339: after this the link does nothing.

***

### id

> __id__: `string`

Defined in: src/managers/AuthManager.ts:787

***

### username

> __username__: `string`

Defined in: src/managers/AuthManager.ts:789

The account invited.
