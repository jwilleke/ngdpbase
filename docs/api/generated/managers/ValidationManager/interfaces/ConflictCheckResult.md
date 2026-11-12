[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ValidationManager](../README.md) / ConflictCheckResult

# Interface: ConflictCheckResult

Defined in: src/managers/ValidationManager.ts:179

Result of a cross-page conflict check

## Properties

### conflictingUuid?

> `optional` __conflictingUuid?__: `string`

Defined in: src/managers/ValidationManager.ts:184

UUID of the conflicting page, if any

***

### conflictType

> __conflictType__: `"uuid-mismatch"` \| `"slug-duplicate"` \| `"title-duplicate"` \| `null`

Defined in: src/managers/ValidationManager.ts:182

Type of conflict detected, or null if none

***

### hasConflict

> __hasConflict__: `boolean`

Defined in: src/managers/ValidationManager.ts:180

***

### message?

> `optional` __message?__: `string`

Defined in: src/managers/ValidationManager.ts:186

Human-readable description
