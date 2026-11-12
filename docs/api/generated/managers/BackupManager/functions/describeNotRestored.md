[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / describeNotRestored

# Function: describeNotRestored()

> __describeNotRestored__(`input`): `string`

Defined in: src/managers/BackupManager.ts:630

The text of the critical "not restored" notification (#1876): what the
restore put back, what it did not, and per job the runs since the backup —
its name, when it last ran and how that ended — newest first.

## Parameters

### input

#### applied

`string`[]

#### backup

`string`

#### jobRuns

[`JobRunSince`](../../BackgroundJobManager/interfaces/JobRunSince.md)[]

#### missingReport?

`boolean`

#### nameOf

(`jobId`) => `string`

#### notRestored

`string`[]

#### source

`string`

## Returns

`string`
