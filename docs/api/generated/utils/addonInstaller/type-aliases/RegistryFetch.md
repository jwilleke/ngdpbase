[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonInstaller](../README.md) / RegistryFetch

# Type Alias: RegistryFetch

> __RegistryFetch__ = (`url`, `options`) => `Promise`\<\{ `body`: `Buffer`; `status`: `number`; \}\>

Defined in: src/utils/addonInstaller.ts:47

The outbound GET the installer is given. Throws when the host cannot be reached.

## Parameters

### url

`string`

### options

#### accept

`string`

#### maxBytes

`number`

## Returns

`Promise`\<\{ `body`: `Buffer`; `status`: `number`; \}\>
