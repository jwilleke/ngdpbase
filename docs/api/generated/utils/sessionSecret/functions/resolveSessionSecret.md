[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionSecret](../README.md) / resolveSessionSecret

# Function: resolveSessionSecret()

> __resolveSessionSecret__(`env`): `string`

Defined in: src/utils/sessionSecret.ts:78

Return the session secret the process must use, or throw.

## Parameters

### env

`Readonly`\<`Record`\<`string`, `string` \| `undefined`\>\>

Normally `process.env`. Injected so the guard is testable
  without mutating the real environment.

## Returns

`string`

## Throws

When the variable is unset, blank, or one of the known placeholders.
