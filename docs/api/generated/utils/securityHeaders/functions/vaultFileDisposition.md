[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/securityHeaders](../README.md) / vaultFileDisposition

# Function: vaultFileDisposition()

> __vaultFileDisposition__(`fileName`, `download`): `Record`\<`string`, `string`\>

Defined in: src/utils/securityHeaders.ts:74

How a vault file is served (#2061): inline, so a picture on a private page
still shows, unless it is marked a download (an import's kept original):
then always `attachment` with `nosniff`, whatever the site's header mode,
so a kept file never runs as a page. The name is made safe for the header.

## Parameters

### fileName

`string`

### download

`boolean`

## Returns

`Record`\<`string`, `string`\>
