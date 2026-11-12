[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/PasskeyAuthProvider](../README.md) / PasskeySecret

# Interface: PasskeySecret

Defined in: src/providers/PasskeyAuthProvider.ts:37

What a passkey row's `secret` holds. Public material only.

## Properties

### backedUp

> __backedUp__: `boolean`

Defined in: src/providers/PasskeyAuthProvider.ts:43

***

### counter

> __counter__: `number`

Defined in: src/providers/PasskeyAuthProvider.ts:39

***

### deviceType

> __deviceType__: `"singleDevice"` \| `"multiDevice"`

Defined in: src/providers/PasskeyAuthProvider.ts:42

***

### publicKey

> __publicKey__: `string`

Defined in: src/providers/PasskeyAuthProvider.ts:38

***

### transports?

> `optional` __transports?__: `string`[]

Defined in: src/providers/PasskeyAuthProvider.ts:41

As the authenticator reported them; v14 types transports as plain strings.
