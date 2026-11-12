[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FileBackupProvider](../README.md) / default

# Class: default

Defined in: src/providers/FileBackupProvider.ts:26

## Extends

- [`default`](../../BaseBackupProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `FileBackupProvider`

Defined in: src/providers/FileBackupProvider.ts:29

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`FileBackupProvider`

#### Overrides

[`default`](../../BaseBackupProvider/classes/default.md).[`constructor`](../../BaseBackupProvider/classes/default.md#constructor)

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/BaseBackupProvider.ts:43

#### Inherited from

[`default`](../../BaseBackupProvider/classes/default.md).[`engine`](../../BaseBackupProvider/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BaseBackupProvider.ts:44

#### Inherited from

[`default`](../../BaseBackupProvider/classes/default.md).[`initialized`](../../BaseBackupProvider/classes/default.md#initialized)

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BaseBackupProvider/classes/default.md).[`providerDescription`](../../BaseBackupProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseBackupProvider/classes/default.md).[`providerFeatures`](../../BaseBackupProvider/classes/default.md#providerfeatures)

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

[`default`](../../BaseBackupProvider/classes/default.md).[`providerName`](../../BaseBackupProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseBackupProvider/classes/default.md).[`providerVersion`](../../BaseBackupProvider/classes/default.md#providerversion)

## Methods

### backupExists()

> __backupExists__(`idOrPath`): `Promise`\<`boolean`\>

Defined in: src/providers/FileBackupProvider.ts:72

Whether a backup object exists, by full path or bare filename.

#### Parameters

##### idOrPath

`string`

#### Returns

`Promise`\<`boolean`\>

#### Overrides

[`default`](../../BaseBackupProvider/classes/default.md).[`backupExists`](../../BaseBackupProvider/classes/default.md#backupexists)

***

### ensureContainer()

> __ensureContainer__(): `Promise`\<`void`\>

Defined in: src/providers/FileBackupProvider.ts:52

Ensure the storage container exists.

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseBackupProvider/classes/default.md).[`ensureContainer`](../../BaseBackupProvider/classes/default.md#ensurecontainer)

***

### freeSpace()

> __freeSpace__(): `Promise`\<`number` \| `null`\>

Defined in: src/providers/FileBackupProvider.ts:114

Free bytes on the backup directory's filesystem for this process (#1563).

#### Returns

`Promise`\<`number` \| `null`\>

#### Overrides

[`default`](../../BaseBackupProvider/classes/default.md).[`freeSpace`](../../BaseBackupProvider/classes/default.md#freespace)

***

### getBackupDirectory()

> __getBackupDirectory__(): `string`

Defined in: src/providers/FileBackupProvider.ts:48

The resolved backup container location (directory / bucket prefix).

#### Returns

`string`

#### Overrides

[`default`](../../BaseBackupProvider/classes/default.md).[`getBackupDirectory`](../../BaseBackupProvider/classes/default.md#getbackupdirectory)

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

[`default`](../../BaseBackupProvider/classes/default.md).[`getDurability`](../../BaseBackupProvider/classes/default.md#getdurability)

***

### getProviderInfo()

> __getProviderInfo__(): [`BackupProviderInfo`](../../BaseBackupProvider/interfaces/BackupProviderInfo.md)

Defined in: src/providers/FileBackupProvider.ts:120

Provider metadata.

#### Returns

[`BackupProviderInfo`](../../BaseBackupProvider/interfaces/BackupProviderInfo.md)

#### Overrides

[`default`](../../BaseBackupProvider/classes/default.md).[`getProviderInfo`](../../BaseBackupProvider/classes/default.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/FileBackupProvider.ts:33

Load config and prepare the storage target (e.g. ensure the directory).

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseBackupProvider/classes/default.md).[`initialize`](../../BaseBackupProvider/classes/default.md#initialize)

***

### isHealthy()

> __isHealthy__(): `Promise`\<`boolean`\>

Defined in: src/providers/BaseBackupProvider.ts:106

Health check — overridable by providers with remote dependencies.

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`default`](../../BaseBackupProvider/classes/default.md).[`isHealthy`](../../BaseBackupProvider/classes/default.md#ishealthy)

***

### listBackupObjects()

> __listBackupObjects__(): `Promise`\<[`BackupObjectInfo`](../../BaseBackupProvider/interfaces/BackupObjectInfo.md)[]\>

Defined in: src/providers/FileBackupProvider.ts:76

All objects in the container (BackupManager applies its own name filter).

#### Returns

`Promise`\<[`BackupObjectInfo`](../../BaseBackupProvider/interfaces/BackupObjectInfo.md)[]\>

#### Overrides

[`default`](../../BaseBackupProvider/classes/default.md).[`listBackupObjects`](../../BaseBackupProvider/classes/default.md#listbackupobjects)

***

### readBackup()

> __readBackup__(`idOrPath`): `Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Defined in: src/providers/FileBackupProvider.ts:68

Read a backup object by full path or bare filename.

#### Parameters

##### idOrPath

`string`

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

#### Overrides

[`default`](../../BaseBackupProvider/classes/default.md).[`readBackup`](../../BaseBackupProvider/classes/default.md#readbackup)

***

### removeBackup()

> __removeBackup__(`idOrPath`): `Promise`\<`void`\>

Defined in: src/providers/FileBackupProvider.ts:104

Delete a backup object by full path or bare filename.

#### Parameters

##### idOrPath

`string`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseBackupProvider/classes/default.md).[`removeBackup`](../../BaseBackupProvider/classes/default.md#removebackup)

***

### setBackupDirectory()

> __setBackupDirectory__(`directory`): `Promise`\<`void`\>

Defined in: src/providers/FileBackupProvider.ts:108

Re-point the storage target at runtime (admin changes the directory).

#### Parameters

##### directory

`string`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseBackupProvider/classes/default.md).[`setBackupDirectory`](../../BaseBackupProvider/classes/default.md#setbackupdirectory)

***

### writeBackup()

> __writeBackup__(`filename`, `data`): `Promise`\<`string`\>

Defined in: src/providers/FileBackupProvider.ts:60

Persist a backup object.

#### Parameters

##### filename

`string`

Object name (no path)

##### data

`string` \| `Buffer`\<`ArrayBufferLike`\>

Serialized (optionally gzip-compressed) payload

#### Returns

`Promise`\<`string`\>

The full path / identifier of the written object

#### Overrides

[`default`](../../BaseBackupProvider/classes/default.md).[`writeBackup`](../../BaseBackupProvider/classes/default.md#writebackup)
