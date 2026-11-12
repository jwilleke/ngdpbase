[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteBackup](../README.md) / runOffThread

# Function: runOffThread()

## Call Signature

> __runOffThread__(`job`, `timeoutMs`): `Promise`\<[`ExportOutcome`](../interfaces/ExportOutcome.md)\>

Defined in: src/providers/sqliteBackup.ts:276

Run a job of this module on a worker thread, so a large database never stalls requests or the liveness probe.

### Parameters

#### job

##### backupKey

`string`

##### exports

[`DatabaseExport`](../interfaces/DatabaseExport.md)[]

##### kind

`"export"`

#### timeoutMs

`number`

### Returns

`Promise`\<[`ExportOutcome`](../interfaces/ExportOutcome.md)\>

## Call Signature

> __runOffThread__(`job`, `timeoutMs`): `Promise`\<[`StageOutcome`](../interfaces/StageOutcome.md)\>

Defined in: src/providers/sqliteBackup.ts:277

Run a job of this module on a worker thread, so a large database never stalls requests or the liveness probe.

### Parameters

#### job

##### backupKey

`string`

##### kind

`"stage"`

##### stages

[`DatabaseStage`](../interfaces/DatabaseStage.md)[]

#### timeoutMs

`number`

### Returns

`Promise`\<[`StageOutcome`](../interfaces/StageOutcome.md)\>
