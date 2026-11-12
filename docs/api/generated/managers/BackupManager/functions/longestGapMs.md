[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / longestGapMs

# Function: longestGapMs()

> __longestGapMs__(`schedule`, `from`): `number`

Defined in: src/managers/BackupManager.ts:549

The longest gap between two runs of a schedule (#1563): what "the
auto-backup interval" is for a schedule that is not evenly spaced (Monday,
Wednesday and Friday is three days at its longest; monthly is 31). Counted
over the next year's runs, at most 400 of them.

## Parameters

### schedule

[`Schedule`](../../../utils/schedule/interfaces/Schedule.md)

### from

`Date`

## Returns

`number`
