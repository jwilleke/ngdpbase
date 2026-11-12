[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sigstoreTrustedRoot](../README.md) / TufDownload

# Type Alias: TufDownload

> __TufDownload__ = (`url`, `maxBytes`) => `Promise`\<\{ `body`: `Buffer`; `status`: `number`; \}\>

Defined in: src/utils/sigstoreTrustedRoot.ts:35

A GET that resolves to the status and body, or throws when the host cannot be reached.

## Parameters

### url

`string`

### maxBytes

`number`

## Returns

`Promise`\<\{ `body`: `Buffer`; `status`: `number`; \}\>
