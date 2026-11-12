[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/instanceEnvBackup](../README.md) / envFileLine

# Function: envFileLine()

> __envFileLine__(`name`, `value`): `string`

Defined in: src/utils/instanceEnvBackup.ts:59

One `.env` line setting `name` to `value` (#2134): unquoted, or quoted only
when it must be, so the boot's reader (`dotenv.parse`) reads `value` back
exactly. Throws for a value no single line can carry.

## Parameters

### name

`string`

### value

`string`

## Returns

`string`
