[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runImport](../README.md) / itemKeyOf

# Function: itemKeyOf()

> __itemKeyOf__(`sha256`, `chain`, `item`, `seen`): `string`

Defined in: src/ice/runImport.ts:98

The engine's key for an item of a file it stored, so a retry of that file
skips it (#2010): the file's fingerprint, the chain, and a hash of the
item's content (kind, text, data, bytes). Never its position: a shim that
changes or orders its output differently cannot make a retry skip the
wrong item. `seen` is how many identical items came before it in this file.

## Parameters

### sha256

`string`

### chain

`string`[]

### item

[`IceItem`](../../types/interfaces/IceItem.md)

### seen

`number`

## Returns

`string`
