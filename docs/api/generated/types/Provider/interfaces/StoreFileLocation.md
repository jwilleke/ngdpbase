[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / StoreFileLocation

# Interface: StoreFileLocation

Defined in: src/types/Provider.ts:779

A private store as the attachment provider is handed it: whose it is, which
store, and the I/O the caller's key allows (plain, or sealed with the store
DEK). The provider stores and reads; it never decides who may, and never
chooses whether to encrypt — the I/O already carries that.

## Properties

### io

> __io__: [`StoreFileIO`](../../../utils/privateStoreFiles/interfaces/StoreFileIO.md)

Defined in: src/types/Provider.ts:782

***

### owner

> __owner__: `string`

Defined in: src/types/Provider.ts:780

***

### store

> __store__: `string`

Defined in: src/types/Provider.ts:781
