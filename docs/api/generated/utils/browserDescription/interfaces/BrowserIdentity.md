[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/browserDescription](../README.md) / BrowserIdentity

# Interface: BrowserIdentity

Defined in: src/utils/browserDescription.ts:38

# 1523 slice 1c — the browser and operating system a remembered browser's
device key was issued to, from the User-Agent and the `Sec-CH-UA-Platform`
client hint every Chromium browser sends. Families only ("Chrome",
"Windows"), never versions, so an update keeps the browser remembered. No
fingerprinting beyond what each request already carries (operator,
2026-10-04). Null when the browser or the system cannot be told: such a
browser is never remembered.

## Extended by

- [`DeviceSecret`](../../../managers/AuthManager/interfaces/DeviceSecret.md)

## Properties

### browser

> __browser__: `string`

Defined in: src/utils/browserDescription.ts:39

***

### os

> __os__: `string`

Defined in: src/utils/browserDescription.ts:40

***

### platform

> __platform__: `string`

Defined in: src/utils/browserDescription.ts:42

The `Sec-CH-UA-Platform` hint, unquoted; empty when the browser sent none.
