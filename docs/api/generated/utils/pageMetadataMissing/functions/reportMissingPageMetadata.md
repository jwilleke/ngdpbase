[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageMetadataMissing](../README.md) / reportMissingPageMetadata

# Function: reportMissingPageMetadata()

> __reportMissingPageMetadata__(`engine`, `pageName`, `action`, `requestedBy`): `Promise`\<`void`\>

Defined in: src/utils/pageMetadataMissing.ts:75

Log the damage and notify administrators, once per page.

Never throws: it runs on the way to rendering a 500, and a failure to notify
must not replace the error page the reader was about to get. A notification
that cannot be sent is logged, which is still loud.

## Parameters

### engine

`EngineLike`

### pageName

`string`

### action

`string`

### requestedBy

`string` \| `undefined`

## Returns

`Promise`\<`void`\>
