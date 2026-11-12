[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseProvider](../README.md) / default

# Abstract Class: default

Defined in: src/providers/BaseProvider.ts:64

## Extended by

- [`default`](../../BaseAttachmentProvider/classes/default.md)
- [`default`](../../BaseAuditProvider/classes/default.md)
- [`default`](../../BaseBackupProvider/classes/default.md)
- [`default`](../../BaseCacheProvider/classes/default.md)
- [`default`](../../BaseCredentialsProvider/classes/default.md)
- [`default`](../../BaseDatabaseProvider/classes/default.md)
- [`default`](../../BaseLoggingProvider/classes/default.md)
- [`default`](../../../BaseMediaProvider/classes/default.md)
- [`default`](../../BasePageProvider/classes/default.md)
- [`default`](../../BaseSearchProvider/classes/default.md)
- [`default`](../../BaseUserProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(): `BaseProvider`

#### Returns

`BaseProvider`

## Properties

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

***

### providerName?

> `protected` `optional` __providerName?__: `string`

Defined in: src/providers/BaseProvider.ts:73

What this provider calls itself (#1151).

`protected`, and set by a subclass in its constructor or field
initialisers. A provider that sets nothing reports the class name rather
than a placeholder, so the answer is never a lie — it is either what the
author chose or what the runtime knows.

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

## Methods

### getDurability()

> __getDurability__(): [`ProviderDurability`](../interfaces/ProviderDurability.md) \| `null`

Defined in: src/providers/BaseProvider.ts:111

What this provider does with a record before it is durably stored.

Null means the provider has not stated it — silence rather than a default.
A provider that buffers and forgets to declare it must not inherit an
assertion that it writes immediately, which is precisely the bug this
contract replaces. A reporting layer renders null as "not stated", never
as "durable".

#### Returns

[`ProviderDurability`](../interfaces/ProviderDurability.md) \| `null`

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
