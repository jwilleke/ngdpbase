[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sensitiveValues](../README.md) / levelOf

# Function: levelOf()

> __levelOf__(`key`, `levels`, `value?`): [`ValueLevel`](../type-aliases/ValueLevel.md) \| `null`

Defined in: src/utils/sensitiveValues.ts:138

A value's level: as declared, else `secret` when the key's name looks like
one and the value is a string. A boolean or number can't be a secret, so
`ngdpbase.auth.password.enabled` stays visible; only a declared entry hides
whatever its type.

## Parameters

### key

`string`

### levels

`Map`\<`string`, [`ValueLevel`](../type-aliases/ValueLevel.md)\>

### value?

`unknown`

## Returns

[`ValueLevel`](../type-aliases/ValueLevel.md) \| `null`
