[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/fileMigrationPlan](../README.md) / FileMigrationReport

# Interface: FileMigrationReport

Defined in: src/utils/fileMigrationPlan.ts:46

## Properties

### clashes

> __clashes__: `object`[]

Defined in: src/utils/fileMigrationPlan.ts:52

Each clashing name, with the renames it would get.

#### files

> __files__: `number`

#### name

> __name__: `string`

#### renames

> __renames__: [`PlannedRename`](PlannedRename.md)[]

***

### noOwner

> __noOwner__: `number`

Defined in: src/utils/fileMigrationPlan.ts:50

Public files whose record names no user (before the owner mapping).

***

### owners

> __owners__: [`PlannedOwner`](PlannedOwner.md)[]

Defined in: src/utils/fileMigrationPlan.ts:48

***

### pagesToRewrite

> __pagesToRewrite__: `object`[]

Defined in: src/utils/fileMigrationPlan.ts:54

Each page that would be rewritten, and to which names.

#### changes

> __changes__: `object`[]

#### page

> __page__: `string`

***

### publicFiles

> __publicFiles__: `object`

Defined in: src/utils/fileMigrationPlan.ts:47

#### bytes

> __bytes__: `number`

#### byType

> __byType__: `object`[]

#### count

> __count__: `number`

***

### vaults

> __vaults__: [`VaultFileSummary`](../../../types/File/interfaces/VaultFileSummary.md)[]

Defined in: src/utils/fileMigrationPlan.ts:55
