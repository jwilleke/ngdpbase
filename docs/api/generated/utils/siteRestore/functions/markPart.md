[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/siteRestore](../README.md) / markPart

# Function: markPart()

> __markPart__(`file`, `manager`, `status`, `note?`): `void`

Defined in: src/utils/siteRestore.ts:241

Record what became of `manager`'s part. A part set aside refuses the rest
of the set. When every part is done the manifest becomes `<file>.done`.

## Parameters

### file

`string`

### manager

`string`

### status

`"applied"` \| `"set-aside"`

### note?

`string`

## Returns

`void`
