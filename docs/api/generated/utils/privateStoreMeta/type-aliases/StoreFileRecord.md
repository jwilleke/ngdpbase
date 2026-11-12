[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreMeta](../README.md) / StoreFileRecord

# Type Alias: StoreFileRecord

> __StoreFileRecord__ = [`StoreKeyRecord`](../../privateStoreCrypto/type-aliases/StoreKeyRecord.md) & `object`

Defined in: src/utils/privateStoreMeta.ts:168

`store.json` as the door writes it (#1414, docs/private-stores.md,
"`store.json` shape"): the kind this copy was created under, whether this
copy is sealed, when the user walked through the door, and the wrapped DEK
when it is sealed. Per-user state and key material only — never policy.

## Type Declaration

### created?

> `optional` __created?__: `string`

### kind?

> `optional` __kind?__: `string`
