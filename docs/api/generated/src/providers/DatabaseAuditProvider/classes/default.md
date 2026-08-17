[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/providers/DatabaseAuditProvider](../README.md) / default

# Class: default

Defined in: [src/providers/DatabaseAuditProvider.ts:35](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/DatabaseAuditProvider.ts#L35)

DatabaseAuditProvider - Database-based audit log storage (FUTURE IMPLEMENTATION)

Stores audit logs in SQL or NoSQL database for enterprise deployments.
Suitable for high-volume auditing, compliance, and long-term retention.

Configuration keys (all lowercase):

- ngdpbase.audit.provider.database.type - Database type (postgresql, mysql, mongodb)
- ngdpbase.audit.provider.database.connectionstring - Database connection string
- ngdpbase.audit.provider.database.tablename - Table/collection name
- ngdpbase.audit.provider.database.maxconnections - Maximum database connections

TODO: Implement database integration using appropriate client library
TODO: Add connection pooling
TODO: Implement efficient indexing for search queries
TODO: Add batch insert for performance
TODO: Implement automatic table/collection creation

## Extends

- [`default`](../../BaseAuditProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `DatabaseAuditProvider`

Defined in: [src/providers/DatabaseAuditProvider.ts:40](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/DatabaseAuditProvider.ts#L40)

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`DatabaseAuditProvider`

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`constructor`](../../BaseAuditProvider/classes/default.md#constructor)

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/providers/BaseAuditProvider.ts:156](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAuditProvider.ts#L156)

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`engine`](../../BaseAuditProvider/classes/default.md#engine)

***

### initialized

> __initialized__: `boolean`

Defined in: [src/providers/BaseAuditProvider.ts:159](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAuditProvider.ts#L159)

Whether provider has been initialized

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`initialized`](../../BaseAuditProvider/classes/default.md#initialized)

## Methods

### backup()

> __backup__(): `Promise`\<[`AuditBackupData`](../../BaseAuditProvider/interfaces/AuditBackupData.md)\>

Defined in: [src/providers/BaseAuditProvider.ts:307](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAuditProvider.ts#L307)

Backup audit configuration and state (optional)

Default implementation provides basic backup data.
Subclasses can override to include provider-specific data.

#### Returns

`Promise`\<[`AuditBackupData`](../../BaseAuditProvider/interfaces/AuditBackupData.md)\>

Backup data

#### Async

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`backup`](../../BaseAuditProvider/classes/default.md#backup)

***

### cleanup()

> __cleanup__(): `Promise`\<`void`\>

Defined in: [src/providers/DatabaseAuditProvider.ts:165](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/DatabaseAuditProvider.ts#L165)

Clean up old audit logs based on retention policy

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`cleanup`](../../BaseAuditProvider/classes/default.md#cleanup)

***

### close()

> __close__(): `Promise`\<`void`\>

Defined in: [src/providers/DatabaseAuditProvider.ts:186](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/DatabaseAuditProvider.ts#L186)

Close/cleanup the audit provider

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`close`](../../BaseAuditProvider/classes/default.md#close)

***

### exportAuditLogs()

> __exportAuditLogs__(`_filters`, `_format`): `Promise`\<`string`\>

Defined in: [src/providers/DatabaseAuditProvider.ts:147](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/DatabaseAuditProvider.ts#L147)

Export audit logs

#### Parameters

##### \_filters

[`AuditFilters`](../../BaseAuditProvider/interfaces/AuditFilters.md) = `{}`

Export filters

##### \_format

Export format ('json', 'csv')

`"json"` | `"csv"`

#### Returns

`Promise`\<`string`\>

Exported data

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`exportAuditLogs`](../../BaseAuditProvider/classes/default.md#exportauditlogs)

***

### flush()

> __flush__(): `Promise`\<`void`\>

Defined in: [src/providers/DatabaseAuditProvider.ts:156](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/DatabaseAuditProvider.ts#L156)

Flush pending audit events (no-op for database - writes are immediate)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`flush`](../../BaseAuditProvider/classes/default.md#flush)

***

### getAuditStats()

> __getAuditStats__(`_filters`): `Promise`\<[`AuditStats`](../../BaseAuditProvider/interfaces/AuditStats.md)\>

Defined in: [src/providers/DatabaseAuditProvider.ts:135](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/DatabaseAuditProvider.ts#L135)

Get audit statistics

#### Parameters

##### \_filters

[`AuditFilters`](../../BaseAuditProvider/interfaces/AuditFilters.md) = `{}`

Optional filters

#### Returns

`Promise`\<[`AuditStats`](../../BaseAuditProvider/interfaces/AuditStats.md)\>

Audit statistics

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`getAuditStats`](../../BaseAuditProvider/classes/default.md#getauditstats)

***

### getProviderInfo()

> __getProviderInfo__(): `object`

Defined in: [src/providers/DatabaseAuditProvider.ts:96](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/DatabaseAuditProvider.ts#L96)

Get provider information

#### Returns

`object`

Provider metadata

##### description

> __description__: `string`

##### features

> __features__: `string`[]

##### name

> __name__: `string`

##### version

> __version__: `string`

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`getProviderInfo`](../../BaseAuditProvider/classes/default.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: [src/providers/DatabaseAuditProvider.ts:50](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/DatabaseAuditProvider.ts#L50)

Initialize the database audit provider

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`initialize`](../../BaseAuditProvider/classes/default.md#initialize)

***

### isHealthy()

> __isHealthy__(): `Promise`\<`boolean`\>

Defined in: [src/providers/DatabaseAuditProvider.ts:176](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/DatabaseAuditProvider.ts#L176)

Check if the audit provider is healthy

#### Returns

`Promise`\<`boolean`\>

True if healthy

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`isHealthy`](../../BaseAuditProvider/classes/default.md#ishealthy)

***

### logAuditEvent()

> __logAuditEvent__(`_auditEvent`): `Promise`\<`string`\>

Defined in: [src/providers/DatabaseAuditProvider.ts:110](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/DatabaseAuditProvider.ts#L110)

Log an audit event

#### Parameters

##### \_auditEvent

[`AuditEvent`](../../../types/Provider/interfaces/AuditEvent.md)

Audit event data

#### Returns

`Promise`\<`string`\>

Event ID

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`logAuditEvent`](../../BaseAuditProvider/classes/default.md#logauditevent)

***

### restore()

> __restore__(`_backupData`): `Promise`\<`void`\>

Defined in: [src/providers/BaseAuditProvider.ts:325](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAuditProvider.ts#L325)

Restore audit from backup (optional)

Default implementation does nothing.
Subclasses can override if they support restore functionality.

#### Parameters

##### \_backupData

[`AuditBackupData`](../../BaseAuditProvider/interfaces/AuditBackupData.md)

Backup data

#### Returns

`Promise`\<`void`\>

#### Async

#### Inherited from

[`default`](../../BaseAuditProvider/classes/default.md).[`restore`](../../BaseAuditProvider/classes/default.md#restore)

***

### searchAuditLogs()

> __searchAuditLogs__(`_filters`, `_options`): `Promise`\<[`AuditSearchResults`](../../BaseAuditProvider/interfaces/AuditSearchResults.md)\>

Defined in: [src/providers/DatabaseAuditProvider.ts:124](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/DatabaseAuditProvider.ts#L124)

Search audit logs

#### Parameters

##### \_filters

[`AuditFilters`](../../BaseAuditProvider/interfaces/AuditFilters.md) = `{}`

Search filters

##### \_options

`Record`\<`string`, `unknown`\> = `{}`

Search options

#### Returns

`Promise`\<[`AuditSearchResults`](../../BaseAuditProvider/interfaces/AuditSearchResults.md)\>

Search results

#### Overrides

[`default`](../../BaseAuditProvider/classes/default.md).[`searchAuditLogs`](../../BaseAuditProvider/classes/default.md#searchauditlogs)
