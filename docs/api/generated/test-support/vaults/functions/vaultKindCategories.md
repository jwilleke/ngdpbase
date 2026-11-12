[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [test-support/vaults](../README.md) / vaultKindCategories

# Function: vaultKindCategories()

> __vaultKindCategories__(`kinds`): `Record`\<`string`, `unknown`\>

Defined in: src/test-support/vaults.ts:22

`ngdpbase.system-category` entries declaring the given vault kinds (#1505):
each id becomes a system-category with `privatestore` `pages/vaults/{user}/{id}/`
and the given `owner` and `encrypt`. The kind `default` (or the first) is the
default system-category.

## Parameters

### kinds

`Record`\<`string`, \{ `encrypt?`: `unknown`; `owner?`: `string`; \}\>

## Returns

`Record`\<`string`, `unknown`\>
