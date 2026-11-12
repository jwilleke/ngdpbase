[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [services/InstallService](../README.md) / PartialInstallationState

# Interface: PartialInstallationState

Defined in: src/services/InstallService.ts:80

Partial installation state: a custom config written without the marker, left
by an earlier attempt or put there by the operator (#1410). The bootstrap
admin and the placeholder anchor organization (#1027) are not steps: both
exist from the first start.

## Properties

### isPartial

> __isPartial__: `boolean`

Defined in: src/services/InstallService.ts:81

***

### steps

> __steps__: `object`

Defined in: src/services/InstallService.ts:82

#### configWritten?

> `optional` __configWritten?__: `boolean`
