[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Asset](../README.md) / ProviderHealthStatus

# Type Alias: ProviderHealthStatus

> __ProviderHealthStatus__ = `"healthy"` \| `"degraded"` \| `"unknown"`

Defined in: src/types/Asset.ts:367

Health status of a registered AssetProvider as last reported by healthCheck().

- 'healthy'  — healthCheck() returned true (or provider has no healthCheck)
- 'degraded' — healthCheck() returned false or threw (storage unreachable)
- 'unknown'  — healthCheck() has not been run yet
