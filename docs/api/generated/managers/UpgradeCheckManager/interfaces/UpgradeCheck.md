[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/UpgradeCheckManager](../README.md) / UpgradeCheck

# Interface: UpgradeCheck

Defined in: src/managers/UpgradeCheckManager.ts:59

## Properties

### id

> __id__: `string`

Defined in: src/managers/UpgradeCheckManager.ts:61

Kept in the record; never shown.

***

### since

> __since__: `string`

Defined in: src/managers/UpgradeCheckManager.ts:63

The version this check shipped in; sites older than that skip it.

## Methods

### detect()

> __detect__(`ctx`): `Promise`\<\{ `affected`: `string`[]; `log`: `string`; \}\>

Defined in: src/managers/UpgradeCheckManager.ts:69

Look for what the release affects. `affected` is kept in the record (names of
the things affected, never anything private); empty means nothing is affected.
`log` is the one line for developers, whichever way it came out.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<\{ `affected`: `string`[]; `log`: `string`; \}\>

***

### fix()

> __fix__(`affected`, `ctx`): `Promise`\<`number`\>

Defined in: src/managers/UpgradeCheckManager.ts:75

The button: make the change as `ctx`, through the normal checked, audited route for it. Resolves to how many things it changed; 0 when there was nothing left to change.

#### Parameters

##### affected

`string`[]

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`number`\>

***

### item()

> __item__(`affected`, `version`): `Promise`\<[`UpgradeItem`](UpgradeItem.md) \| `null`\>

Defined in: src/managers/UpgradeCheckManager.ts:71

What an administrator is told about `affected`, or null when nothing is left to decide. `version` is the site's.

#### Parameters

##### affected

`string`[]

##### version

`string`

#### Returns

`Promise`\<[`UpgradeItem`](UpgradeItem.md) \| `null`\>

***

### list()

> __list__(`affected`, `viewer`, `page`): `Promise`\<[`UpgradeList`](UpgradeList.md) \| `null`\>

Defined in: src/managers/UpgradeCheckManager.ts:73

The list the item links to, read afresh each time it is asked for; null when nothing is left to decide. `page` counts from 1.

#### Parameters

##### affected

`string`[]

##### viewer

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### page

`number`

#### Returns

`Promise`\<[`UpgradeList`](UpgradeList.md) \| `null`\>
