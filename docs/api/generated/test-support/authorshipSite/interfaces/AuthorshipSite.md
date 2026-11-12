[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [test-support/authorshipSite](../README.md) / AuthorshipSite

# Interface: AuthorshipSite

Defined in: src/test-support/authorshipSite.ts:16

## Properties

### accounts

> __accounts__: `Record`\<`string`, `string`\>

Defined in: src/test-support/authorshipSite.ts:20

***

### config

> __config__: `Record`\<`string`, `unknown`\>

Defined in: src/test-support/authorshipSite.ts:24

***

### dir

> __dir__: `string`

Defined in: src/test-support/authorshipSite.ts:17

***

### identities

> __identities__: [`FakeIdentities`](../../identities/interfaces/FakeIdentities.md)

Defined in: src/test-support/authorshipSite.ts:21

***

### indexFile

> __indexFile__: `string`

Defined in: src/test-support/authorshipSite.ts:19

***

### managers

> __managers__: `Map`\<`string`, `unknown`\>

Defined in: src/test-support/authorshipSite.ts:22

***

### pageManager

> __pageManager__: [`default`](../../../managers/PageManager/classes/default.md)

Defined in: src/test-support/authorshipSite.ts:23

***

### pagesDir

> __pagesDir__: `string`

Defined in: src/test-support/authorshipSite.ts:18

## Methods

### remove()

> __remove__(): `Promise`\<`void`\>

Defined in: src/test-support/authorshipSite.ts:27

#### Returns

`Promise`\<`void`\>

***

### restart()

> __restart__(): `Promise`\<[`default`](../../../managers/PageManager/classes/default.md)\>

Defined in: src/test-support/authorshipSite.ts:26

A fresh PageManager on the same folder: a restart.

#### Returns

`Promise`\<[`default`](../../../managers/PageManager/classes/default.md)\>
