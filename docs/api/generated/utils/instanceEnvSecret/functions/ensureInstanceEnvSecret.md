[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/instanceEnvSecret](../README.md) / ensureInstanceEnvSecret

# Function: ensureInstanceEnvSecret()

> __ensureInstanceEnvSecret__(`spec`, `env`, `instanceDataDir`, `fs`): `object`

Defined in: src/utils/instanceEnvSecret.ts:47

## Parameters

### spec

[`InstanceEnvSecretSpec`](../interfaces/InstanceEnvSecretSpec.md)

### env

`Readonly`\<`Record`\<`string`, `string` \| `undefined`\>\>

### instanceDataDir

`string`

### fs

[`InstanceEnvFs`](../interfaces/InstanceEnvFs.md)

## Returns

`object`

### origin

> __origin__: [`InstanceEnvSecretOrigin`](../type-aliases/InstanceEnvSecretOrigin.md)

### secret

> __secret__: `string`
