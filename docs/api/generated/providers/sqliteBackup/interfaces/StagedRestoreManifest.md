[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteBackup](../README.md) / StagedRestoreManifest

# Interface: StagedRestoreManifest

Defined in: src/providers/sqliteBackup.ts:307

What a staged restore is: written last, once every database is staged; its presence is what the next start applies.

## Properties

### backup

> __backup__: `string`

Defined in: src/providers/sqliteBackup.ts:311

When the backup it came from was taken.

***

### databases

> __databases__: `object`[]

Defined in: src/providers/sqliteBackup.ts:318

#### live

> __live__: `string`

#### name

> __name__: `string`

#### staged

> __staged__: `string`

***

### safetyBackup?

> `optional` __safetyBackup?__: `string`

Defined in: src/providers/sqliteBackup.ts:317

The backup of the live data taken just before staging (D6): what to restore to undo this one.

***

### source

> __source__: `string`

Defined in: src/providers/sqliteBackup.ts:313

The backup document's filename.

***

### stagedAt

> __stagedAt__: `string`

Defined in: src/providers/sqliteBackup.ts:309

***

### stagedBy

> __stagedBy__: `string`

Defined in: src/providers/sqliteBackup.ts:315

Who staged it: the account named by the request's context.

***

### version

> __version__: `1`

Defined in: src/providers/sqliteBackup.ts:308
