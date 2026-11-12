[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseBackupProvider](../README.md) / default

# Abstract Class: default

Defined in: src/providers/BaseBackupProvider.ts:42

## Extends

- [`default`](../../BaseProvider/classes/default.md)

## Extended by

- [`default`](../../FileBackupProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `BaseBackupProvider`

Defined in: src/providers/BaseBackupProvider.ts:46

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`BaseBackupProvider`

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`constructor`](../../BaseProvider/classes/default.md#constructor)

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/BaseBackupProvider.ts:43

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BaseBackupProvider.ts:44

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

### backupExists()

> `abstract` __backupExists__(`idOrPath`): `Promise`\<`boolean`\>

Defined in: src/providers/BaseBackupProvider.ts:75

Whether a backup object exists, by full path or bare filename.

#### Parameters

##### idOrPath

`string`

#### Returns

`Promise`\<`boolean`\>

***

### ensureContainer()

> `abstract` __ensureContainer__(): `Promise`\<`void`\>

Defined in: src/providers/BaseBackupProvider.ts:60

Ensure the storage container exists.

#### Returns

`Promise`\<`void`\>

***

### freeSpace()

> __freeSpace__(): `Promise`\<`number` \| `null`\>

Defined in: src/providers/BaseBackupProvider.ts:101

Free bytes at the storage target, or null when this provider can't tell
(#1563). BackupManager compares it with the last backup's size before
writing, and shows it on Admin → Backup.

#### Returns

`Promise`\<`number` \| `null`\>

***

### getBackupDirectory()

> `abstract` __getBackupDirectory__(): `string`

Defined in: src/providers/BaseBackupProvider.ts:57

The resolved backup container location (directory / bucket prefix).

#### Returns

`string`

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

> __getProviderInfo__(): [`BackupProviderInfo`](../interfaces/BackupProviderInfo.md)

Defined in: src/providers/BaseBackupProvider.ts:87

Provider metadata.

#### Returns

[`BackupProviderInfo`](../interfaces/BackupProviderInfo.md)

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`getProviderInfo`](../../BaseProvider/classes/default.md#getproviderinfo)

***

### initialize()

> `abstract` __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/BaseBackupProvider.ts:54

Load config and prepare the storage target (e.g. ensure the directory).

#### Returns

`Promise`\<`void`\>

***

### isHealthy()

> __isHealthy__(): `Promise`\<`boolean`\>

Defined in: src/providers/BaseBackupProvider.ts:106

Health check — overridable by providers with remote dependencies.

#### Returns

`Promise`\<`boolean`\>

***

### listBackupObjects()

> `abstract` __listBackupObjects__(): `Promise`\<[`BackupObjectInfo`](../interfaces/BackupObjectInfo.md)[]\>

Defined in: src/providers/BaseBackupProvider.ts:78

All objects in the container (BackupManager applies its own name filter).

#### Returns

`Promise`\<[`BackupObjectInfo`](../interfaces/BackupObjectInfo.md)[]\>

***

### readBackup()

> `abstract` __readBackup__(`idOrPath`): `Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Defined in: src/providers/BaseBackupProvider.ts:72

Read a backup object by full path or bare filename.

#### Parameters

##### idOrPath

`string`

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

***

### removeBackup()

> `abstract` __removeBackup__(`idOrPath`): `Promise`\<`void`\>

Defined in: src/providers/BaseBackupProvider.ts:81

Delete a backup object by full path or bare filename.

#### Parameters

##### idOrPath

`string`

#### Returns

`Promise`\<`void`\>

***

### setBackupDirectory()

> `abstract` __setBackupDirectory__(`directory`): `Promise`\<`void`\>

Defined in: src/providers/BaseBackupProvider.ts:84

Re-point the storage target at runtime (admin changes the directory).

#### Parameters

##### directory

`string`

#### Returns

`Promise`\<`void`\>

***

### writeBackup()

> `abstract` __writeBackup__(`filename`, `data`): `Promise`\<`string`\>

Defined in: src/providers/BaseBackupProvider.ts:69

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
