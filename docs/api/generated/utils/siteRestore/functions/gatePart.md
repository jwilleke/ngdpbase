[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/siteRestore](../README.md) / gatePart

# Function: gatePart()

> __gatePart__(`file`, `manager`): [`PartGate`](../type-aliases/PartGate.md)

Defined in: src/utils/siteRestore.ts:198

Whether `manager`'s part of a site restore is to be applied now. `none`:
there is no site restore, or it has no part for this manager, or that part
is done. `apply`: the restore is committed and every part still pending has
its staged files. `set-aside`: it isn't, and the set is marked refused.

## Parameters

### file

`string`

### manager

`string`

## Returns

[`PartGate`](../type-aliases/PartGate.md)
