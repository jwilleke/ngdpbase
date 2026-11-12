[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FileLoggingProvider](../README.md) / default

# Class: default

Defined in: src/providers/FileLoggingProvider.ts:27

## Extends

- [`default`](../../BaseLoggingProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(): `FileLoggingProvider`

#### Returns

`FileLoggingProvider`

#### Inherited from

[`default`](../../BaseLoggingProvider/classes/default.md).[`constructor`](../../BaseLoggingProvider/classes/default.md#constructor)

## Properties

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BaseLoggingProvider/classes/default.md).[`providerDescription`](../../BaseLoggingProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseLoggingProvider/classes/default.md).[`providerFeatures`](../../BaseLoggingProvider/classes/default.md#providerfeatures)

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

[`default`](../../BaseLoggingProvider/classes/default.md).[`providerName`](../../BaseLoggingProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseLoggingProvider/classes/default.md).[`providerVersion`](../../BaseLoggingProvider/classes/default.md#providerversion)

## Methods

### createFormat()

> __createFormat__(): `Format`

Defined in: src/providers/FileLoggingProvider.ts:49

Build the winston log format. Default is a timestamped single-line
`printf`. Subclasses may override for structured/JSON output.

#### Returns

`Format`

winston format

#### Overrides

[`default`](../../BaseLoggingProvider/classes/default.md).[`createFormat`](../../BaseLoggingProvider/classes/default.md#createformat)

***

### createTransports()

> __createTransports__(`config`): `TransportStream`[]

Defined in: src/providers/FileLoggingProvider.ts:33

Console transport always; rotating-file transport added only when `dir`
is provided (avoids creating ./data/logs before ConfigurationManager
resolves paths — same guard as the pre-#169 logger).

#### Parameters

##### config

[`LoggingProviderConfig`](../../BaseLoggingProvider/interfaces/LoggingProviderConfig.md)

#### Returns

`TransportStream`[]

#### Overrides

[`default`](../../BaseLoggingProvider/classes/default.md).[`createTransports`](../../BaseLoggingProvider/classes/default.md#createtransports)

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

[`default`](../../BaseLoggingProvider/classes/default.md).[`getDurability`](../../BaseLoggingProvider/classes/default.md#getdurability)

***

### getProviderInfo()

> __getProviderInfo__(): [`LoggingProviderInfo`](../../BaseLoggingProvider/interfaces/LoggingProviderInfo.md)

Defined in: src/providers/FileLoggingProvider.ts:145

Provider metadata.

#### Returns

[`LoggingProviderInfo`](../../BaseLoggingProvider/interfaces/LoggingProviderInfo.md)

#### Overrides

[`default`](../../BaseLoggingProvider/classes/default.md).[`getProviderInfo`](../../BaseLoggingProvider/classes/default.md#getproviderinfo)
