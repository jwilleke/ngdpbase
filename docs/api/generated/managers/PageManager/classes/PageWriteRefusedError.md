[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / PageWriteRefusedError

# Class: PageWriteRefusedError

Defined in: src/managers/PageManager.ts:321

A write refused by the write door (#1815): the context may not create,
edit or delete this page, decided by policy, the page's own rules and the
vault container rule. Nothing was written. Routes answer it with 403. The
message names no page, so a private title never reaches a log (#2178).

## Extends

- `Error`

## Constructors

### Constructor

> __new PageWriteRefusedError__(`pageName`, `action`): `PageWriteRefusedError`

Defined in: src/managers/PageManager.ts:325

#### Parameters

##### pageName

`string`

##### action

[`PageWriteAction`](../type-aliases/PageWriteAction.md)

#### Returns

`PageWriteRefusedError`

#### Overrides

`Error.constructor`

## Properties

### action

> `readonly` __action__: [`PageWriteAction`](../type-aliases/PageWriteAction.md)

Defined in: src/managers/PageManager.ts:323

***

### pageName

> `readonly` __pageName__: `string`

Defined in: src/managers/PageManager.ts:322
