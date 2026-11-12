[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceLedger

# Interface: IceLedger

Defined in: src/ice/types.ts:663

Where the engine keeps fingerprints, per-file status and item keys, per
scope. One interface so a database table can replace the file store when
the application database is on.

## Methods

### files()

> __files__(`scope`): `Promise`\<[`LedgerFileEntry`](LedgerFileEntry.md)[]\>

Defined in: src/ice/types.ts:672

#### Parameters

##### scope

`string`

#### Returns

`Promise`\<[`LedgerFileEntry`](LedgerFileEntry.md)[]\>

***

### hasItem()

> __hasItem__(`scope`, `itemKey`): `Promise`\<`boolean`\>

Defined in: src/ice/types.ts:666

#### Parameters

##### scope

`string`

##### itemKey

`string`

#### Returns

`Promise`\<`boolean`\>

***

### lastFile()

> __lastFile__(`scope`, `sha256`): `Promise`\<[`LedgerFileEntry`](LedgerFileEntry.md) \| `null`\>

Defined in: src/ice/types.ts:664

#### Parameters

##### scope

`string`

##### sha256

`string`

#### Returns

`Promise`\<[`LedgerFileEntry`](LedgerFileEntry.md) \| `null`\>

***

### recordFile()

> __recordFile__(`scope`, `entry`): `Promise`\<`void`\>

Defined in: src/ice/types.ts:665

#### Parameters

##### scope

`string`

##### entry

[`LedgerFileEntry`](LedgerFileEntry.md)

#### Returns

`Promise`\<`void`\>

***

### recordItem()

> __recordItem__(`scope`, `itemKey`): `Promise`\<`void`\>

Defined in: src/ice/types.ts:667

#### Parameters

##### scope

`string`

##### itemKey

`string`

#### Returns

`Promise`\<`void`\>

***

### recordItems()

> __recordItems__(`scope`, `itemKeys`): `Promise`\<`void`\>

Defined in: src/ice/types.ts:671

Record several item keys in one write (#2109).

#### Parameters

##### scope

`string`

##### itemKeys

`string`[]

#### Returns

`Promise`\<`void`\>

***

### seenItems()

> __seenItems__(`scope`, `itemKeys`): `Promise`\<`Set`\<`string`\>\>

Defined in: src/ice/types.ts:669

Which of these item keys the scope has seen: one read for a whole file's items (#2109).

#### Parameters

##### scope

`string`

##### itemKeys

`string`[]

#### Returns

`Promise`\<`Set`\<`string`\>\>
