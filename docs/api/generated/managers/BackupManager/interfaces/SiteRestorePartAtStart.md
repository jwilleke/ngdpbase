[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / SiteRestorePartAtStart

# Interface: SiteRestorePartAtStart

Defined in: src/managers/BackupManager.ts:309

BackupManager's answer, at start, for a manager that applies a staged
restore of its own kind (the databases, #1723): whether its part of a
staged site restore is to go in now (#1876, #1986).

- `none` — no site restore names it: the manager does as it would alone.
- `apply` — the whole restore is there: put it in, then `settle` it.
- `set-aside` — it isn't (`reason`): set the staged files aside, then `settle` it.

## Properties

### decision

> __decision__: `"none"` \| `"apply"` \| `"set-aside"`

Defined in: src/managers/BackupManager.ts:310

***

### reason?

> `optional` __reason?__: `string`

Defined in: src/managers/BackupManager.ts:311

## Methods

### settle()

> __settle__(`status`, `note?`): `void`

Defined in: src/managers/BackupManager.ts:313

Record what became of the part. Nothing to record for `none`, or a set-aside with no part of this manager's.

#### Parameters

##### status

`"applied"` \| `"set-aside"`

##### note?

`string`

#### Returns

`void`
