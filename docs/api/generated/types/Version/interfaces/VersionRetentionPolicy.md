[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Version](../README.md) / VersionRetentionPolicy

# Interface: VersionRetentionPolicy

Defined in: src/types/Version.ts:202

Version retention policy

Configuration for version retention and cleanup.

## Properties

### checkpointInterval

> __checkpointInterval__: `number`

Defined in: src/types/Version.ts:216

Checkpoint interval for full snapshots

***

### keepBaseline

> __keepBaseline__: `boolean`

Defined in: src/types/Version.ts:210

Always keep version 1 (baseline)

***

### keepCheckpoints

> __keepCheckpoints__: `boolean`

Defined in: src/types/Version.ts:219

Keep all checkpoint versions

***

### keepCurrent

> __keepCurrent__: `boolean`

Defined in: src/types/Version.ts:213

Always keep current version

***

### maxVersions

> __maxVersions__: `number`

Defined in: src/types/Version.ts:204

Maximum number of versions to keep (0 = unlimited)

***

### retentionDays

> __retentionDays__: `number`

Defined in: src/types/Version.ts:207

Number of days to retain versions (0 = unlimited)
