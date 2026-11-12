[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/seededShippedPages](../README.md) / SeededShippedPages

# Class: SeededShippedPages

Defined in: src/utils/seededShippedPages.ts:70

## Methods

### add()

> __add__(`sourceId`, `uuid`, `at?`): `boolean`

Defined in: src/utils/seededShippedPages.ts:111

Record a uuid as seeded from the source. Returns true when it was not recorded before.

#### Parameters

##### sourceId

`string`

##### uuid

`string`

##### at?

`string` = `...`

#### Returns

`boolean`

***

### allDeclined()

> __allDeclined__(): `Record`\<`string`, `Record`\<`string`, [`DeclinedShippedPage`](../interfaces/DeclinedShippedPage.md)\>\>

Defined in: src/utils/seededShippedPages.ts:135

Every source that has declines, as source id → uuid → entry.

#### Returns

`Record`\<`string`, `Record`\<`string`, [`DeclinedShippedPage`](../interfaces/DeclinedShippedPage.md)\>\>

***

### allow()

> __allow__(`sourceId`, `uuid`): `boolean`

Defined in: src/utils/seededShippedPages.ts:153

Undo a decline. Returns true when there was one.

#### Parameters

##### sourceId

`string`

##### uuid

`string`

#### Returns

`boolean`

***

### decline()

> __decline__(`sourceId`, `uuid`, `entry`): `boolean`

Defined in: src/utils/seededShippedPages.ts:144

Decline a uuid from a source. Returns true when it was not declined before.

#### Parameters

##### sourceId

`string`

##### uuid

`string`

##### entry

[`DeclinedShippedPage`](../interfaces/DeclinedShippedPage.md)

#### Returns

`boolean`

***

### declinedEntry()

> __declinedEntry__(`sourceId`, `uuid`): [`DeclinedShippedPage`](../interfaces/DeclinedShippedPage.md) \| `undefined`

Defined in: src/utils/seededShippedPages.ts:125

Why this site declined the uuid, or undefined.

#### Parameters

##### sourceId

`string`

##### uuid

`string`

#### Returns

[`DeclinedShippedPage`](../interfaces/DeclinedShippedPage.md) \| `undefined`

***

### declinedOf()

> __declinedOf__(`sourceId`): `Record`\<`string`, [`DeclinedShippedPage`](../interfaces/DeclinedShippedPage.md)\>

Defined in: src/utils/seededShippedPages.ts:130

Every declined uuid of a source, as uuid → entry.

#### Parameters

##### sourceId

`string`

#### Returns

`Record`\<`string`, [`DeclinedShippedPage`](../interfaces/DeclinedShippedPage.md)\>

***

### has()

> __has__(`sourceId`, `uuid`): `boolean`

Defined in: src/utils/seededShippedPages.ts:100

Whether the uuid was ever seeded from the source on this site.

#### Parameters

##### sourceId

`string`

##### uuid

`string`

#### Returns

`boolean`

***

### hasSource()

> __hasSource__(`sourceId`): `boolean`

Defined in: src/utils/seededShippedPages.ts:95

Whether this site has a record for the source at all.

#### Parameters

##### sourceId

`string`

#### Returns

`boolean`

***

### hasUuid()

> __hasUuid__(`uuid`): `boolean`

Defined in: src/utils/seededShippedPages.ts:105

Whether the uuid was ever seeded from any source on this site.

#### Parameters

##### uuid

`string`

#### Returns

`boolean`

***

### isDeclined()

> __isDeclined__(`sourceId`, `uuid`): `boolean`

Defined in: src/utils/seededShippedPages.ts:120

Whether this site declined the uuid from that source (#1412).

#### Parameters

##### sourceId

`string`

##### uuid

`string`

#### Returns

`boolean`

***

### load()

> `static` __load__(`instanceDataFolder`): `Promise`\<`SeededShippedPages`\>

Defined in: src/utils/seededShippedPages.ts:81

Load the record from the instance data folder. A missing file is an empty
record; an unreadable one is an error, so the seeder cannot mistake a broken
record for a site that has seeded nothing.

#### Parameters

##### instanceDataFolder

`string`

#### Returns

`Promise`\<`SeededShippedPages`\>

***

### save()

> __save__(): `Promise`\<`void`\>

Defined in: src/utils/seededShippedPages.ts:166

#### Returns

`Promise`\<`void`\>

***

### startSource()

> __startSource__(`sourceId`): `void`

Defined in: src/utils/seededShippedPages.ts:162

Start an empty record for the source, so `hasSource` is true from now on.

#### Parameters

##### sourceId

`string`

#### Returns

`void`
