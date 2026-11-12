[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / SiteRestoreStaging

# Interface: SiteRestoreStaging

Defined in: src/managers/BaseManager.ts:171

A whole-site restore being staged (#1876), handed to a manager's
`restore()` by BackupManager, which keeps the record that binds the parts
together (#1986). A manager whose restore is staged
(`restoreIsStaged()`) stages its files beside its live ones and records
its part here; nothing else writes that record.

## Methods

### record()

> __record__(`swaps`, `options?`): `void`

Defined in: src/managers/BaseManager.ts:180

Record this manager's part: the pairs the next start swaps in, all
together with every other part or not at all. `discard` names further
files to remove if the restore is thrown away (DatabaseManager's own
manifest).

#### Parameters

##### swaps

[`StagedSwap`](StagedSwap.md)[]

##### options?

###### discard?

`string`[]

#### Returns

`void`

***

### stagedPathFor()

> __stagedPathFor__(`live`): `string`

Defined in: src/managers/BaseManager.ts:173

Where the staged copy of a live path goes: beside it, `<live>.staged`. The next start applies nothing named otherwise.

#### Parameters

##### live

`string`

#### Returns

`string`
