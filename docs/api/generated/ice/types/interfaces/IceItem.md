[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceItem

# Interface: IceItem

Defined in: src/ice/types.ts:51

One piece of content: a file the engine read, or what a shim produced from
it. A shim's output becomes the next shim's input, or a receiver's.

## Properties

### archive?

> `optional` __archive?__: [`IceArchiveView`](IceArchiveView.md)

Defined in: src/ice/types.ts:76

The archive the file was unpacked from (#2118), when it was: what lies
beside it, for a shim whose format spans the files of an archive (a
takeout's pages link to its files by the ids its file index names).
The engine still hands each file to the shims on its own.

***

### bytes?

> `optional` __bytes?__: `Buffer`\<`ArrayBufferLike`\>

Defined in: src/ice/types.ts:57

Raw bytes (a `file`, or binary output).

***

### data?

> `optional` __data?__: `unknown`

Defined in: src/ice/types.ts:61

A structured record, for record kinds such as health records.

***

### itemKey?

> `optional` __itemKey?__: `string`

Defined in: src/ice/types.ts:69

The item's own id or time, for a shim whose duplicates are per item
(a feed entry): an item whose key the engine has seen before is skipped.

***

### kind

> __kind__: `string`

Defined in: src/ice/types.ts:52

***

### mediaType?

> `optional` __mediaType?__: `string`

Defined in: src/ice/types.ts:55

***

### metadata?

> `optional` __metadata?__: `Record`\<`string`, `unknown`\>

Defined in: src/ice/types.ts:63

Facts about the content: a title, an author, a source system's id.

***

### name

> __name__: `string`

Defined in: src/ice/types.ts:54

The name it arrived under: the upload's file name, or `archive.zip/inner/path`.

***

### text?

> `optional` __text?__: `string`

Defined in: src/ice/types.ts:59

Text content (`html`, `ncm`, an XML document).

***

### warnings?

> `optional` __warnings?__: [`IceWarning`](IceWarning.md)[]

Defined in: src/ice/types.ts:64
