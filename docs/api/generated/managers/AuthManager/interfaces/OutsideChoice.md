[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / OutsideChoice

# Interface: OutsideChoice

Defined in: src/managers/AuthManager.ts:618

An outside sign-in whose verified email several accounts here share
(#2073): held in the session while the person chooses which account, asked
every time and never remembered (no identity is connected). Single use.

## Properties

### choices

> __choices__: `string`[]

Defined in: src/managers/AuthManager.ts:623

The accounts on that email, by username, when the callback came back.

***

### displayName

> __displayName__: `string`

Defined in: src/managers/AuthManager.ts:625

The provider's name, for the page.

***

### email

> __email__: `string`

Defined in: src/managers/AuthManager.ts:621

The provider's verified email.

***

### expiresAt

> __expiresAt__: `number`

Defined in: src/managers/AuthManager.ts:631

Epoch ms.

***

### providerId

> __providerId__: `string`

Defined in: src/managers/AuthManager.ts:619

***

### reported

> __reported__: [`ReportedAssurance`](../../../providers/BaseAuthProvider/interfaces/ReportedAssurance.md)

Defined in: src/managers/AuthManager.ts:627

What the provider reported about its own sign-in (#1633), kept for the level it counts for.

***

### returnTo

> __returnTo__: `string`

Defined in: src/managers/AuthManager.ts:629

Where the sign-in was going.
