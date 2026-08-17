[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Provider](../README.md) / AuditProvider

# Interface: AuditProvider

Defined in: [src/types/Provider.ts:526](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L526)

Audit provider interface

Defines the contract for audit logging backends.

## Extends

- [`BaseProvider`](BaseProvider.md)

## Properties

### engine

> __engine__: [`WikiEngine`](../../WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/types/Provider.ts:37](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L37)

Reference to WikiEngine

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`engine`](BaseProvider.md#engine)

***

### initialized

> __initialized__: `boolean`

Defined in: [src/types/Provider.ts:40](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L40)

Whether provider has been initialized

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`initialized`](BaseProvider.md#initialized)

## Methods

### backup()?

> `optional` __backup__(): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [src/types/Provider.ts:64](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L64)

Backup provider data

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

Promise resolving to backup data

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`backup`](BaseProvider.md#backup)

***

### cleanupOldEvents()

> __cleanupOldEvents__(`olderThanDays`): `Promise`\<`number`\>

Defined in: [src/types/Provider.ts:555](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L555)

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

Defined in: [src/types/Provider.ts:58](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L58)

Get provider information

#### Returns

[`ProviderInfo`](ProviderInfo.md)

Provider metadata

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`getProviderInfo`](BaseProvider.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: [src/types/Provider.ts:46](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L46)

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`initialize`](BaseProvider.md#initialize)

***

### logEvent()

> __logEvent__(`event`): `Promise`\<`void`\>

Defined in: [src/types/Provider.ts:532](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L532)

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

Defined in: [src/types/Provider.ts:539](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L539)

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

Defined in: [src/types/Provider.ts:71](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L71)

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

Defined in: [src/types/Provider.ts:52](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L52)

Shutdown the provider (optional)

#### Returns

`Promise`\<`void`\>

Promise that resolves when shutdown is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`shutdown`](BaseProvider.md#shutdown)
