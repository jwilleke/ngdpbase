[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/AuditManager](../README.md) / export=

# Class: export=

Defined in: [src/managers/AuditManager.ts:185](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L185)

Base class for all managers

Provides common functionality for initialization, lifecycle management,
and backup/restore operations.

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new export=__(`engine`): `AuditManager`

Defined in: [src/managers/AuditManager.ts:195](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L195)

Creates a new AuditManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`AuditManager`

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`constructor`](../../BaseManager/classes/default.md#constructor)

## Properties

### config?

> `protected` `optional` __config__: `Record`\<`string`, `unknown`\>

Defined in: [src/managers/BaseManager.ts:61](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L61)

Configuration passed during initialization

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`config`](../../BaseManager/classes/default.md#config)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/managers/BaseManager.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L54)

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`engine`](../../BaseManager/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/managers/BaseManager.ts:57](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L57)

Initialization status flag

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`initialized`](../../BaseManager/classes/default.md#initialized)

## Methods

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: [src/managers/BaseManager.ts:169](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L169)

Backup manager data

MUST be overridden by all managers that manage persistent data.
Default implementation returns an empty backup object.

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Backup data object containing all manager state

#### Throws

If backup operation fails

#### Example

```ts
async backup(): Promise<BackupData> {
  return {
    managerName: this.constructor.name,
    timestamp: new Date().toISOString(),
    data: {
      users: Array.from(this.users.values()),
      settings: this.settings
    }
  };
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### cleanupOldLogs()

> __cleanupOldLogs__(): `Promise`\<`void`\>

Defined in: [src/managers/AuditManager.ts:526](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L526)

Clean up old audit logs based on retention policy

#### Returns

`Promise`\<`void`\>

***

### exportAuditLogs()

> __exportAuditLogs__(`filters`, `format`): `Promise`\<`string`\>

Defined in: [src/managers/AuditManager.ts:502](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L502)

Export audit logs

#### Parameters

##### filters

`AuditFilters` = `{}`

Export filters

##### format

`string` = `'json'`

Export format ('json', 'csv')

#### Returns

`Promise`\<`string`\>

Exported data

***

### flushAuditQueue()

> __flushAuditQueue__(): `Promise`\<`void`\>

Defined in: [src/managers/AuditManager.ts:514](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L514)

Flush audit queue to disk

#### Returns

`Promise`\<`void`\>

***

### getAuditStats()

> __getAuditStats__(`filters`): `Promise`\<`AuditStats`\>

Defined in: [src/managers/AuditManager.ts:488](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L488)

Get audit statistics

#### Parameters

##### filters

`AuditFilters` = `{}`

Optional filters

#### Returns

`Promise`\<`AuditStats`\>

Audit statistics

***

### getEngine()

> __getEngine__(): [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/managers/BaseManager.ts:125](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L125)

Get the wiki engine instance

#### Returns

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Example

```ts
const config = this.getEngine().getConfig();
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getEngine`](../../BaseManager/classes/default.md#getengine)

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: [src/managers/AuditManager.ts:209](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L209)

Initialize the AuditManager and load the configured provider

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object (unused, reads from ConfigurationManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available or provider fails to load

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`initialize`](../../BaseManager/classes/default.md#initialize)

***

### isInitialized()

> __isInitialized__(): `boolean`

Defined in: [src/managers/BaseManager.ts:113](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L113)

Check if manager has been initialized

#### Returns

`boolean`

True if manager is initialized

#### Example

```ts
if (manager.isInitialized()) {
  // Safe to use manager
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`isInitialized`](../../BaseManager/classes/default.md#isinitialized)

***

### logAccessDecision()

> __logAccessDecision__(`context`, `result`, `reason`, `policy`): `Promise`\<`string`\>

Defined in: [src/managers/AuditManager.ts:358](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L358)

Log access control decision

#### Parameters

##### context

`AccessContext`

Access context

##### result

`string`

'allow', 'deny', 'error'

##### reason

`string`

Reason for the decision

##### policy

Policy that made the decision

`PolicyInfo` | `null`

#### Returns

`Promise`\<`string`\>

Event ID

***

### logAuditEvent()

> __logAuditEvent__(`auditEvent`): `Promise`\<`string`\>

Defined in: [src/managers/AuditManager.ts:342](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L342)

Log an audit event

#### Parameters

##### auditEvent

`AuditEvent`

Audit event data

#### Returns

`Promise`\<`string`\>

Event ID

***

### logAuthentication()

> __logAuthentication__(`context`, `result`, `reason`): `Promise`\<`string`\>

Defined in: [src/managers/AuditManager.ts:423](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L423)

Log authentication event

#### Parameters

##### context

`AuthenticationContext`

Authentication context

##### result

`string`

'success', 'failure', 'logout'

##### reason

`string`

Reason for result

#### Returns

`Promise`\<`string`\>

Event ID

***

### logPolicyEvaluation()

> __logPolicyEvaluation__(`context`, `policies`, `finalResult`, `duration`): `Promise`\<`string`\>

Defined in: [src/managers/AuditManager.ts:395](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L395)

Log policy evaluation

#### Parameters

##### context

`AccessContext`

Evaluation context

##### policies

`PolicyInfo`[]

Policies evaluated

##### finalResult

`string`

Final result

##### duration

`number`

Evaluation duration in ms

#### Returns

`Promise`\<`string`\>

Event ID

***

### logSecurityEvent()

> __logSecurityEvent__(`context`, `eventType`, `severity`, `description`): `Promise`\<`string`\>

Defined in: [src/managers/AuditManager.ts:450](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L450)

Log security event

#### Parameters

##### context

`SecurityContext`

Security context

##### eventType

`string`

Type of security event

##### severity

'low', 'medium', 'high', 'critical'

`"medium"` | `"high"` | `"low"` | `"critical"`

##### description

`string`

Event description

#### Returns

`Promise`\<`string`\>

Event ID

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/managers/BaseManager.ts:198](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L198)

Restore manager data from backup

MUST be overridden by all managers that manage persistent data.
Default implementation only validates that backup data is provided.

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

Backup data object from backup() method

#### Returns

`Promise`\<`void`\>

#### Throws

If restore operation fails or backup data is missing

#### Example

```ts
async restore(backupData: BackupData): Promise<void> {
  if (!backupData || !backupData.data) {
    throw new Error('Invalid backup data');
  }
  this.users = new Map(backupData.data.users.map(u => [u.id, u]));
  this.settings = backupData.data.settings;
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

***

### searchAuditLogs()

> __searchAuditLogs__(`filters`, `options`): `Promise`\<`AuditSearchResults`\>

Defined in: [src/managers/AuditManager.ts:475](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L475)

Search audit logs

#### Parameters

##### filters

`AuditFilters` = `{}`

Search filters

##### options

`AuditSearchOptions` = `{}`

Search options

#### Returns

`Promise`\<`AuditSearchResults`\>

Search results

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/managers/AuditManager.ts:538](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AuditManager.ts#L538)

Shutdown the audit manager

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`shutdown`](../../BaseManager/classes/default.md#shutdown)
