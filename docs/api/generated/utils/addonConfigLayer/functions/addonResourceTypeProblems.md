[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonConfigLayer](../README.md) / addonResourceTypeProblems

# Function: addonResourceTypeProblems()

> __addonResourceTypeProblems__(`slug`, `defaults`): `string`[]

Defined in: src/utils/addonConfigLayer.ts:358

An add-on's resource types (#1823). Each name starts with `<slug>-`, the
same fence as its jobs and its ledger tables. `owner`, when declared, is
an identity @id. A bad declaration refuses the add-on, so none of its keys
merge. A turned-off add-on is not checked: its file is not merged.

## Parameters

### slug

`string`

### defaults

`Record`\<`string`, `unknown`\>

## Returns

`string`[]
