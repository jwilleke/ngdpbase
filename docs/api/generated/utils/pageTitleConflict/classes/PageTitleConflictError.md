[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageTitleConflict](../README.md) / PageTitleConflictError

# Class: PageTitleConflictError

Defined in: src/utils/pageTitleConflict.ts:21

## Extends

- `Error`

## Constructors

### Constructor

> __new PageTitleConflictError__(`title`, `pageId`, `requested?`, `tooClose?`): `PageTitleConflictError`

Defined in: src/utils/pageTitleConflict.ts:29

#### Parameters

##### title

`string`

the title of the page that already has it

##### pageId

`string`

that page's id, for the message only

##### requested?

`string` = `title`

the title the save asked for, when it differs only by case

##### tooClose?

`boolean` = `false`

the titles differ and only their slugs match

#### Returns

`PageTitleConflictError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` __code__: `"page-title-conflict"` = `'page-title-conflict'`

Defined in: src/utils/pageTitleConflict.ts:22

***

### title

> `readonly` __title__: `string`

Defined in: src/utils/pageTitleConflict.ts:29

the title of the page that already has it

***

### tooClose

> `readonly` __tooClose__: `boolean` = `false`

Defined in: src/utils/pageTitleConflict.ts:29

the titles differ and only their slugs match
