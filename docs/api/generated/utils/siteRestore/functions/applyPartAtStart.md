[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/siteRestore](../README.md) / applyPartAtStart

# Function: applyPartAtStart()

> __applyPartAtStart__(`file`, `manager`, `options`): [`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/utils/siteRestore.ts:276

Apply `manager`'s part of a staged site restore, at start, before the
manager reads its data. `allowed` says which live paths this manager may
replace, so a tampered manifest cannot rename an arbitrary file.
`strays` lists staged paths of this manager's that exist on disk, found by
the manager: with no committed restore naming them they are set aside.
`put` puts one swap in place instead of the rename, for a part whose live
path is not one file or folder of its own (the audit files share the log
folder): it moves the live content to `kept` and the staged one in, and
throws to refuse. Returns null when there was nothing to do.

## Parameters

### file

`string`

### manager

`string`

### options

#### allowed

(`swap`) => `boolean`

#### put?

(`swap`, `kept`) => `void`

#### strays?

() => `string`[]

## Returns

[`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`
