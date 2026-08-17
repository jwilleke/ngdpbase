[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/providers/FileUserProvider](../README.md) / default

# Class: default

Defined in: [src/providers/FileUserProvider.ts:42](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L42)

FileUserProvider - JSON file-based user and session storage

Stores users and sessions in JSON files on the filesystem.
This is the default provider for UserManager.

## Extends

- [`default`](../../BaseUserProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `FileUserProvider`

Defined in: [src/providers/FileUserProvider.ts:49](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L49)

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`FileUserProvider`

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`constructor`](../../BaseUserProvider/classes/default.md#constructor)

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/providers/BaseUserProvider.ts:43](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L43)

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseUserProvider/classes/default.md).[`engine`](../../BaseUserProvider/classes/default.md#engine)

***

### initialized

> __initialized__: `boolean`

Defined in: [src/providers/BaseUserProvider.ts:46](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseUserProvider.ts#L46)

Whether provider has been initialized

#### Inherited from

[`default`](../../BaseUserProvider/classes/default.md).[`initialized`](../../BaseUserProvider/classes/default.md#initialized)

## Methods

### backup()

> __backup__(): `Promise`\<`FileUserProviderBackupData`\>

Defined in: [src/providers/FileUserProvider.ts:329](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L329)

Backup all user and session data

#### Returns

`Promise`\<`FileUserProviderBackupData`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`backup`](../../BaseUserProvider/classes/default.md#backup)

***

### cleanExpiredSessions()

> __cleanExpiredSessions__(): `Promise`\<`number`\>

Defined in: [src/providers/FileUserProvider.ts:307](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L307)

Clean up expired sessions

#### Returns

`Promise`\<`number`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`cleanExpiredSessions`](../../BaseUserProvider/classes/default.md#cleanexpiredsessions)

***

### createSession()

> __createSession__(`sessionId`, `sessionData`): `Promise`\<`void`\>

Defined in: [src/providers/FileUserProvider.ts:270](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L270)

Create a new session

#### Parameters

##### sessionId

`string`

##### sessionData

[`UserSession`](../../../types/User/interfaces/UserSession.md)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`createSession`](../../BaseUserProvider/classes/default.md#createsession)

***

### createUser()

> __createUser__(`username`, `userData`): `Promise`\<`void`\>

Defined in: [src/providers/FileUserProvider.ts:223](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L223)

Create a new user

#### Parameters

##### username

`string`

##### userData

[`UserCreateData`](../../../types/User/interfaces/UserCreateData.md)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`createUser`](../../BaseUserProvider/classes/default.md#createuser)

***

### deleteSession()

> __deleteSession__(`sessionId`): `Promise`\<`boolean`\>

Defined in: [src/providers/FileUserProvider.ts:293](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L293)

Delete a session

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<`boolean`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`deleteSession`](../../BaseUserProvider/classes/default.md#deletesession)

***

### deleteUser()

> __deleteUser__(`username`): `Promise`\<`boolean`\>

Defined in: [src/providers/FileUserProvider.ts:249](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L249)

Delete a user

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`boolean`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`deleteUser`](../../BaseUserProvider/classes/default.md#deleteuser)

***

### getAllSessions()

> __getAllSessions__(): `Promise`\<`Map`\<`string`, [`UserSession`](../../../types/User/interfaces/UserSession.md)\>\>

Defined in: [src/providers/FileUserProvider.ts:286](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L286)

Get all sessions

#### Returns

`Promise`\<`Map`\<`string`, [`UserSession`](../../../types/User/interfaces/UserSession.md)\>\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`getAllSessions`](../../BaseUserProvider/classes/default.md#getallsessions)

***

### getAllUsernames()

> __getAllUsernames__(): `Promise`\<`string`[]\>

Defined in: [src/providers/FileUserProvider.ts:209](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L209)

Get all usernames

#### Returns

`Promise`\<`string`[]\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`getAllUsernames`](../../BaseUserProvider/classes/default.md#getallusernames)

***

### getAllUsers()

> __getAllUsers__(): `Promise`\<`Map`\<`string`, [`User`](../../../types/User/interfaces/User.md)\>\>

Defined in: [src/providers/FileUserProvider.ts:216](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L216)

Get all users

#### Returns

`Promise`\<`Map`\<`string`, [`User`](../../../types/User/interfaces/User.md)\>\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`getAllUsers`](../../BaseUserProvider/classes/default.md#getallusers)

***

### getProviderInfo()

> __getProviderInfo__(): `object`

Defined in: [src/providers/FileUserProvider.ts:398](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L398)

Get provider information

#### Returns

`object`

##### description

> __description__: `string`

##### features

> __features__: `string`[]

##### name

> __name__: `string`

##### version

> __version__: `string`

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`getProviderInfo`](../../BaseUserProvider/classes/default.md#getproviderinfo)

***

### getSession()

> __getSession__(`sessionId`): `Promise`\<[`UserSession`](../../../types/User/interfaces/UserSession.md) \| `null`\>

Defined in: [src/providers/FileUserProvider.ts:279](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L279)

Get a session by ID

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<[`UserSession`](../../../types/User/interfaces/UserSession.md) \| `null`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`getSession`](../../BaseUserProvider/classes/default.md#getsession)

***

### getUser()

> __getUser__(`username`): `Promise`\<[`User`](../../../types/User/interfaces/User.md) \| `null`\>

Defined in: [src/providers/FileUserProvider.ts:202](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L202)

Get a user by username

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`User`](../../../types/User/interfaces/User.md) \| `null`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`getUser`](../../BaseUserProvider/classes/default.md#getuser)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: [src/providers/FileUserProvider.ts:61](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L61)

Initialize the provider

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`initialize`](../../BaseUserProvider/classes/default.md#initialize)

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/providers/FileUserProvider.ts:358](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L358)

Restore user and session data from backup

#### Parameters

##### backupData

[`BackupData`](../../BaseUserProvider/interfaces/BackupData.md)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`restore`](../../BaseUserProvider/classes/default.md#restore)

***

### shutdown()

> __shutdown__(): `void`

Defined in: [src/providers/FileUserProvider.ts:410](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L410)

Shutdown the provider - clean up expired sessions then call parent

#### Returns

`void`

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`shutdown`](../../BaseUserProvider/classes/default.md#shutdown)

***

### updateUser()

> __updateUser__(`username`, `userData`): `Promise`\<`void`\>

Defined in: [src/providers/FileUserProvider.ts:236](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L236)

Update an existing user

#### Parameters

##### username

`string`

##### userData

[`UserUpdateData`](../../../types/User/interfaces/UserUpdateData.md)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`updateUser`](../../BaseUserProvider/classes/default.md#updateuser)

***

### userExists()

> __userExists__(`username`): `Promise`\<`boolean`\>

Defined in: [src/providers/FileUserProvider.ts:263](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileUserProvider.ts#L263)

Check if user exists

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`boolean`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`userExists`](../../BaseUserProvider/classes/default.md#userexists)
