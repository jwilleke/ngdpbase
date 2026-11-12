[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [ice/shims/export](../README.md) / withoutRemoteUrls

# Function: withoutRemoteUrls()

> __withoutRemoteUrls__(`html`): `string`

Defined in: src/ice/shims/export.ts:85

The HTML with nothing in it that a renderer would fetch (#2120): only
`data:` URLs are left, in attributes and in CSS. The local renderer
already blocks the network; a remote one (`chrome-service`, Gotenberg)
fetches what the HTML names, from where it runs, so this is done before
the HTML leaves the process. Links (`<a href>`) stay: printing never
follows them.

## Parameters

### html

`string`

## Returns

`string`
