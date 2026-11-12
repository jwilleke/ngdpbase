[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreTakeout](../README.md) / collectUser

# Function: collectUser()

> __collectUser__(`pagesDirectory`, `owner`, `layout?`, `skip?`): `Promise`\<\{ `owner`: `string`; `stores`: [`StoreTakeout`](../type-aliases/StoreTakeout.md)[]; `totalBytes`: `number`; `userFiles`: [`StoreFile`](../type-aliases/StoreFile.md)[]; \}\>

Defined in: src/utils/privateStoreTakeout.ts:169

Everything one user keeps privately: each of their stores, plus the files
that sit at the user level beside them (`user-keys.json` and any legacy
catalogue still there).

This is the unit both callers work in — an instance backup asks for it once
per owner, and a user's own download asks for it once, for themselves.

## Parameters

### pagesDirectory

`string`

### owner

`string`

### layout?

[`PrivateStoreLayoutOverrides`](../../privateStorePath/type-aliases/PrivateStoreLayoutOverrides.md)

### skip?

(`relativeToStore`) => `boolean`

## Returns

`Promise`\<\{ `owner`: `string`; `stores`: [`StoreTakeout`](../type-aliases/StoreTakeout.md)[]; `totalBytes`: `number`; `userFiles`: [`StoreFile`](../type-aliases/StoreFile.md)[]; \}\>
