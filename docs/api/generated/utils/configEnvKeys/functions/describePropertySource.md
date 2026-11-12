[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/configEnvKeys](../README.md) / describePropertySource

# Function: describePropertySource()

> __describePropertySource__(`key`, `envKeys`, `env`, `configValue`): [`PropertyDescription`](../interfaces/PropertyDescription.md)

Defined in: src/utils/configEnvKeys.ts:86

Describe where a config key's value comes from.

## Parameters

### key

`string`

The config key.

### envKeys

[`EnvKeyMap`](../type-aliases/EnvKeyMap.md) \| `null` \| `undefined`

The declared map, or null when unavailable.

### env

`Record`\<`string`, `string` \| `undefined`\>

Environment to read, normally `process.env`. Injected so this
  stays pure and testable.

### configValue

`unknown`

The merged config value, used both as the fallback and
  as the type to coerce an environment value to.

## Returns

[`PropertyDescription`](../interfaces/PropertyDescription.md)
