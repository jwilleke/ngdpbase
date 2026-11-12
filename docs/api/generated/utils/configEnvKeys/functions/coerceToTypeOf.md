[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/configEnvKeys](../README.md) / coerceToTypeOf

# Function: coerceToTypeOf()

> __coerceToTypeOf__(`value`, `defaultValue`): `unknown`

Defined in: src/utils/configEnvKeys.ts:61

Coerce an environment value to the type of the shipped default.

Environment values are always strings, but the rest of the code expects the
declared type — `ngdpbase.server.port` is `number` in `src/types/Config.ts`
and ships as `3000`, so `NGDPBASE_PORT=3001` must not arrive as `"3001"` and
quietly fail an arithmetic comparison somewhere downstream.

Using the default's own type rather than a per-key table means there is one
rule and nothing to keep in sync as keys are added.

When the value cannot be coerced — a non-numeric string against a numeric
default — the raw string is returned. Handing the caller something visibly
wrong beats handing them a silent `NaN`.

## Parameters

### value

`string`

### defaultValue

`unknown`

## Returns

`unknown`
