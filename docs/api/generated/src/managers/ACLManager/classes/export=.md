[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/ACLManager](../README.md) / export=

# Class: export=

Defined in: [src/managers/ACLManager.ts:145](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L145)

ACLManager - Handles Access Control Lists and context-aware permissions

Implements JSPWiki-style access control with extensions for context-aware
permissions (time-based, location-based, etc.). Supports both page-level
ACLs embedded in page content and global policy-based access control.

Key features:

- JSPWiki-style ACL markup parsing ([{ALLOW view Admin}])
- Context-aware permission evaluation
- Global policy-based access control
- Audit logging of access decisions
- Role-based permission checking
- Category-based access control

 ACLManager

## See

- [BaseManager](../../BaseManager/classes/default.md) for base functionality
- [PolicyEvaluator](../../PolicyEvaluator/classes/export=.md) for policy evaluation
- AuditManager for audit logging

## Example

```ts
const aclManager = engine.getManager('ACLManager');
const canView = await aclManager.checkPermission('Main', 'view', userContext);
if (canView) console.log('User can view page');
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new export=__(`engine`): `ACLManager`

Defined in: [src/managers/ACLManager.ts:155](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L155)

Creates a new ACLManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`ACLManager`

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

### checkBusinessHours()

> __checkBusinessHours__(`businessHoursConfig`, `timeZone`): `PermissionResult`

Defined in: [src/managers/ACLManager.ts:670](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L670)

Check business hours restrictions

#### Parameters

##### businessHoursConfig

`BusinessHoursConfig` = `{}`

Business hours configuration

##### timeZone

`string` = `'UTC'`

Time zone for business hours

#### Returns

`PermissionResult`

Permission result

***

### checkContextRestrictions()

> __checkContextRestrictions__(`user`, `context`): `Promise`\<`PermissionResult`\>

Defined in: [src/managers/ACLManager.ts:594](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L594)

Check context-aware restrictions (time-based, maintenance mode)

#### Parameters

##### user

User object

`UserContext` | `null`

##### context

`Record`\<`string`, `unknown`\>

Request context

#### Returns

`Promise`\<`PermissionResult`\>

Permission result with reason

***

### checkDefaultPermission()

> __checkDefaultPermission__(`action`, `user`): `Promise`\<`boolean`\>

Defined in: [src/managers/ACLManager.ts:565](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L565)

Check default permissions for actions using UserManager

#### Parameters

##### action

`string`

Action to check (view, edit, delete, etc.)

##### user

User object or null for anonymous

`UserContext` | `null`

#### Returns

`Promise`\<`boolean`\>

True if user has permission, false otherwise

***

### checkEnhancedTimeRestrictions()

> __checkEnhancedTimeRestrictions__(`user`, `context`): `Promise`\<`PermissionResult`\>

Defined in: [src/managers/ACLManager.ts:726](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L726)

Enhanced time-based permission checking with custom schedules and holidays

#### Parameters

##### user

`UserContext`

User object

##### context

`Record`\<`string`, `unknown`\>

Access context

#### Returns

`Promise`\<`PermissionResult`\>

Permission result

***

### checkHolidayRestrictions()

> __checkHolidayRestrictions__(`currentDate`, `_holidaysConfig`): `Promise`\<`PermissionResult`\>

Defined in: [src/managers/ACLManager.ts:800](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L800)

Check holiday restrictions

#### Parameters

##### currentDate

`string`

Current date in YYYY-MM-DD format

##### \_holidaysConfig

`HolidayConfig`

#### Returns

`Promise`\<`PermissionResult`\>

Permission result

***

### checkMaintenanceMode()

> __checkMaintenanceMode__(`user`, `maintenanceConfig`): `PermissionResult`

Defined in: [src/managers/ACLManager.ts:642](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L642)

Check maintenance mode restrictions

#### Parameters

##### user

`UserContext`

User object

##### maintenanceConfig

`MaintenanceConfig` = `{}`

Maintenance mode configuration

#### Returns

`PermissionResult`

Permission result

***

### ~~checkPagePermission()~~

> __checkPagePermission__(`pageName`, `action`, `userContext`, `pageContent`): `Promise`\<`boolean`\>

Defined in: [src/managers/ACLManager.ts:409](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L409)

Check page permission with context-aware and audit logging
Now includes policy-based access control integration

#### Parameters

##### pageName

`string`

Name of the page

##### action

`string`

Action to check (view, edit, delete, rename, upload)

##### userContext

User context object (null for anonymous)

`UserContext` | `null`

##### pageContent

`string`

Page content to parse ACL from

#### Returns

`Promise`\<`boolean`\>

True if permission granted

#### Deprecated

Use checkPagePermissionWithContext() with WikiContext instead

***

### checkPagePermissionWithContext()

> __checkPagePermissionWithContext__(`wikiContext`, `action`): `Promise`\<`boolean`\>

Defined in: [src/managers/ACLManager.ts:288](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L288)

Check page permission using WikiContext

Checks if the user in WikiContext has permission to perform an action on a page.
Uses WikiContext as the single source of truth for page name, content, and user info.
Includes policy-based and page-level ACL evaluation with audit logging.

#### Parameters

##### wikiContext

`WikiContext`

The wiki context containing page and user info

##### action

`string`

Action to check (view, edit, delete, rename, upload)

#### Returns

`Promise`\<`boolean`\>

True if permission granted

#### Async

#### Example

```ts
const canEdit = await aclManager.checkPagePermissionWithContext(wikiContext, 'edit');
if (canEdit) console.log('User can edit page');
```

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

> __initialize__(): `Promise`\<`void`\>

Defined in: [src/managers/ACLManager.ts:173](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L173)

Initializes the ACLManager by loading policies and configurations

Loads access policies from configuration and initializes the policy
evaluator for context-aware permission evaluation.

#### Returns

`Promise`\<`void`\>

#### Async

#### Example

```ts
await aclManager.initialize();
console.log('ACL system ready');
```

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`initialize`](../../BaseManager/classes/default.md#initialize)

***

### initializeAuditLogging()

> __initializeAuditLogging__(): `Promise`\<`void`\>

Defined in: [src/managers/ACLManager.ts:193](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L193)

Initialize audit logging system based on configuration.

#### Returns

`Promise`\<`void`\>

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

### loadAccessPolicies()

> __loadAccessPolicies__(): `Promise`\<`void`\>

Defined in: [src/managers/ACLManager.ts:216](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L216)

Load access policies from ConfigurationManager.

#### Returns

`Promise`\<`void`\>

***

### logAccessDecision()

> __logAccessDecision__(`userOrObj`, `pageName?`, `action?`, `allowed?`, `reason?`, `_context?`): `void`

Defined in: [src/managers/ACLManager.ts:879](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L879)

Record/audit an access decision.
Accepts either a single object or positional args for backward compatibility.

#### Parameters

##### userOrObj

`UserContext` | `AccessDecisionLog`

##### pageName?

`string`

##### action?

`string`

##### allowed?

`boolean`

##### reason?

`string`

##### \_context?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`void`

***

### parsePageACL()

> __parsePageACL__(`content`): `Map`\<`string`, `Set`\<`string`\>\>

Defined in: [src/managers/ACLManager.ts:247](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L247)

Parses JSPWiki-style ACL markup from page content

Extracts ACL directives from page content in the format [{ALLOW action principals}].
Multiple actions and principals can be comma-separated.

#### Parameters

##### content

`string`

The page's raw markdown content

#### Returns

`Map`\<`string`, `Set`\<`string`\>\>

Map of actions to sets of allowed principals

#### Example

```ts
const acl = aclManager.parsePageACL('[{ALLOW view All}] [{ALLOW edit Admin}]');
// acl.get('view') => Set(['All'])
// acl.get('edit') => Set(['Admin'])
```

***

### performStandardACLCheck()

> __performStandardACLCheck__(`pageName`, `action`, `user`, `pageContent`): `Promise`\<`boolean`\>

Defined in: [src/managers/ACLManager.ts:471](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L471)

Perform standard ACL check (original logic)

#### Parameters

##### pageName

`string`

Name of the page

##### action

`string`

Action to check

##### user

User object

`UserContext` | `null`

##### pageContent

`string`

Page content

#### Returns

`Promise`\<`boolean`\>

True if permission granted

***

### removeACLMarkup()

> __removeACLMarkup__(`content`): `string`

Defined in: [src/managers/ACLManager.ts:915](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L915)

Strip ACL markup from page content before rendering menus/partials.
Supports common patterns: [{ALLOW ...}], [{DENY ...}], %%acl ... %%, (:acl ... :)

#### Parameters

##### content

`string`

#### Returns

`string`

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

Defined in: [src/managers/BaseManager.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L143)

Shutdown the manager and cleanup resources

Override this method in subclasses to perform cleanup logic.
Always call super.shutdown() at the end of overridden implementations.

#### Returns

`Promise`\<`void`\>

#### Example

```ts
async shutdown(): Promise<void> {
  // Your cleanup logic here
  await this.closeConnections();
  await super.shutdown();
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`shutdown`](../../BaseManager/classes/default.md#shutdown)

***

### stripACLMarkup()

> __stripACLMarkup__(`content`): `string`

Defined in: [src/managers/ACLManager.ts:924](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ACLManager.ts#L924)

#### Parameters

##### content

`string`

#### Returns

`string`
