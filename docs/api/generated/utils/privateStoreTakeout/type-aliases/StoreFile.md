[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreTakeout](../README.md) / StoreFile

# Type Alias: StoreFile

> __StoreFile__ = `object`

Defined in: src/utils/privateStoreTakeout.ts:45

One file of a store, exactly as it sits on disk.

## Properties

### bytes

> __bytes__: `Buffer`

Defined in: src/utils/privateStoreTakeout.ts:49

The file's bytes. Ciphertext stays ciphertext.

***

### mtime

> __mtime__: `Date`

Defined in: src/utils/privateStoreTakeout.ts:51

Last-modified time, so a restore can preserve it.

***

### path

> __path__: `string`

Defined in: src/utils/privateStoreTakeout.ts:47

Path relative to what was walked, with `/` separators on every platform.
