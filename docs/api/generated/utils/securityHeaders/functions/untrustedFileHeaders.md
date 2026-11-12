[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/securityHeaders](../README.md) / untrustedFileHeaders

# Function: untrustedFileHeaders()

> __untrustedFileHeaders__(`contentType`): `Record`\<`string`, `string`\>

Defined in: src/utils/securityHeaders.ts:64

Headers for serving a file someone uploaded (#1624). `sandbox` lets the
browser display it — an SVG still draws and animates, an HTML file still
renders — but no script inside it runs and it gets a unique origin, so it
cannot act as the site. PDF is the exception: Chrome refuses to open a PDF
in a sandboxed document, and its viewer does not run in the site's origin.

## Parameters

### contentType

`string`

## Returns

`Record`\<`string`, `string`\>
