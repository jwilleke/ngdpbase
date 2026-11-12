[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreFiles](../README.md) / vaultOfFile

# Function: vaultOfFile()

> __vaultOfFile__(`pagesDirectory`, `file`, `layout`): \{ `owner`: `string`; `store`: `string`; \} \| `null`

Defined in: src/utils/privateStoreFiles.ts:178

The vault `file` lies in — `{privateroot}/{owner}/{store}/…` — or null for a file in no vault.

## Parameters

### pagesDirectory

`string`

### file

`string`

### layout

[`PrivateStoreLayout`](../../privateStorePath/type-aliases/PrivateStoreLayout.md)

## Returns

\{ `owner`: `string`; `store`: `string`; \} \| `null`
