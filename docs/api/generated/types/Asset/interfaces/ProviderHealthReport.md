[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Asset](../README.md) / ProviderHealthReport

# Interface: ProviderHealthReport

Defined in: src/types/Asset.ts:372

Snapshot of a single provider's health, returned by AssetManager.getProviderHealth().

## Properties

### checkedAt?

> `optional` __checkedAt?__: `string`

Defined in: src/types/Asset.ts:380

ISO 8601 timestamp of the last health check, or undefined if never checked

***

### displayName

> __displayName__: `string`

Defined in: src/types/Asset.ts:376

Human-readable provider name

***

### error?

> `optional` __error?__: `string`

Defined in: src/types/Asset.ts:382

Last error message when status is 'degraded'

***

### providerId

> __providerId__: `string`

Defined in: src/types/Asset.ts:374

Provider identifier

***

### status

> __status__: [`ProviderHealthStatus`](../type-aliases/ProviderHealthStatus.md)

Defined in: src/types/Asset.ts:378

Current health status
