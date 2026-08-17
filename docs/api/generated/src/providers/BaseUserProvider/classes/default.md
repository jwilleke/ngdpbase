[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/providers/BaseUserProvider](../README.md) / default

# Abstract Class: default

Defined in: [src/providers/BaseUserProvider.ts:41](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L41)

BaseUserProvider - Abstract interface for user storage providers

All user storage providers must extend this class and implement its methods.
Providers handle the actual storage and retrieval of user accounts and sessions,
whether from filesystem (JSON), database, LDAP, or other backends.

 BaseUserProvider

## See

- FileUserProvider for filesystem implementation
- UserManager for usage

## Extended by

- [`default`](../../FileUserProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `BaseUserProvider`

Defined in: [src/providers/BaseUserProvider.ts:55](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L55)

Create a new user provider

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The WikiEngine instance

#### Returns

`BaseUserProvider`

#### Throws

If engine is not provided

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/providers/BaseUserProvider.ts:43](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L43)

Reference to the wiki engine

***

### initialized

> __initialized__: `boolean`

Defined in: [src/providers/BaseUserProvider.ts:46](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L46)

Whether provider has been initialized

## Methods

### backup()

> `abstract` __backup__(): `Promise`\<[`BackupData`](../interfaces/BackupData.md)\>

Defined in: [src/providers/BaseUserProvider.ts:218](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L218)

Backup all user and session data

#### Returns

`Promise`\<[`BackupData`](../interfaces/BackupData.md)\>

Backup data

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### cleanExpiredSessions()

> `abstract` __cleanExpiredSessions__(): `Promise`\<`number`\>

Defined in: [src/providers/BaseUserProvider.ts:208](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L208)

Clean up expired sessions

#### Returns

`Promise`\<`number`\>

Number of sessions removed

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### createSession()

> `abstract` __createSession__(`sessionId`, `sessionData`): `Promise`\<`void`\>

Defined in: [src/providers/BaseUserProvider.ts:166](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L166)

Create a new session

#### Parameters

##### sessionId

`string`

Session ID

##### sessionData

[`UserSession`](../../../types/User/interfaces/UserSession.md)

Session data

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### createUser()

> `abstract` __createUser__(`username`, `userData`): `Promise`\<`void`\>

Defined in: [src/providers/BaseUserProvider.ts:120](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L120)

Create a new user

#### Parameters

##### username

`string`

Username

##### userData

[`UserCreateData`](../../../types/User/interfaces/UserCreateData.md)

User data (password should be hashed by UserManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### deleteSession()

> `abstract` __deleteSession__(`sessionId`): `Promise`\<`boolean`\>

Defined in: [src/providers/BaseUserProvider.ts:198](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L198)

Delete a session

#### Parameters

##### sessionId

`string`

Session ID to delete

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### deleteUser()

> `abstract` __deleteUser__(`username`): `Promise`\<`boolean`\>

Defined in: [src/providers/BaseUserProvider.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L143)

Delete a user

#### Parameters

##### username

`string`

Username to delete

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### getAllSessions()

> `abstract` __getAllSessions__(): `Promise`\<`Map`\<`string`, [`UserSession`](../../../types/User/interfaces/UserSession.md)\>\>

Defined in: [src/providers/BaseUserProvider.ts:187](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L187)

Get all sessions

#### Returns

`Promise`\<`Map`\<`string`, [`UserSession`](../../../types/User/interfaces/UserSession.md)\>\>

Map of sessionId to session object

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### getAllUsernames()

> `abstract` __getAllUsernames__(): `Promise`\<`string`[]\>

Defined in: [src/providers/BaseUserProvider.ts:98](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L98)

Get all usernames

#### Returns

`Promise`\<`string`[]\>

Array of all usernames

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### getAllUsers()

> `abstract` __getAllUsers__(): `Promise`\<`Map`\<`string`, [`User`](../../../types/User/interfaces/User.md)\>\>

Defined in: [src/providers/BaseUserProvider.ts:108](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L108)

Get all users

#### Returns

`Promise`\<`Map`\<`string`, [`User`](../../../types/User/interfaces/User.md)\>\>

Map of username to user object

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../interfaces/ProviderInfo.md)

Defined in: [src/providers/BaseUserProvider.ts:236](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L236)

Get provider information

#### Returns

[`ProviderInfo`](../interfaces/ProviderInfo.md)

Provider metadata

***

### getSession()

> `abstract` __getSession__(`sessionId`): `Promise`\<[`UserSession`](../../../types/User/interfaces/UserSession.md) \| `null`\>

Defined in: [src/providers/BaseUserProvider.ts:177](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L177)

Get a session by ID

#### Parameters

##### sessionId

`string`

Session ID

#### Returns

`Promise`\<[`UserSession`](../../../types/User/interfaces/UserSession.md) \| `null`\>

Session object or null if not found

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### getUser()

> `abstract` __getUser__(`username`): `Promise`\<[`User`](../../../types/User/interfaces/User.md) \| `null`\>

Defined in: [src/providers/BaseUserProvider.ts:88](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L88)

Get a user by username

#### Parameters

##### username

`string`

Username to look up

#### Returns

`Promise`\<[`User`](../../../types/User/interfaces/User.md) \| `null`\>

User object or null if not found

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### initialize()

> `abstract` __initialize__(): `Promise`\<`void`\>

Defined in: [src/providers/BaseUserProvider.ts:77](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L77)

Initialize the provider

IMPORTANT: Providers MUST access configuration via ConfigurationManager:
  const configManager = this.engine.getManager('ConfigurationManager');
  const value = configManager.getProperty('key', 'default');

Do NOT read configuration files directly.

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### restore()

> `abstract` __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/providers/BaseUserProvider.ts:229](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L229)

Restore user and session data from backup

#### Parameters

##### backupData

[`BackupData`](../interfaces/BackupData.md)

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### shutdown()

> __shutdown__(): `void`

Defined in: [src/providers/BaseUserProvider.ts:251](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L251)

Shutdown the provider (cleanup resources)

#### Returns

`void`

#### Async

***

### updateUser()

> `abstract` __updateUser__(`username`, `userData`): `Promise`\<`void`\>

Defined in: [src/providers/BaseUserProvider.ts:132](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L132)

Update an existing user

#### Parameters

##### username

`string`

Username

##### userData

[`UserUpdateData`](../../../types/User/interfaces/UserUpdateData.md)

Updated user data

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### userExists()

> `abstract` __userExists__(`username`): `Promise`\<`boolean`\>

Defined in: [src/providers/BaseUserProvider.ts:154](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L154)

Check if user exists

#### Parameters

##### username

`string`

Username to check

#### Returns

`Promise`\<`boolean`\>

True if user exists

#### Async

#### Throws

Always throws - must be implemented by subclass
