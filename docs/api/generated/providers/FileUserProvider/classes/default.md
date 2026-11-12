[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FileUserProvider](../README.md) / default

# Class: default

Defined in: src/providers/FileUserProvider.ts:45

FileUserProvider - JSON file-based user and session storage

Stores users and sessions in JSON files on the filesystem.
This is the default provider for UserManager.

## Extends

- [`default`](../../BaseUserProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `FileUserProvider`

Defined in: src/providers/FileUserProvider.ts:52

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

Defined in: src/providers/BaseUserProvider.ts:35

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseUserProvider/classes/default.md).[`engine`](../../BaseUserProvider/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BaseUserProvider.ts:38

Whether provider has been initialized

#### Inherited from

[`default`](../../BaseUserProvider/classes/default.md).[`initialized`](../../BaseUserProvider/classes/default.md#initialized)

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BaseUserProvider/classes/default.md).[`providerDescription`](../../BaseUserProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseUserProvider/classes/default.md).[`providerFeatures`](../../BaseUserProvider/classes/default.md#providerfeatures)

***

### providerName?

> `protected` `optional` __providerName?__: `string`

Defined in: src/providers/BaseProvider.ts:73

What this provider calls itself (#1151).

`protected`, and set by a subclass in its constructor or field
initialisers. A provider that sets nothing reports the class name rather
than a placeholder, so the answer is never a lie — it is either what the
author chose or what the runtime knows.

#### Inherited from

[`default`](../../BaseUserProvider/classes/default.md).[`providerName`](../../BaseUserProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseUserProvider/classes/default.md).[`providerVersion`](../../BaseUserProvider/classes/default.md#providerversion)

## Methods

### backup()

> __backup__(): `Promise`\<`FileUserProviderBackupData`\>

Defined in: src/providers/FileUserProvider.ts:385

Backup all user and session data

#### Returns

`Promise`\<`FileUserProviderBackupData`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`backup`](../../BaseUserProvider/classes/default.md#backup)

***

### cleanExpiredSessions()

> __cleanExpiredSessions__(): `Promise`\<`number`\>

Defined in: src/providers/FileUserProvider.ts:363

Clean up expired sessions

#### Returns

`Promise`\<`number`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`cleanExpiredSessions`](../../BaseUserProvider/classes/default.md#cleanexpiredsessions)

***

### createSession()

> __createSession__(`sessionId`, `sessionData`): `Promise`\<`void`\>

Defined in: src/providers/FileUserProvider.ts:326

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

> __createUser__(`userData`): `Promise`\<[`User`](../../../types/User/interfaces/User.md)\>

Defined in: src/providers/FileUserProvider.ts:276

Create a new user

#### Parameters

##### userData

[`User`](../../../types/User/interfaces/User.md)

#### Returns

`Promise`\<[`User`](../../../types/User/interfaces/User.md)\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`createUser`](../../BaseUserProvider/classes/default.md#createuser)

***

### deleteSession()

> __deleteSession__(`sessionId`): `Promise`\<`boolean`\>

Defined in: src/providers/FileUserProvider.ts:349

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

Defined in: src/providers/FileUserProvider.ts:305

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

Defined in: src/providers/FileUserProvider.ts:342

Get all sessions

#### Returns

`Promise`\<`Map`\<`string`, [`UserSession`](../../../types/User/interfaces/UserSession.md)\>\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`getAllSessions`](../../BaseUserProvider/classes/default.md#getallsessions)

***

### getAllUsernames()

> __getAllUsernames__(): `Promise`\<`string`[]\>

Defined in: src/providers/FileUserProvider.ts:260

Get all usernames

#### Returns

`Promise`\<`string`[]\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`getAllUsernames`](../../BaseUserProvider/classes/default.md#getallusernames)

***

### getAllUsers()

> __getAllUsers__(): `Promise`\<`Map`\<`string`, [`User`](../../../types/User/interfaces/User.md)\>\>

Defined in: src/providers/FileUserProvider.ts:269

Get all users

#### Returns

`Promise`\<`Map`\<`string`, [`User`](../../../types/User/interfaces/User.md)\>\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`getAllUsers`](../../BaseUserProvider/classes/default.md#getallusers)

***

### getDurability()

> __getDurability__(): [`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

Defined in: src/providers/BaseProvider.ts:111

What this provider does with a record before it is durably stored.

Null means the provider has not stated it — silence rather than a default.
A provider that buffers and forgets to declare it must not inherit an
assertion that it writes immediately, which is precisely the bug this
contract replaces. A reporting layer renders null as "not stated", never
as "durable".

#### Returns

[`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

#### Inherited from

[`default`](../../BaseUserProvider/classes/default.md).[`getDurability`](../../BaseUserProvider/classes/default.md#getdurability)

***

### getProviderInfo()

> __getProviderInfo__(): `object`

Defined in: src/providers/FileUserProvider.ts:454

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

Defined in: src/providers/FileUserProvider.ts:335

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

Defined in: src/providers/FileUserProvider.ts:253

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

Defined in: src/providers/FileUserProvider.ts:64

Initialize the provider

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`initialize`](../../BaseUserProvider/classes/default.md#initialize)

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/providers/FileUserProvider.ts:414

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

Defined in: src/providers/FileUserProvider.ts:466

Shutdown the provider - clean up expired sessions then call parent

#### Returns

`void`

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`shutdown`](../../BaseUserProvider/classes/default.md#shutdown)

***

### updateUser()

> __updateUser__(`username`, `userData`): `Promise`\<`void`\>

Defined in: src/providers/FileUserProvider.ts:292

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

Defined in: src/providers/FileUserProvider.ts:319

Check if user exists

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`boolean`\>

#### Overrides

[`default`](../../BaseUserProvider/classes/default.md).[`userExists`](../../BaseUserProvider/classes/default.md#userexists)
