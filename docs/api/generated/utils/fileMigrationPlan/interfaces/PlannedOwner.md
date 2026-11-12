[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/fileMigrationPlan](../README.md) / PlannedOwner

# Interface: PlannedOwner

Defined in: src/utils/fileMigrationPlan.ts:37

Who a group of public files would belong to after the migration.

## Properties

### files

> __files__: `number`

Defined in: src/utils/fileMigrationPlan.ts:43

***

### how

> __how__: `"default"` \| `"kept"` \| `"mapped"`

Defined in: src/utils/fileMigrationPlan.ts:42

`kept`: the record names a user; `mapped`: `owner-map`; `default`: `default-owner`.

***

### owner

> __owner__: `string`

Defined in: src/utils/fileMigrationPlan.ts:40

***

### recorded

> __recorded__: `string` \| `null`

Defined in: src/utils/fileMigrationPlan.ts:39

The uploader the record names, or `null` when it names none.
