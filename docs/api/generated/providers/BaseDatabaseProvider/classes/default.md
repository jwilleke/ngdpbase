[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseDatabaseProvider](../README.md) / default

# Abstract Class: default\<Handle\>

Defined in: src/providers/BaseDatabaseProvider.ts:11

## Extends

- [`default`](../../BaseProvider/classes/default.md)

## Extended by

- [`default`](../../SqliteDatabaseProvider/classes/default.md)

## Type Parameters

### Handle

`Handle` = `unknown`

## Constructors

### Constructor

> __new default__\<`Handle`\>(): `BaseDatabaseProvider`\<`Handle`\>

#### Returns

`BaseDatabaseProvider`\<`Handle`\>

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`constructor`](../../BaseProvider/classes/default.md#constructor)

## Properties

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

## Accessors

### handle

#### Get Signature

> __get__ `abstract` __handle__(): `Handle`

Defined in: src/providers/BaseDatabaseProvider.ts:13

The open, migrated connection, for the providers built over it.

##### Returns

`Handle`

## Methods

### close()

> `abstract` __close__(): `void`

Defined in: src/providers/BaseDatabaseProvider.ts:17

#### Returns

`void`

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

Defined in: src/providers/BaseProvider.ts:93

Identify this provider.

Concrete providers may still override this — their name, version and
feature list are their own data, not duplication. What moved up here is
the SHAPE, so the nine copies of `ProviderInfo` become one, and so a new
provider that sets the fields gets a correct answer without writing the
method at all.

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`getProviderInfo`](../../BaseProvider/classes/default.md#getproviderinfo)

***

### integrityOk()

> `abstract` __integrityOk__(): `boolean`

Defined in: src/providers/BaseDatabaseProvider.ts:14

#### Returns

`boolean`

***

### storage()

> `abstract` __storage__(): `object`

Defined in: src/providers/BaseDatabaseProvider.ts:16

Where the data lives and how big it is.

#### Returns

`object`

##### encrypted

> __encrypted__: `boolean`

##### location

> __location__: `string`

##### sizeBytes

> __sizeBytes__: `number`
