[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Journal](../README.md) / JournalAuthorCounter

# Interface: JournalAuthorCounter

Defined in: src/types/Journal.ts:11

What core reads from the journal add-on's `JournalDataManager` (#1868).

Core cannot import add-on code, so the one method it calls is declared here,
once, matching `addons/journal/managers/JournalDataManager.ts`. Every caller
uses this shape — a local copy hid the change to an async, context-carrying
signature (#1456) and crashed /profile.

## Methods

### countByAuthor()

> __countByAuthor__(`author`, `ctx`): `Promise`\<`number`\>

Defined in: src/types/Journal.ts:13

Entries `author` wrote that `ctx` may read.

#### Parameters

##### author

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`number`\>
