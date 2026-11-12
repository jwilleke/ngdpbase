[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseLoggingProvider](../README.md) / default

# Abstract Class: default

Defined in: src/providers/BaseLoggingProvider.ts:51

## Extends

- [`default`](../../BaseProvider/classes/default.md)

## Extended by

- [`default`](../../FileLoggingProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(): `BaseLoggingProvider`

#### Returns

`BaseLoggingProvider`

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

## Methods

### createFormat()

> `abstract` __createFormat__(): `Format`

Defined in: src/providers/BaseLoggingProvider.ts:67

Build the winston log format. Default is a timestamped single-line
`printf`. Subclasses may override for structured/JSON output.

#### Returns

`Format`

winston format

***

### createTransports()

> `abstract` __createTransports__(`config`): `TransportStream`[]

Defined in: src/providers/BaseLoggingProvider.ts:59

Build the winston transports for the given configuration.

#### Parameters

##### config

[`LoggingProviderConfig`](../interfaces/LoggingProviderConfig.md)

Resolved logger configuration

#### Returns

`TransportStream`[]

Array of winston transport instances

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

> __getProviderInfo__(): [`LoggingProviderInfo`](../interfaces/LoggingProviderInfo.md)

Defined in: src/providers/BaseLoggingProvider.ts:72

Provider metadata.

#### Returns

[`LoggingProviderInfo`](../interfaces/LoggingProviderInfo.md)

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`getProviderInfo`](../../BaseProvider/classes/default.md#getproviderinfo)
