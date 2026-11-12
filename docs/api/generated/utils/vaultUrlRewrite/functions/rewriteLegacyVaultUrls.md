[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/vaultUrlRewrite](../README.md) / rewriteLegacyVaultUrls

# Function: rewriteLegacyVaultUrls()

> __rewriteLegacyVaultUrls__(`content`, `vaults`): `object`

Defined in: src/utils/vaultUrlRewrite.ts:33

## Parameters

### content

`string`

a page's body

### vaults

`ReadonlySet`\<`string`\>

the vaults that exist, as `owner/store`

## Returns

`object`

the rewritten body and how many links changed

### content

> __content__: `string`

### rewritten

> __rewritten__: `number`
