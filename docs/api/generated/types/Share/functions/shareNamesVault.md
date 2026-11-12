[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Share](../README.md) / shareNamesVault

# Function: shareNamesVault()

> __shareNamesVault__(`resources`, `owner`, `vault`): `boolean`

Defined in: src/types/Share.ts:121

Does a share name the vault `owner/vault` at all — whole, or any page in it?
The container half of a vault share: who may step into the vault. Which
pages it may then read is [shareCoversVaultPage](shareCoversVaultPage.md).

## Parameters

### resources

readonly [`ShareResource`](../interfaces/ShareResource.md)[]

### owner

`string`

### vault

`string`

## Returns

`boolean`
