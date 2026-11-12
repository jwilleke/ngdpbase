[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FileConsentProvider](../README.md) / default

# Class: default

Defined in: src/providers/FileConsentProvider.ts:22

## Constructors

### Constructor

> __new default__(`dir`): `FileConsentProvider`

Defined in: src/providers/FileConsentProvider.ts:23

#### Parameters

##### dir

`string`

#### Returns

`FileConsentProvider`

## Accessors

### directory

#### Get Signature

> __get__ __directory__(): `string`

Defined in: src/providers/FileConsentProvider.ts:32

The folder the records live in: what a backup copies.

##### Returns

`string`

## Methods

### append()

> __append__(`username`, `record`): `Promise`\<`void`\>

Defined in: src/providers/FileConsentProvider.ts:67

Add one record to `username`'s file, flushed to the device before returning.

#### Parameters

##### username

`string`

##### record

[`ConsentRecord`](../../../types/Consent/interfaces/ConsentRecord.md)

#### Returns

`Promise`\<`void`\>

***

### initialize()

> __initialize__(): `void`

Defined in: src/providers/FileConsentProvider.ts:26

Create the folder owner-only; tighten one that is wider.

#### Returns

`void`

***

### list()

> __list__(`username`): `Promise`\<[`ConsentRecord`](../../../types/Consent/interfaces/ConsentRecord.md)[]\>

Defined in: src/providers/FileConsentProvider.ts:43

Every record of `username`, oldest first; none when the file does not exist. Unreadable lines are reported and skipped.

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`ConsentRecord`](../../../types/Consent/interfaces/ConsentRecord.md)[]\>

***

### remove()

> __remove__(`username`): `Promise`\<`boolean`\>

Defined in: src/providers/FileConsentProvider.ts:78

Remove `username`'s file (the account was deleted). True when there was one.

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`boolean`\>
