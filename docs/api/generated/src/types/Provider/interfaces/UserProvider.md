[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Provider](../README.md) / UserProvider

# Interface: UserProvider

Defined in: [src/types/Provider.ts:211](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L211)

User provider interface

Defines the contract for user storage backends.

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

### cleanupExpiredSessions()

> __cleanupExpiredSessions__(): `Promise`\<`number`\>

Defined in: [src/types/Provider.ts:288](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L288)

Clean up expired sessions

#### Returns

`Promise`\<`number`\>

Number of sessions deleted

***

### createSession()

> __createSession__(`sessionId`, `sessionData`): `Promise`\<`void`\>

Defined in: [src/types/Provider.ts:268](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L268)

Create session

#### Parameters

##### sessionId

`string`

Session ID

##### sessionData

[`UserSession`](../../User/interfaces/UserSession.md)

Session data object

#### Returns

`Promise`\<`void`\>

Promise that resolves when session is created

***

### createUser()

> __createUser__(`userData`): `Promise`\<[`User`](../../User/interfaces/User.md)\>

Defined in: [src/types/Provider.ts:237](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L237)

Create new user

#### Parameters

##### userData

[`UserCreateData`](../../User/interfaces/UserCreateData.md)

User creation data

#### Returns

`Promise`\<[`User`](../../User/interfaces/User.md)\>

Created user object

***

### deleteSession()

> __deleteSession__(`sessionId`): `Promise`\<`boolean`\>

Defined in: [src/types/Provider.ts:282](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L282)

Delete session

#### Parameters

##### sessionId

`string`

Session ID

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

***

### deleteUser()

> __deleteUser__(`username`): `Promise`\<`boolean`\>

Defined in: [src/types/Provider.ts:252](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L252)

Delete user

#### Parameters

##### username

`string`

Username

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

***

### getAllSessions()

> __getAllSessions__(): `Promise`\<`Map`\<`string`, [`UserSession`](../../User/interfaces/UserSession.md)\>\>

Defined in: [src/types/Provider.ts:307](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L307)

Get all active sessions

#### Returns

`Promise`\<`Map`\<`string`, [`UserSession`](../../User/interfaces/UserSession.md)\>\>

Map of session ID to session data

***

### getAllUsernames()

> __getAllUsernames__(): `Promise`\<`string`[]\>

Defined in: [src/types/Provider.ts:301](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L301)

Get all usernames

#### Returns

`Promise`\<`string`[]\>

Array of usernames

***

### getAllUsers()

> __getAllUsers__(): `Promise`\<`Map`\<`string`, [`User`](../../User/interfaces/User.md)\>\>

Defined in: [src/types/Provider.ts:230](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L230)

Get all users

#### Returns

`Promise`\<`Map`\<`string`, [`User`](../../User/interfaces/User.md)\>\>

Map of username to user objects

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

### getSession()

> __getSession__(`sessionId`): `Promise`\<[`UserSession`](../../User/interfaces/UserSession.md) \| `null`\>

Defined in: [src/types/Provider.ts:275](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L275)

Get session

#### Parameters

##### sessionId

`string`

Session ID

#### Returns

`Promise`\<[`UserSession`](../../User/interfaces/UserSession.md) \| `null`\>

Session object or null if not found/expired

***

### getUser()

> __getUser__(`username`): `Promise`\<[`User`](../../User/interfaces/User.md) \| `null`\>

Defined in: [src/types/Provider.ts:217](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L217)

Get user by username

#### Parameters

##### username

`string`

Username

#### Returns

`Promise`\<[`User`](../../User/interfaces/User.md) \| `null`\>

User object or null if not found

***

### getUserByEmail()

> __getUserByEmail__(`email`): `Promise`\<[`User`](../../User/interfaces/User.md) \| `null`\>

Defined in: [src/types/Provider.ts:224](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L224)

Get user by email

#### Parameters

##### email

`string`

Email address

#### Returns

`Promise`\<[`User`](../../User/interfaces/User.md) \| `null`\>

User object or null if not found

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

***

### updateUser()

> __updateUser__(`username`, `updates`): `Promise`\<[`User`](../../User/interfaces/User.md)\>

Defined in: [src/types/Provider.ts:245](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L245)

Update user

#### Parameters

##### username

`string`

Username

##### updates

[`UserUpdateData`](../../User/interfaces/UserUpdateData.md)

Partial user data to update

#### Returns

`Promise`\<[`User`](../../User/interfaces/User.md)\>

Updated user object

***

### userExists()

> __userExists__(`username`): `Promise`\<`boolean`\>

Defined in: [src/types/Provider.ts:295](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L295)

Check if user exists

#### Parameters

##### username

`string`

Username to check

#### Returns

`Promise`\<`boolean`\>

True if user exists

***

### validateCredentials()

> __validateCredentials__(`username`, `password`): `Promise`\<[`User`](../../User/interfaces/User.md) \| `null`\>

Defined in: [src/types/Provider.ts:260](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L260)

Validate user credentials

#### Parameters

##### username

`string`

Username

##### password

`string`

Plain text password

#### Returns

`Promise`\<[`User`](../../User/interfaces/User.md) \| `null`\>

User object if valid, null if invalid
