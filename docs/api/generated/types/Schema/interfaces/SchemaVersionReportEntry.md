[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Schema](../README.md) / SchemaVersionReportEntry

# Interface: SchemaVersionReportEntry

Defined in: src/types/Schema.ts:487

One row of CatalogManager.checkSchemaVersions() output.
`isStale` is true when the on-disk index file's version is older
than the manager's current constant.

## Properties

### currentSchemaVersion

> __currentSchemaVersion__: `number`

Defined in: src/types/Schema.ts:489

***

### isStale

> __isStale__: `boolean`

Defined in: src/types/Schema.ts:491

***

### onDiskSchemaVersion

> __onDiskSchemaVersion__: `number`

Defined in: src/types/Schema.ts:490

***

### sourceId

> __sourceId__: `string`

Defined in: src/types/Schema.ts:488
