[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / PageContentValidationError

# Class: PageContentValidationError

Defined in: src/managers/PageManager.ts:334

## Extends

- `Error`

## Constructors

### Constructor

> __new PageContentValidationError__(`pageName`, `validationErrors`): `PageContentValidationError`

Defined in: src/managers/PageManager.ts:337

#### Parameters

##### pageName

`string`

##### validationErrors

[`FilterValidationError`](../../../parsers/filters/FilterChain/interfaces/FilterValidationError.md)[]

#### Returns

`PageContentValidationError`

#### Overrides

`Error.constructor`

## Properties

### validationErrors

> `readonly` __validationErrors__: [`FilterValidationError`](../../../parsers/filters/FilterChain/interfaces/FilterValidationError.md)[]

Defined in: src/managers/PageManager.ts:335
