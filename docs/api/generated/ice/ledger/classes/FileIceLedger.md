[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/ledger](../README.md) / FileIceLedger

# Class: FileIceLedger

Defined in: src/ice/ledger.ts:119

One JSON file per scope, named by the scope's hash (a scope holds a username).

## Extends

- `ScopedLedger`

## Constructors

### Constructor

> __new FileIceLedger__(`dir`, `maxEntries`): `FileIceLedger`

Defined in: src/ice/ledger.ts:120

#### Parameters

##### dir

`string`

##### maxEntries

`number`

#### Returns

`FileIceLedger`

#### Overrides

`ScopedLedger.constructor`

## Methods

### files()

> __files__(`scope`): `Promise`\<[`LedgerFileEntry`](../../types/interfaces/LedgerFileEntry.md)[]\>

Defined in: src/ice/ledger.ts:100

#### Parameters

##### scope

`string`

#### Returns

`Promise`\<[`LedgerFileEntry`](../../types/interfaces/LedgerFileEntry.md)[]\>

#### Inherited from

`ScopedLedger.files`

***

### hasItem()

> __hasItem__(`scope`, `itemKey`): `Promise`\<`boolean`\>

Defined in: src/ice/ledger.ts:65

#### Parameters

##### scope

`string`

##### itemKey

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

`ScopedLedger.hasItem`

***

### lastFile()

> __lastFile__(`scope`, `sha256`): `Promise`\<[`LedgerFileEntry`](../../types/interfaces/LedgerFileEntry.md) \| `null`\>

Defined in: src/ice/ledger.ts:50

#### Parameters

##### scope

`string`

##### sha256

`string`

#### Returns

`Promise`\<[`LedgerFileEntry`](../../types/interfaces/LedgerFileEntry.md) \| `null`\>

#### Inherited from

`ScopedLedger.lastFile`

***

### load()

> `protected` __load__(`scope`): `Promise`\<`ScopeFile`\>

Defined in: src/ice/ledger.ts:126

#### Parameters

##### scope

`string`

#### Returns

`Promise`\<`ScopeFile`\>

#### Overrides

`ScopedLedger.load`

***

### recordFile()

> __recordFile__(`scope`, `entry`): `Promise`\<`void`\>

Defined in: src/ice/ledger.ts:55

#### Parameters

##### scope

`string`

##### entry

[`LedgerFileEntry`](../../types/interfaces/LedgerFileEntry.md)

#### Returns

`Promise`\<`void`\>

#### Inherited from

`ScopedLedger.recordFile`

***

### recordItem()

> __recordItem__(`scope`, `itemKey`): `Promise`\<`void`\>

Defined in: src/ice/ledger.ts:69

#### Parameters

##### scope

`string`

##### itemKey

`string`

#### Returns

`Promise`\<`void`\>

#### Inherited from

`ScopedLedger.recordItem`

***

### recordItems()

> __recordItems__(`scope`, `itemKeys`): `Promise`\<`void`\>

Defined in: src/ice/ledger.ts:85

Record several item keys in one write (#2109).

#### Parameters

##### scope

`string`

##### itemKeys

`string`[]

#### Returns

`Promise`\<`void`\>

#### Inherited from

`ScopedLedger.recordItems`

***

### save()

> `protected` __save__(`data`): `Promise`\<`void`\>

Defined in: src/ice/ledger.ts:134

#### Parameters

##### data

`ScopeFile`

#### Returns

`Promise`\<`void`\>

#### Overrides

`ScopedLedger.save`

***

### seenItems()

> __seenItems__(`scope`, `itemKeys`): `Promise`\<`Set`\<`string`\>\>

Defined in: src/ice/ledger.ts:79

Which of these item keys the scope has seen: one read for a whole file's items (#2109).

#### Parameters

##### scope

`string`

##### itemKeys

`string`[]

#### Returns

`Promise`\<`Set`\<`string`\>\>

#### Inherited from

`ScopedLedger.seenItems`
