[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/resolveListenPort](../README.md) / resolveListenPort

# Function: resolveListenPort()

> __resolveListenPort__(`env`, `config`): `number`

Defined in: src/utils/resolveListenPort.ts:75

Resolve the listen port from the environment and parsed configuration.

## Parameters

### env

`Record`\<`string`, `string` \| `undefined`\>

Environment to read, normally `process.env`. Passed in so the
  resolver stays pure and testable.

### config

`Record`\<`string`, `unknown`\> \| `null` \| `undefined`

Parsed configuration object, or null when none could be
  loaded. A value still containing an unexpanded `${VAR}` placeholder fails
  the digits-only check and is skipped — nothing has run `resolveEnvRef` at
  this point in the boot.

## Returns

`number`
