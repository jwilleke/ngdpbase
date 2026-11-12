[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / AuditProvider

# Interface: AuditProvider

Defined in: src/types/Provider.ts:956

Audit provider interface

Defines the contract for audit logging backends.

## Extends

- [`BaseProvider`](BaseProvider.md)

## Methods

### backup()?

> `optional` __backup__(): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: src/types/Provider.ts:75

Backup provider data

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

Promise resolving to backup data

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`backup`](BaseProvider.md#backup)

***

### cleanupOldEvents()

> __cleanupOldEvents__(`olderThanDays`): `Promise`\<`number`\>

Defined in: src/types/Provider.ts:985

Delete old audit events

#### Parameters

##### olderThanDays

`number`

Delete events older than N days

#### Returns

`Promise`\<`number`\>

Number of events deleted

***

### getProviderInfo()?

> `optional` __getProviderInfo__(): [`ProviderInfo`](ProviderInfo.md)

Defined in: src/types/Provider.ts:69

Get provider information

#### Returns

[`ProviderInfo`](ProviderInfo.md)

Provider metadata

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`getProviderInfo`](BaseProvider.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:57

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`initialize`](BaseProvider.md#initialize)

***

### logEvent()

> __logEvent__(`event`): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:962

Log audit event

#### Parameters

##### event

`Omit`\<[`AuditEvent`](AuditEvent.md), `"id"` \| `"timestamp"`\>

Audit event

#### Returns

`Promise`\<`void`\>

Promise that resolves when event is logged

***

### queryEvents()

> __queryEvents__(`filters`): `Promise`\<[`AuditEvent`](AuditEvent.md)[]\>

Defined in: src/types/Provider.ts:969

Query audit events

#### Parameters

##### filters

Filter criteria

###### action?

`string`

###### actor?

`string`

###### endDate?

`string`

###### limit?

`number`

###### offset?

`number`

###### startDate?

`string`

###### target?

`string`

###### type?

`string`

#### Returns

`Promise`\<[`AuditEvent`](AuditEvent.md)[]\>

Array of audit events

***

### restore()?

> `optional` __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:82

Restore provider data from backup

#### Parameters

##### backupData

`Record`\<`string`, `unknown`\>

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

Promise that resolves when restore is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`restore`](BaseProvider.md#restore)

***

### shutdown()?

> `optional` __shutdown__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:63

Shutdown the provider (optional)

#### Returns

`Promise`\<`void`\>

Promise that resolves when shutdown is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`shutdown`](BaseProvider.md#shutdown)
