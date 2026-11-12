[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / ConnectedIdentity

# Interface: ConnectedIdentity

Defined in: src/managers/AuthManager.ts:575

An outside identity connected to an account, as shown to its owner (#1743).

## Properties

### createdAt

> __createdAt__: `string`

Defined in: src/managers/AuthManager.ts:582

***

### email

> __email__: `string`

Defined in: src/managers/AuthManager.ts:581

The provider's verified email, '' when it gave none.

***

### id

> __id__: `string`

Defined in: src/managers/AuthManager.ts:577

The credential row's id — what Disconnect removes.

***

### label

> __label__: `string`

Defined in: src/managers/AuthManager.ts:579

What the provider was called when it was connected.

***

### lastUsedAt?

> `optional` __lastUsedAt?__: `string`

Defined in: src/managers/AuthManager.ts:583

***

### provider

> __provider__: [`OutsideProvider`](OutsideProvider.md) \| `null`

Defined in: src/managers/AuthManager.ts:585

The provider it came from, while it is configured and enabled; null when it is not, and it cannot sign in.
