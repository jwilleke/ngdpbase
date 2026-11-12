[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/fileMigrationPlan](../README.md) / FileMigrationOptions

# Interface: FileMigrationOptions

Defined in: src/utils/fileMigrationPlan.ts:19

The configured values the plan applies (`ngdpbase.files.migration.*`).

## Properties

### defaultOwner

> __defaultOwner__: `string`

Defined in: src/utils/fileMigrationPlan.ts:23

Owner for a file whose record names no user (`default-owner`).

***

### ownerMap

> __ownerMap__: `Record`\<`string`, `string`\>

Defined in: src/utils/fileMigrationPlan.ts:21

Recorded uploader → username, applied first (`owner-map`).

***

### suffixDigits

> __suffixDigits__: `number`

Defined in: src/utils/fileMigrationPlan.ts:25

Width of the clash suffix: 3 gives `-001` (`clash-suffix-digits`).
