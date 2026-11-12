[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Share](../README.md) / VaultShareScope

# Interface: VaultShareScope

Defined in: src/types/Share.ts:23

A vault's content, shared by its owner (#1388): chosen pages, or the whole
vault. Pages are named by uuid, so renaming one does not break the link.
Only the current pages are covered, never their history.

## Properties

### kind

> __kind__: `"vault"`

Defined in: src/types/Share.ts:24

***

### owner

> __owner__: `string`

Defined in: src/types/Share.ts:26

The vault's owner — the only one who may issue, extend or revoke it.

***

### pages

> __pages__: `string`[] \| `null`

Defined in: src/types/Share.ts:30

Page uuids, or null for the whole vault, including pages added while the link is live.

***

### vault

> __vault__: `string`

Defined in: src/types/Share.ts:28

The vault id: `pages/vaults/{owner}/{vault}/`.
