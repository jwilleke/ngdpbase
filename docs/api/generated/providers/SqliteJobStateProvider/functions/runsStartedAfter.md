[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/SqliteJobStateProvider](../README.md) / runsStartedAfter

# Function: runsStartedAfter()

> __runsStartedAfter__(`db`, `since`): `object`[]

Defined in: src/providers/SqliteJobStateProvider.ts:140

Every job's runs started after `since`, from a database handle (#1876): the
application database a restore kept as `*.pre-restore`, read just after it
was replaced, so the restore's notice names the runs the restored job
history no longer has. The same table `listRuns` reads.

## Parameters

### db

`Database`

### since

`string`

## Returns

`object`[]
