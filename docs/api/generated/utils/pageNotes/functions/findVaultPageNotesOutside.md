[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageNotes](../README.md) / findVaultPageNotesOutside

# Function: findVaultPageNotesOutside()

> __findVaultPageNotesOutside__(`roots`): `Promise`\<[`VaultPageNotesOutside`](../interfaces/VaultPageNotesOutside.md)[]\>

Defined in: src/utils/pageNotes.ts:314

Every vault page whose notes of `roots.kind` are in the manager's public
folder rather than in its vault (#1839): written before notes moved into
vaults, in the clear. A page is known by its file name (`{uuid}.md`), so the
check needs no key and reads no page. Read only: nothing is moved, sealed or
deleted; an administrator decides what to do with the files.

## Parameters

### roots

[`PageNotesRoots`](../interfaces/PageNotesRoots.md)

## Returns

`Promise`\<[`VaultPageNotesOutside`](../interfaces/VaultPageNotesOutside.md)[]\>
