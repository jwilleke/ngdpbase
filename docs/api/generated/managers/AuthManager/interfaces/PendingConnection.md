[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / PendingConnection

# Interface: PendingConnection

Defined in: src/managers/AuthManager.ts:600

A verified outside identity no account has connected, held in the session
until the person signs in another way and confirms it (#1743 slice 3). One
at a time; a new one replaces the old. `email` is the provider's verified
email, or ''.

## Properties

### displayName

> __displayName__: `string`

Defined in: src/managers/AuthManager.ts:606

The provider's name, for the notice.

***

### email

> __email__: `string`

Defined in: src/managers/AuthManager.ts:604

***

### expiresAt

> __expiresAt__: `number`

Defined in: src/managers/AuthManager.ts:608

Epoch ms.

***

### providerId

> __providerId__: `string`

Defined in: src/managers/AuthManager.ts:601

***

### returnTo?

> `optional` __returnTo?__: `string`

Defined in: src/managers/AuthManager.ts:610

Where the sign-in that follows was going; a declined connection goes there.

***

### subject

> __subject__: `string`

Defined in: src/managers/AuthManager.ts:603

`${iss}#${sub}`
