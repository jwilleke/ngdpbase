[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/UserManager](../README.md) / export=

# Class: export=

Defined in: [src/managers/UserManager.ts:157](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L157)

UserManager - Handles user authentication, authorization, and roles

Similar to JSPWiki's UserManager with role-based permissions. This manager
orchestrates user operations through a pluggable provider system, allowing
different storage backends (file, database, LDAP, etc.) to be used.

Key responsibilities:

- User authentication (login/logout)
- Password management with hashing
- Role and permission management
- Session management
- User profile management
- Provider abstraction for storage

Follows JSPWiki's provider pattern where the actual storage implementation
is abstracted behind a provider interface. This allows for different storage
backends (file, database, LDAP, etc.) to be swapped via configuration.

 UserManager

## See

- [BaseManager](../../BaseManager/classes/default.md) for base functionality
- FileUserProvider for default provider implementation

## Example

```ts
const userManager = engine.getManager('UserManager');
const user = await userManager.authenticateUser('admin', 'password');
if (user) logger.info('Logged in:', user.username);
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new export=__(`engine`): `UserManager`

Defined in: [src/managers/UserManager.ts:171](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L171)

Creates a new UserManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`UserManager`

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

### assignRole()

> __assignRole__(`username`, `roleName`): `Promise`\<`boolean`\>

Defined in: [src/managers/UserManager.ts:1099](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1099)

#### Parameters

##### username

`string`

##### roleName

`string`

#### Returns

`Promise`\<`boolean`\>

***

### authenticateUser()

> __authenticateUser__(`username`, `password`): `Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\> & `object` \| `null`\>

Defined in: [src/managers/UserManager.ts:519](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L519)

Authenticate user with username/password

#### Parameters

##### username

`string`

Username

##### password

`string`

Password

#### Returns

`Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\> & `object` \| `null`\>

User object if authenticated

***

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: [src/managers/UserManager.ts:1199](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1199)

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

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### checkDisplayNamePageConflict()

> __checkDisplayNamePageConflict__(`displayName`, `excludeUsername`): `Promise`\<`boolean`\>

Defined in: [src/managers/UserManager.ts:681](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L681)

Check if a display name conflicts with existing page names or other users

#### Parameters

##### displayName

`string`

Display name to check

##### excludeUsername

Username to exclude from the check (for updates)

`string` | `null`

#### Returns

`Promise`\<`boolean`\>

True if conflict exists

***

### createDefaultAdmin()

> __createDefaultAdmin__(): `Promise`\<`void`\>

Defined in: [src/managers/UserManager.ts:380](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L380)

Create default admin user

#### Returns

`Promise`\<`void`\>

***

### createOrUpdateExternalUser()

> __createOrUpdateExternalUser__(`externalUserData`): `Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>\>

Defined in: [src/managers/UserManager.ts:468](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L468)

Create or update external user from OAuth/JWT token

#### Parameters

##### externalUserData

`ExternalUserData`

User data from external provider

#### Returns

`Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>\>

User object

***

### createRole()

> __createRole__(`roleData`): `never`

Defined in: [src/managers/UserManager.ts:995](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L995)

#### Parameters

##### roleData

`RoleCreateData`

#### Returns

`never`

***

### createSession()

> __createSession__(`username`, `additionalData`): `Promise`\<`string`\>

Defined in: [src/managers/UserManager.ts:1151](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1151)

#### Parameters

##### username

`string`

##### additionalData

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`Promise`\<`string`\>

***

### createUser()

> __createUser__(`userData`): `Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>\>

Defined in: [src/managers/UserManager.ts:773](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L773)

Create new user

#### Parameters

##### userData

`UserCreateInput`

User data

#### Returns

`Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>\>

Created user (without password)

***

### createUserPage()

> __createUserPage__(`user`): `Promise`\<`boolean`\>

Defined in: [src/managers/UserManager.ts:714](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L714)

Create a user page for a new user

#### Parameters

##### user

[`User`](../../../types/User/interfaces/User.md)

User object

#### Returns

`Promise`\<`boolean`\>

True if user page was created successfully

***

### deleteRole()

> __deleteRole__(`roleName`): `never`

Defined in: [src/managers/UserManager.ts:1001](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1001)

#### Parameters

##### roleName

`string`

#### Returns

`never`

***

### deleteSession()

> __deleteSession__(`sessionId`): `Promise`\<`void`\>

Defined in: [src/managers/UserManager.ts:1178](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1178)

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<`void`\>

***

### deleteUser()

> __deleteUser__(`username`): `Promise`\<`boolean`\>

Defined in: [src/managers/UserManager.ts:931](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L931)

Delete user

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`boolean`\>

***

### deleteUserSessions()

> __deleteUserSessions__(`username`): `Promise`\<`void`\>

Defined in: [src/managers/UserManager.ts:1185](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1185)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`void`\>

***

### ensureAuthenticated()

> __ensureAuthenticated__(`req`, `res`, `next`): `void`

Defined in: [src/managers/UserManager.ts:1040](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1040)

#### Parameters

##### req

`Request`

##### res

`Response`

##### next

`NextFunction`

#### Returns

`void`

***

### getAnonymousUser()

> __getAnonymousUser__(): `UserContext`

Defined in: [src/managers/UserManager.ts:1069](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1069)

#### Returns

`UserContext`

***

### getAssertedUser()

> __getAssertedUser__(): `UserContext`

Defined in: [src/managers/UserManager.ts:1078](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1078)

#### Returns

`UserContext`

***

### getCurrentUser()

> __getCurrentUser__(`req`): `Promise`\<`UserContext`\>

Defined in: [src/managers/UserManager.ts:1011](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1011)

#### Parameters

##### req

`Request`

#### Returns

`Promise`\<`UserContext`\>

***

### getCurrentUserProvider()

> __getCurrentUserProvider__(): [`UserProvider`](../../../types/Provider/interfaces/UserProvider.md) \| `null`

Defined in: [src/managers/UserManager.ts:312](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L312)

Get the current user provider instance

#### Returns

[`UserProvider`](../../../types/Provider/interfaces/UserProvider.md) \| `null`

The active provider

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

### getJobTitleFromRoles()

> __getJobTitleFromRoles__(`roles`): `string`

Defined in: [src/managers/UserManager.ts:1144](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1144)

#### Parameters

##### roles

`string`[]

#### Returns

`string`

***

### getPermissions()

> __getPermissions__(): `Map`\<`string`, `string`\>

Defined in: [src/managers/UserManager.ts:987](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L987)

#### Returns

`Map`\<`string`, `string`\>

***

### getRole()

> __getRole__(`roleName`): [`Role`](../../../types/User/interfaces/Role.md) \| `null`

Defined in: [src/managers/UserManager.ts:991](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L991)

#### Parameters

##### roleName

`string`

#### Returns

[`Role`](../../../types/User/interfaces/Role.md) \| `null`

***

### getRoleCompetencies()

> __getRoleCompetencies__(`role`): `string`[]

Defined in: [src/managers/UserManager.ts:1135](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1135)

#### Parameters

##### role

`string`

#### Returns

`string`[]

***

### getRoles()

> __getRoles__(): [`Role`](../../../types/User/interfaces/Role.md)[]

Defined in: [src/managers/UserManager.ts:983](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L983)

#### Returns

[`Role`](../../../types/User/interfaces/Role.md)[]

***

### getSession()

> __getSession__(`sessionId`): `Promise`\<[`UserSession`](../../../types/User/interfaces/UserSession.md) \| `null`\>

Defined in: [src/managers/UserManager.ts:1171](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1171)

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<[`UserSession`](../../../types/User/interfaces/UserSession.md) \| `null`\>

***

### getUser()

> __getUser__(`username`): `Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\> \| `undefined`\>

Defined in: [src/managers/UserManager.ts:971](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L971)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\> \| `undefined`\>

***

### getUserPermissions()

