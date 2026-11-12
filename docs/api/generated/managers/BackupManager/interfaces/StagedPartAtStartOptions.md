[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / StagedPartAtStartOptions

# Interface: StagedPartAtStartOptions

Defined in: src/managers/BackupManager.ts:267

How a manager whose restore is staged (`restoreIsStaged()`) puts its part in place at start (#1986).

## Properties

### allowed

> __allowed__: (`swap`) => `boolean`

Defined in: src/managers/BackupManager.ts:269

Whether this manager may replace that live path: a manifest naming any other is refused, whatever it says.

#### Parameters

##### swap

[`StagedSwap`](../../BaseManager/interfaces/StagedSwap.md)

#### Returns

`boolean`

***

### mayBeStaged?

> `optional` __mayBeStaged?__: () => `string`[]

Defined in: src/managers/BackupManager.ts:271

The live paths of this manager's that may have a staged copy beside them: one no committed restore names (an interrupted staging) is set aside.

#### Returns

`string`[]

***

### put?

> `optional` __put?__: (`swap`, `kept`) => `void`

Defined in: src/managers/BackupManager.ts:278

Put one swap in place yourself, instead of the rename: for a part whose
live path is not a file or folder of its own (the audit files share the
log folder). Move the live content to `kept` and the staged one in;
throw to refuse.

#### Parameters

##### swap

[`StagedSwap`](../../BaseManager/interfaces/StagedSwap.md)

##### kept

`string`

#### Returns

`void`
