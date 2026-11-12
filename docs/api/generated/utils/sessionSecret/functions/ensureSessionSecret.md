[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionSecret](../README.md) / ensureSessionSecret

# Function: ensureSessionSecret()

> __ensureSessionSecret__(`env`, `instanceDataDir`, `fs`): `object`

Defined in: src/utils/sessionSecret.ts:118

Make `NGDPBASE_SESSION_SECRET` true in `env`, generating and backfilling
`<instanceDataDir>/.env` when nothing supplied it (#1194). The rule is
`ensureInstanceEnvSecret`'s; what is particular to the session secret is the
placeholder refusal (`resolveSessionSecret`) and the wording.

## Parameters

### env

`Readonly`\<`Record`\<`string`, `string` \| `undefined`\>\>

### instanceDataDir

`string`

### fs

[`InstanceEnvFs`](../../instanceEnvSecret/interfaces/InstanceEnvFs.md)

## Returns

`object`

The secret and where it came from. The caller sets `env` itself,
  so this function has no side effect on the process beyond the file.

### origin

> __origin__: [`InstanceEnvSecretOrigin`](../../instanceEnvSecret/type-aliases/InstanceEnvSecretOrigin.md)

### secret

> __secret__: `string`
