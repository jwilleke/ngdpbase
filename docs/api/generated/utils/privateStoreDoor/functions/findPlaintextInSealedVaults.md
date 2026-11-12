[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreDoor](../README.md) / findPlaintextInSealedVaults

# Function: findPlaintextInSealedVaults()

> __findPlaintextInSealedVaults__(`pagesDirectory`, `layout`): `Promise`\<[`PlaintextInSealedVault`](../interfaces/PlaintextInSealedVault.md)[]\>

Defined in: src/utils/privateStoreDoor.ts:200

Every sealed vault (its `store.json` says `encrypt: true`) that holds files
in the clear (#1836): a page's history moved in with `fs.move`, an
attachment adopted without its I/O, a backup restored from before the vault
was sealed. A sealed file starts with the `sealBytes` magic, so each file's
first bytes tell them apart without the key. `store.json` is the one file
that is never sealed; an empty file holds nothing and is not counted.

Read only — nothing is moved, sealed or deleted; what to do with the files
is an administrator's call. Vaults that are not sealed at all are
[findUnsealedVaults](findUnsealedVaults.md)'s.

## Parameters

### pagesDirectory

`string`

### layout

[`PrivateStoreLayout`](../../privateStorePath/type-aliases/PrivateStoreLayout.md)

## Returns

`Promise`\<[`PlaintextInSealedVault`](../interfaces/PlaintextInSealedVault.md)[]\>
