[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceArchiveView

# Interface: IceArchiveView

Defined in: src/ice/types.ts:84

The archive a file was unpacked from (#2118): this file's own path in it,
and every member, read only. Paths are the archive's own, `/`-separated.
Never part of an item's key: what an item is, is its content.

## Properties

### name

> __name__: `string`

Defined in: src/ice/types.ts:86

The archive's name, as the file's `name` begins: `takeout.zip`.

***

### path

> __path__: `string`

Defined in: src/ice/types.ts:88

This file's path within the archive.

***

### paths

> __paths__: readonly `string`[]

Defined in: src/ice/types.ts:90

Every member's path, in the archive's order.

## Methods

### read()

> __read__(`memberPath`): `Buffer`\<`ArrayBufferLike`\> \| `undefined`

Defined in: src/ice/types.ts:92

A member's bytes, or undefined when there is no such member.

#### Parameters

##### memberPath

`string`

#### Returns

`Buffer`\<`ArrayBufferLike`\> \| `undefined`