> __getUserPermissions__(`username`): `Promise`\<`string`[]\>

Defined in: [src/managers/UserManager.ts:606](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L606)

Get user's effective permissions from PolicyManager

#### Parameters

##### username

`string`

Username (null for anonymous)

#### Returns

`Promise`\<`string`[]\>

Array of permission strings

***

### getUsers()

> __getUsers__(): `Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>[]\>

Defined in: [src/managers/UserManager.ts:960](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L960)

#### Returns

`Promise`\<`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\>[]\>

***

### hashPassword()

> __hashPassword__(`password`): `string`

Defined in: [src/managers/UserManager.ts:338](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L338)

Simple password hashing using crypto

#### Parameters

##### password

`string`

Plain text password

#### Returns

`string`

Hashed password

***

### hasPermission()

> __hasPermission__(`username`, `action`): `Promise`\<`boolean`\>

Defined in: [src/managers/UserManager.ts:554](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L554)

Check if user has permission using policy-based access control

#### Parameters

##### username

`string`

Username (null for anonymous)

##### action

`string`

Action/permission to check (e.g., 'page:create', 'admin:users')

#### Returns

`Promise`\<`boolean`\>

True if user has permission via policies

***

### hasRole()

> __hasRole__(`username`, `roleName`): `Promise`\<`boolean`\>

Defined in: [src/managers/UserManager.ts:1088](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1088)

#### Parameters

##### username

`string`

##### roleName

`string`

#### Returns

`Promise`\<`boolean`\>

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: [src/managers/UserManager.ts:190](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L190)

Initialize the UserManager and load the configured provider

Loads the user provider, role definitions, and creates a default admin
user if no users exist.

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object (unused, reads from ConfigurationManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available or provider fails to load

#### Example

```ts
await userManager.initialize();
// Creates default admin if no users exist
```

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`initialize`](../../BaseManager/classes/default.md#initialize)

***

### isAdminUsingDefaultPassword()

> __isAdminUsingDefaultPassword__(): `Promise`\<`boolean`\>

Defined in: [src/managers/UserManager.ts:360](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L360)

Check if admin user still has the default password

#### Returns

`Promise`\<`boolean`\>

True if admin has default password

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

### removeRole()

> __removeRole__(`username`, `roleName`): `Promise`\<`boolean`\>

Defined in: [src/managers/UserManager.ts:1118](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1118)

#### Parameters

##### username

`string`

##### roleName

`string`

#### Returns

`Promise`\<`boolean`\>

***

### requirePermissions()

> __requirePermissions__(`requiredPermissions`): (`req`, `res`, `next`) => `void`

Defined in: [src/managers/UserManager.ts:1051](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1051)

#### Parameters

##### requiredPermissions

`string`[] = `[]`

#### Returns

> (`req`, `res`, `next`): `void`

##### Parameters

###### req

`Request`

###### res

`Response`

###### next

`NextFunction`

##### Returns

`void`

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/managers/UserManager.ts:1229](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1229)

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

#### Overrides

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

### updateRolePermissions()

> __updateRolePermissions__(`_roleName`, `_updates`): `never`

Defined in: [src/managers/UserManager.ts:1006](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L1006)

#### Parameters

##### \_roleName

`string`

##### \_updates

`unknown`

#### Returns

`never`

***

### updateUser()

> __updateUser__(`username`, `updates`): `Promise`\<[`User`](../../../types/User/interfaces/User.md)\>

Defined in: [src/managers/UserManager.ts:872](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L872)

Update user

#### Parameters

##### username

`string`

##### updates

`UserUpdateInput`

#### Returns

`Promise`\<[`User`](../../../types/User/interfaces/User.md)\>

***

### verifyPassword()

> __verifyPassword__(`password`, `hash`): `boolean`

Defined in: [src/managers/UserManager.ts:352](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/UserManager.ts#L352)

Verify password against hash

#### Parameters

##### password

`string`

Plain text password

##### hash

`string`

Stored hash

#### Returns

`boolean`

True if password matches
