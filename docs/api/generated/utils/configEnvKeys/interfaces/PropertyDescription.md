[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/configEnvKeys](../README.md) / PropertyDescription

# Interface: PropertyDescription

Defined in: src/utils/configEnvKeys.ts:35

## Properties

### effective

> __effective__: `unknown`

Defined in: src/utils/configEnvKeys.ts:41

The value actually in force right now.

***

### envControlled

> __envControlled__: `boolean`

Defined in: src/utils/configEnvKeys.ts:37

Whether this key is declared env-owned. Independent of whether the variable is set.

***

### envVar

> __envVar__: `string` \| `null`

Defined in: src/utils/configEnvKeys.ts:39

The variable that owns it, or null when not env-owned.

***

### source

> __source__: `"config"` \| `"env"`

Defined in: src/utils/configEnvKeys.ts:43

Where `effective` came from.
