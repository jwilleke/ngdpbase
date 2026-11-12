[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/redactSecrets](../README.md) / SecretConfigReader

# Interface: SecretConfigReader

Defined in: src/utils/redactSecrets.ts:90

Minimal shape needed from ConfigurationManager, to avoid importing it — that
import is the bootstrap cycle this module exists on the far side of. Matches
`ConfigurationManager.getProperty(key, defaultValue?): unknown` exactly; a
generic signature here would not accept the real manager.

## Methods

### getProperty()

> __getProperty__(`key`, `defaultValue?`): `unknown`

Defined in: src/utils/redactSecrets.ts:91

#### Parameters

##### key

`string`

##### defaultValue?

`unknown`

#### Returns

`unknown`
