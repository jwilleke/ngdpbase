[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/ncmNotify](../README.md) / notifyNcmConversion

# Function: notifyNcmConversion()

> __notifyNcmConversion__(`engine`, `source`, `target`, `warnings`): `void`

Defined in: src/utils/ncmNotify.ts:31

Push an admin notification summarising NCM conversion warnings.
No-op when there are no warnings or NotificationManager is unavailable.

## Parameters

### engine

`EngineLike`

Wiki engine (structural — just needs getManager)

### source

`string`

Human label for the path, e.g. "Import jspwiki", "MCP create_page"

### target

`string`

The page/file that was converted

### warnings

`string`[]

Flattened `"kind: detail"` strings

## Returns

`void`
