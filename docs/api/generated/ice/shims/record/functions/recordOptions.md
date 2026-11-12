[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [ice/shims/record](../README.md) / recordOptions

# Function: recordOptions()

> __recordOptions__(`raw`): [`RecordShimOptions`](../interfaces/RecordShimOptions.md)

Defined in: src/ice/shims/record.ts:60

The options as a shim reads them: each of the right type, or absent. The
caller (a feed's configuration) validated its own; this only refuses a
value of the wrong type from anywhere.

## Parameters

### raw

`Record`\<`string`, `unknown`\>

## Returns

[`RecordShimOptions`](../interfaces/RecordShimOptions.md)
