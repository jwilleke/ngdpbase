[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / ImportResult

# Interface: ImportResult

Defined in: src/managers/ImportManager.ts:261

Result of an import operation

## Properties

### converted

> __converted__: `number`

Defined in: src/managers/ImportManager.ts:266

Number of files converted

***

### durationMs

> __durationMs__: `number`

Defined in: src/managers/ImportManager.ts:284

Import duration in milliseconds

***

### errors

> __errors__: [`ImportError`](ImportError.md)[]

Defined in: src/managers/ImportManager.ts:278

Error details

***

### failed

> __failed__: `number`

Defined in: src/managers/ImportManager.ts:272

Number of files with errors

***

### files

> __files__: [`ImportedFile`](ImportedFile.md)[]

Defined in: src/managers/ImportManager.ts:281

Information about imported files

***

### skipped

> __skipped__: `number`

Defined in: src/managers/ImportManager.ts:269

Number of files skipped

***

### success

> __success__: `boolean`

Defined in: src/managers/ImportManager.ts:263

Overall success status

***

### total

> __total__: `number`

Defined in: src/managers/ImportManager.ts:275

Total files processed
