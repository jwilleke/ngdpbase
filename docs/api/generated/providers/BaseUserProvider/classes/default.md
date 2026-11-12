[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseUserProvider](../README.md) / default

# Abstract Class: default

Defined in: src/providers/BaseUserProvider.ts:33

BaseUserProvider - Abstract interface for user storage providers

All user storage providers must extend this class and implement its methods.
Providers handle the actual storage and retrieval of user accounts and sessions,
whether from filesystem (JSON), database, LDAP, or other backends.

 BaseUserProvider

## See

- FileUserProvider for filesystem implementation
- UserManager for usage

## Extends

- [`default`](../../BaseProvider/classes/default.md)

## Extended by

- [`default`](../../FileUserProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `BaseUserProvider`

Defined in: src/providers/BaseUserProvider.ts:47

Create a new user provider

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The WikiEngine instance

#### Returns

`BaseUserProvider`

#### Throws

If engine is not provided

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`constructor`](../../BaseProvider/classes/default.md#constructor)

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/BaseUserProvider.ts:35

Reference to the wiki engine

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BaseUserProvider.ts:38

Whether provider has been initialized

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerDescription`](../../BaseProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerFeatures`](../../BaseProvider/classes/default.md#providerfeatures)

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

[`default`](../../BaseProvider/classes/default.md).[`providerName`](../../BaseProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerVersion`](../../BaseProvider/classes/default.md#providerversion)

## Methods

### backup()

> `abstract` __backup__(): `Promise`\<[`BackupData`](../interfaces/BackupData.md)\>

Defined in: src/providers/BaseUserProvider.ts:210

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

Defined in: src/providers/BaseUserProvider.ts:200

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

Defined in: src/providers/BaseUserProvider.ts:158

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

> `abstract` __createUser__(`userData`): `Promise`\<[`User`](../../../types/User/interfaces/User.md)\>

Defined in: src/providers/BaseUserProvider.ts:112

Create a new user

#### Parameters

##### userData

[`User`](../../../types/User/interfaces/User.md)

User data (password should be hashed by UserManager)

#### Returns

`Promise`\<[`User`](../../../types/User/interfaces/User.md)\>

Created user object

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### deleteSession()

> `abstract` __deleteSession__(`sessionId`): `Promise`\<`boolean`\>

Defined in: src/providers/BaseUserProvider.ts:190

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

Defined in: src/providers/BaseUserProvider.ts:135

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

Defined in: src/providers/BaseUserProvider.ts:179

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

Defined in: src/providers/BaseUserProvider.ts:91

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

Defined in: src/providers/BaseUserProvider.ts:101

Get all users

#### Returns

`Promise`\<`Map`\<`string`, [`User`](../../../types/User/interfaces/User.md)\>\>

Map of username to user object

#### Async

#### Throws

Always throws - must be implemented by subclass

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

[`default`](../../BaseProvider/classes/default.md).[`getDurability`](../../BaseProvider/classes/default.md#getdurability)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/BaseUserProvider.ts:228

Get provider information

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`getProviderInfo`](../../BaseProvider/classes/default.md#getproviderinfo)

***

### getSession()

> `abstract` __getSession__(`sessionId`): `Promise`\<[`UserSession`](../../../types/User/interfaces/UserSession.md) \| `null`\>

Defined in: src/providers/BaseUserProvider.ts:169

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

Defined in: src/providers/BaseUserProvider.ts:81

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

Defined in: src/providers/BaseUserProvider.ts:70

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

Defined in: src/providers/BaseUserProvider.ts:221

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

Defined in: src/providers/BaseUserProvider.ts:243

Shutdown the provider (cleanup resources)

#### Returns

`void`

#### Async

***

### updateUser()

> `abstract` __updateUser__(`username`, `userData`): `Promise`\<`void`\>

Defined in: src/providers/BaseUserProvider.ts:124

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

Defined in: src/providers/BaseUserProvider.ts:146

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
