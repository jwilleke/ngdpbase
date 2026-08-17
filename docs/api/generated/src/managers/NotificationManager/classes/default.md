[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/NotificationManager](../README.md) / default

# Class: default

Defined in: [src/managers/NotificationManager.ts:80](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L80)

NotificationManager - Handles system notifications and user alerts

Manages user-facing notifications and system alerts with persistent storage.
Extends BaseManager following the modular manager pattern.

 NotificationManager

## See

[BaseManager](../../BaseManager/classes/default.md) for base functionality

## Example

```ts
const notificationManager = engine.getManager('NotificationManager');
notificationManager.addNotification({ title: 'Welcome!', level: 'info' });
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `NotificationManager`

Defined in: [src/managers/NotificationManager.ts:94](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L94)

Creates a new NotificationManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`NotificationManager`

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

### addNotification()

> __addNotification__(`notification`): `Promise`\<`string`\>

Defined in: [src/managers/NotificationManager.ts:253](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L253)

Add a notification (alias for createNotification for backward compatibility)

#### Parameters

##### notification

[`NotificationInput`](../interfaces/NotificationInput.md)

Notification object

#### Returns

`Promise`\<`string`\>

Notification ID

***

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

### cleanupExpiredNotifications()

> __cleanupExpiredNotifications__(): `Promise`\<`void`\>

Defined in: [src/managers/NotificationManager.ts:356](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L356)

Clean up expired notifications

#### Returns

`Promise`\<`void`\>

***

### clearAllActive()

> __clearAllActive__(): `Promise`\<`number`\>

Defined in: [src/managers/NotificationManager.ts:379](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L379)

Clear all active (non-expired) notifications

#### Returns

`Promise`\<`number`\>

Number of cleared notifications

***

### createMaintenanceNotification()

> __createMaintenanceNotification__(`enabled`, `adminUsername`, `_config`): `Promise`\<`string`\>

Defined in: [src/managers/NotificationManager.ts:315](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L315)

Create maintenance mode notification

#### Parameters

##### enabled

`boolean`

Whether maintenance mode is enabled

##### adminUsername

`string`

Admin who toggled maintenance mode

##### \_config

[`MaintenanceConfig`](../interfaces/MaintenanceConfig.md) = `{}`

#### Returns

`Promise`\<`string`\>

Notification ID

***

### createNotification()

> __createNotification__(`notification`): `Promise`\<`string`\>

Defined in: [src/managers/NotificationManager.ts:220](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L220)

Create a new notification

#### Parameters

##### notification

[`NotificationInput`](../interfaces/NotificationInput.md)

Notification object

#### Returns

`Promise`\<`string`\>

Notification ID

***

### dismissNotification()

> __dismissNotification__(`notificationId`, `username`): `Promise`\<`boolean`\>

Defined in: [src/managers/NotificationManager.ts:291](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L291)

Dismiss a notification for a user

#### Parameters

##### notificationId

`string`

Notification ID

##### username

`string`

Username dismissing the notification

#### Returns

`Promise`\<`boolean`\>

Success status

***

### getAllNotifications()

> __getAllNotifications__(`includeExpired`): [`Notification`](../interfaces/Notification.md)[]

Defined in: [src/managers/NotificationManager.ts:339](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L339)

Get all active notifications

#### Parameters

##### includeExpired

`boolean` = `false`

Include expired notifications

#### Returns

[`Notification`](../interfaces/Notification.md)[]

Array of all notifications

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

### getStats()

> __getStats__(): [`NotificationStats`](../interfaces/NotificationStats.md)

Defined in: [src/managers/NotificationManager.ts:405](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L405)

Get notification statistics

#### Returns

[`NotificationStats`](../interfaces/NotificationStats.md)

Statistics object

***

### getUserNotifications()

> __getUserNotifications__(`username`, `includeExpired`): [`Notification`](../interfaces/Notification.md)[]

Defined in: [src/managers/NotificationManager.ts:263](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L263)

Get notifications for a specific user

#### Parameters

##### username

`string`

Username to get notifications for

##### includeExpired

`boolean` = `false`

Include expired notifications

#### Returns

[`Notification`](../interfaces/Notification.md)[]

Array of notifications

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: [src/managers/NotificationManager.ts:110](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L110)

Initialize the notification manager

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object

#### Returns

`Promise`\<`void`\>

#### Async

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

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/managers/NotificationManager.ts:435](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/NotificationManager.ts#L435)

Shutdown the notification manager

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`shutdown`](../../BaseManager/classes/default.md#shutdown)
