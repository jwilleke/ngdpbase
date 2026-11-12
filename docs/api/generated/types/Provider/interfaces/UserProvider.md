[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / UserProvider

# Interface: UserProvider

Defined in: src/types/Provider.ts:534

User provider interface

Defines the contract for user storage backends.

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

### cleanupExpiredSessions()

> __cleanupExpiredSessions__(): `Promise`\<`number`\>

Defined in: src/types/Provider.ts:611

Clean up expired sessions

#### Returns

`Promise`\<`number`\>

Number of sessions deleted

***

### createSession()

> __createSession__(`sessionId`, `sessionData`): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:591

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

Defined in: src/types/Provider.ts:560

Create new user

#### Parameters

##### userData

[`User`](../../User/interfaces/User.md)

User object with all fields populated

#### Returns

`Promise`\<[`User`](../../User/interfaces/User.md)\>

Created user object

***

### deleteSession()

> __deleteSession__(`sessionId`): `Promise`\<`boolean`\>

Defined in: src/types/Provider.ts:605

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

Defined in: src/types/Provider.ts:575

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

Defined in: src/types/Provider.ts:630

Get all active sessions

#### Returns

`Promise`\<`Map`\<`string`, [`UserSession`](../../User/interfaces/UserSession.md)\>\>

Map of session ID to session data

***

### getAllUsernames()

> __getAllUsernames__(): `Promise`\<`string`[]\>

Defined in: src/types/Provider.ts:624

Get all usernames

#### Returns

`Promise`\<`string`[]\>

Array of usernames

***

### getAllUsers()

> __getAllUsers__(): `Promise`\<`Map`\<`string`, [`User`](../../User/interfaces/User.md)\>\>

Defined in: src/types/Provider.ts:553

Get all users

#### Returns

`Promise`\<`Map`\<`string`, [`User`](../../User/interfaces/User.md)\>\>

Map of username to user objects

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

### getSession()

> __getSession__(`sessionId`): `Promise`\<[`UserSession`](../../User/interfaces/UserSession.md) \| `null`\>

Defined in: src/types/Provider.ts:598

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

Defined in: src/types/Provider.ts:540

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

Defined in: src/types/Provider.ts:547

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

Defined in: src/types/Provider.ts:57

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`initialize`](BaseProvider.md#initialize)

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

***

### updateUser()

> __updateUser__(`username`, `updates`): `Promise`\<[`User`](../../User/interfaces/User.md)\>

Defined in: src/types/Provider.ts:568

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

Defined in: src/types/Provider.ts:618

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

Defined in: src/types/Provider.ts:583

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
