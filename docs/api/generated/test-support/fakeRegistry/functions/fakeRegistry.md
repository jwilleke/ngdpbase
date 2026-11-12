[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [test-support/fakeRegistry](../README.md) / fakeRegistry

# Function: fakeRegistry()

> __fakeRegistry__(`packages`): `object`

Defined in: src/test-support/fakeRegistry.ts:112

A registry holding `packages` (name → version → tarball). `calls` records
every URL asked for; `down` makes every request throw as an unreachable host
does.

## Parameters

### packages

`Record`\<`string`, `Record`\<`string`, [`FakeVersion`](../interfaces/FakeVersion.md)\>\>

## Returns

`object`

### calls

> __calls__: `string`[]

### down

> __down__: `boolean`

### fetch

> __fetch__: [`RegistryFetch`](../../../utils/addonInstaller/type-aliases/RegistryFetch.md)
