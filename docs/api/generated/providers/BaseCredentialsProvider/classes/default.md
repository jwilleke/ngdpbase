[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseCredentialsProvider](../README.md) / default

# Abstract Class: default

Defined in: src/providers/BaseCredentialsProvider.ts:63

## Extends

- [`default`](../../BaseProvider/classes/default.md)

## Extended by

- [`default`](../../FileCredentialsProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(): `BaseCredentialsProvider`

#### Returns

`BaseCredentialsProvider`

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

### add()

> `abstract` __add__(`record`): `Promise`\<`void`\>

Defined in: src/providers/BaseCredentialsProvider.ts:90

Add a row; refuses a second row with the same kind and subject.

#### Parameters

##### record

[`CredentialRecord`](../interfaces/CredentialRecord.md)

#### Returns

`Promise`\<`void`\>

***

### findBySubject()

> `abstract` __findBySubject__(`kind`, `subject`): [`CredentialRecord`](../interfaces/CredentialRecord.md) \| `null`

Defined in: src/providers/BaseCredentialsProvider.ts:96

The row with this kind and subject, which are unique together; null when none.

#### Parameters

##### kind

[`CredentialKind`](../type-aliases/CredentialKind.md)

##### subject

`string`

#### Returns

[`CredentialRecord`](../interfaces/CredentialRecord.md) \| `null`

***

### get()

> `abstract` __get__(`id`): [`CredentialRecord`](../interfaces/CredentialRecord.md) \| `null`

Defined in: src/providers/BaseCredentialsProvider.ts:84

#### Parameters

##### id

`string`

#### Returns

[`CredentialRecord`](../interfaces/CredentialRecord.md) \| `null`

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

### initialize()

> `abstract` __initialize__(`onRejected`): `Promise`\<`void`\>

Defined in: src/providers/BaseCredentialsProvider.ts:69

Load the store. Rows that fail verification sign no one in and are
reported; they are kept, unchanged, in quarantine (#1633) so a lost or
changed key does not destroy them on the next write.

#### Parameters

##### onRejected

(`rejected`) => `void`

#### Returns

`Promise`\<`void`\>

***

### list()

> `abstract` __list__(`username`): [`CredentialRecord`](../interfaces/CredentialRecord.md)[]

Defined in: src/providers/BaseCredentialsProvider.ts:82

A person's verified credentials, oldest first.

#### Parameters

##### username

`string`

#### Returns

[`CredentialRecord`](../interfaces/CredentialRecord.md)[]

***

### listKind()

> `abstract` __listKind__(`kind`): [`CredentialRecord`](../interfaces/CredentialRecord.md)[]

Defined in: src/providers/BaseCredentialsProvider.ts:87

Every verified row of one kind, whoever's, oldest first (#1762: the grants naming a person as proxy).

#### Parameters

##### kind

[`CredentialKind`](../type-aliases/CredentialKind.md)

#### Returns

[`CredentialRecord`](../interfaces/CredentialRecord.md)[]

***

### location()

> `abstract` __location__(): `string`

Defined in: src/providers/BaseCredentialsProvider.ts:105

Where it is kept, for the admin view.

#### Returns

`string`

***

### quarantined()

> `abstract` __quarantined__(): [`RejectedCredential`](../interfaces/RejectedCredential.md)[]

Defined in: src/providers/BaseCredentialsProvider.ts:72

Rows held in quarantine because they failed verification (#1633).

#### Returns

[`RejectedCredential`](../interfaces/RejectedCredential.md)[]

***

### relabel()

> `abstract` __relabel__(`id`, `label`): `Promise`\<`boolean`\>

Defined in: src/providers/BaseCredentialsProvider.ts:102

Change a row's display name; the row is re-signed. False when there is no such row.

#### Parameters

##### id

`string`

##### label

`string`

#### Returns

`Promise`\<`boolean`\>

***

### remove()

> `abstract` __remove__(`id`): `Promise`\<`boolean`\>

Defined in: src/providers/BaseCredentialsProvider.ts:93

Remove a row; returns whether it existed.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### retrustQuarantined()

> `abstract` __retrustQuarantined__(): `Promise`\<[`CredentialRecord`](../interfaces/CredentialRecord.md)[]\>

Defined in: src/providers/BaseCredentialsProvider.ts:79

Re-sign every quarantined row that is well formed under the current key
and trust it again (#1633). Malformed rows, and rows that would duplicate a
trusted credential, stay quarantined. Returns the rows now trusted.

#### Returns

`Promise`\<[`CredentialRecord`](../interfaces/CredentialRecord.md)[]\>

***

### touch()

> `abstract` __touch__(`id`, `at`, `secret?`): `Promise`\<`void`\>

Defined in: src/providers/BaseCredentialsProvider.ts:99

Record that a credential was just used, and its new secret when that changes (a passkey's counter).

#### Parameters

##### id

`string`

##### at

`string`

##### secret?

`string`

#### Returns

`Promise`\<`void`\>
