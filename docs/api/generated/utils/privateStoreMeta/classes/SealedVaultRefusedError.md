[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreMeta](../README.md) / SealedVaultRefusedError

# Class: SealedVaultRefusedError

Defined in: src/utils/privateStoreMeta.ts:116

A read or write refused because the vault's kind is sealed and the vault
is not (#1834). Never answered with plain I/O: the bytes would be clear on
disk under a kind that says they are sealed.

## Extends

- `Error`

## Constructors

### Constructor

> __new SealedVaultRefusedError__(`owner`, `store`, `reason`): `SealedVaultRefusedError`

Defined in: src/utils/privateStoreMeta.ts:118

#### Parameters

##### owner

`string`

##### store

`string`

##### reason

`"unopened"` \| `"mismatch"`

#### Returns

`SealedVaultRefusedError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` __code__: `"sealed-vault-refused"` = `'sealed-vault-refused'`

Defined in: src/utils/privateStoreMeta.ts:117

***

### owner

> `readonly` __owner__: `string`

Defined in: src/utils/privateStoreMeta.ts:119

***

### reason

> `readonly` __reason__: `"unopened"` \| `"mismatch"`

Defined in: src/utils/privateStoreMeta.ts:121

***

### store

> `readonly` __store__: `string`

Defined in: src/utils/privateStoreMeta.ts:120
