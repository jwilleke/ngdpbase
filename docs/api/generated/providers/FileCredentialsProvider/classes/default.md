[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FileCredentialsProvider](../README.md) / default

# Class: default

Defined in: src/providers/FileCredentialsProvider.ts:47

## Extends

- [`default`](../../BaseCredentialsProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`file`, `key`): `FileCredentialsProvider`

Defined in: src/providers/FileCredentialsProvider.ts:58

#### Parameters

##### file

`string`

the store; created on first write

##### key

`string`

`NGDPBASE_CREDENTIALS_KEY`; refused when empty

#### Returns

`FileCredentialsProvider`

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`constructor`](../../BaseCredentialsProvider/classes/default.md#constructor)

## Properties

### providerDescription

> `protected` __providerDescription__: `string` = `'Signed JSON credentials store beside the user store'`

Defined in: src/providers/FileCredentialsProvider.ts:49

One line on what it does. Optional, as on the canonical type.

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`providerDescription`](../../BaseCredentialsProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseCredentialsProvider/classes/default.md).[`providerFeatures`](../../BaseCredentialsProvider/classes/default.md#providerfeatures)

***

### providerName

> `protected` __providerName__: `string` = `'FileCredentialsProvider'`

Defined in: src/providers/FileCredentialsProvider.ts:48

What this provider calls itself (#1151).

`protected`, and set by a subclass in its constructor or field
initialisers. A provider that sets nothing reports the class name rather
than a placeholder, so the answer is never a lie — it is either what the
author chose or what the runtime knows.

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`providerName`](../../BaseCredentialsProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseCredentialsProvider/classes/default.md).[`providerVersion`](../../BaseCredentialsProvider/classes/default.md#providerversion)

## Methods

### add()

> __add__(`record`): `Promise`\<`void`\>

Defined in: src/providers/FileCredentialsProvider.ts:114

Add a row; refuses a second row with the same kind and subject.

#### Parameters

##### record

[`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`add`](../../BaseCredentialsProvider/classes/default.md#add)

***

### findBySubject()

> __findBySubject__(`kind`, `subject`): [`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md) \| `null`

Defined in: src/providers/FileCredentialsProvider.ts:132

The row with this kind and subject, which are unique together; null when none.

#### Parameters

##### kind

[`CredentialKind`](../../BaseCredentialsProvider/type-aliases/CredentialKind.md)

##### subject

`string`

#### Returns

[`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md) \| `null`

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`findBySubject`](../../BaseCredentialsProvider/classes/default.md#findbysubject)

***

### get()

> __get__(`id`): [`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md) \| `null`

Defined in: src/providers/FileCredentialsProvider.ts:110

#### Parameters

##### id

`string`

#### Returns

[`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md) \| `null`

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`get`](../../BaseCredentialsProvider/classes/default.md#get)

***

### getDurability()

> __getDurability__(): [`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md)

Defined in: src/providers/FileCredentialsProvider.ts:177

What this provider does with a record before it is durably stored.

Null means the provider has not stated it — silence rather than a default.
A provider that buffers and forgets to declare it must not inherit an
assertion that it writes immediately, which is precisely the bug this
contract replaces. A reporting layer renders null as "not stated", never
as "durable".

#### Returns

[`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md)

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`getDurability`](../../BaseCredentialsProvider/classes/default.md#getdurability)

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

[`default`](../../BaseCredentialsProvider/classes/default.md).[`getProviderInfo`](../../BaseCredentialsProvider/classes/default.md#getproviderinfo)

***

### initialize()

> __initialize__(`onRejected`): `Promise`\<`void`\>

Defined in: src/providers/FileCredentialsProvider.ts:73

Load the store. Rows that fail verification sign no one in and are
reported; they are kept, unchanged, in quarantine (#1633) so a lost or
changed key does not destroy them on the next write.

#### Parameters

##### onRejected

(`rejected`) => `void`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`initialize`](../../BaseCredentialsProvider/classes/default.md#initialize)

***

### list()

> __list__(`username`): [`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md)[]

Defined in: src/providers/FileCredentialsProvider.ts:98

A person's verified credentials, oldest first.

#### Parameters

##### username

`string`

#### Returns

[`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md)[]

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`list`](../../BaseCredentialsProvider/classes/default.md#list)

***

### listKind()

> __listKind__(`kind`): [`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md)[]

Defined in: src/providers/FileCredentialsProvider.ts:104

Every verified row of one kind, whoever's, oldest first (#1762: the grants naming a person as proxy).

#### Parameters

##### kind

[`CredentialKind`](../../BaseCredentialsProvider/type-aliases/CredentialKind.md)

#### Returns

[`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md)[]

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`listKind`](../../BaseCredentialsProvider/classes/default.md#listkind)

***

### location()

> __location__(): `string`

Defined in: src/providers/FileCredentialsProvider.ts:153

Where it is kept, for the admin view.

#### Returns

`string`

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`location`](../../BaseCredentialsProvider/classes/default.md#location)

***

### quarantined()

> __quarantined__(): [`RejectedCredential`](../../BaseCredentialsProvider/interfaces/RejectedCredential.md)[]

Defined in: src/providers/FileCredentialsProvider.ts:157

Rows held in quarantine because they failed verification (#1633).

#### Returns

[`RejectedCredential`](../../BaseCredentialsProvider/interfaces/RejectedCredential.md)[]

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`quarantined`](../../BaseCredentialsProvider/classes/default.md#quarantined)

***

### relabel()

> __relabel__(`id`, `label`): `Promise`\<`boolean`\>

Defined in: src/providers/FileCredentialsProvider.ts:145

Change a row's display name; the row is re-signed. False when there is no such row.

#### Parameters

##### id

`string`

##### label

`string`

#### Returns

`Promise`\<`boolean`\>

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`relabel`](../../BaseCredentialsProvider/classes/default.md#relabel)

***

### remove()

> __remove__(`id`): `Promise`\<`boolean`\>

Defined in: src/providers/FileCredentialsProvider.ts:126

Remove a row; returns whether it existed.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`remove`](../../BaseCredentialsProvider/classes/default.md#remove)

***

### retrustQuarantined()

> __retrustQuarantined__(): `Promise`\<[`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md)[]\>

Defined in: src/providers/FileCredentialsProvider.ts:161

Re-sign every quarantined row that is well formed under the current key
and trust it again (#1633). Malformed rows, and rows that would duplicate a
trusted credential, stay quarantined. Returns the rows now trusted.

#### Returns

`Promise`\<[`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md)[]\>

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`retrustQuarantined`](../../BaseCredentialsProvider/classes/default.md#retrustquarantined)

***

### touch()

> __touch__(`id`, `at`, `secret?`): `Promise`\<`void`\>

Defined in: src/providers/FileCredentialsProvider.ts:137

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

#### Overrides

[`default`](../../BaseCredentialsProvider/classes/default.md).[`touch`](../../BaseCredentialsProvider/classes/default.md#touch)
