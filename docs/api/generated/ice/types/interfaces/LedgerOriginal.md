[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / LedgerOriginal

# Interface: LedgerOriginal

Defined in: src/ice/types.ts:610

A kept original as the ledger remembers it, with the door that kept it
(a receiver's own `keepOriginal`, or `core.files`). A later run of the same
fingerprint through the same door reuses it instead of keeping another copy.

## Extends

- [`KeptOriginal`](KeptOriginal.md)

## Properties

### door

> __door__: `string`

Defined in: src/ice/types.ts:611

***

### name

> __name__: `string`

Defined in: src/ice/types.ts:288

#### Inherited from

[`KeptOriginal`](KeptOriginal.md).[`name`](KeptOriginal.md#name)

***

### ref

> __ref__: `string`

Defined in: src/ice/types.ts:291

The keeping door's own reference: an attachment id, a record id.

#### Inherited from

[`KeptOriginal`](KeptOriginal.md).[`ref`](KeptOriginal.md#ref)

***

### sha256

> __sha256__: `string`

Defined in: src/ice/types.ts:289

#### Inherited from

[`KeptOriginal`](KeptOriginal.md).[`sha256`](KeptOriginal.md#sha256)
