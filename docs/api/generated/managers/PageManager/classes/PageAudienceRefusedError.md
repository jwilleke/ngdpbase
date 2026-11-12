[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / PageAudienceRefusedError

# Class: PageAudienceRefusedError

Defined in: src/managers/PageManager.ts:302

A write refused because the page's `audience` leaves the writer out (#1964).
Someone outside a page's audience may neither read nor edit it; an
administrator (`admin-system`) is the exception. Routes answer it with 403.

## Extends

- `Error`

## Constructors

### Constructor

> __new PageAudienceRefusedError__(`pageName`): `PageAudienceRefusedError`

Defined in: src/managers/PageManager.ts:305

#### Parameters

##### pageName

`string`

#### Returns

`PageAudienceRefusedError`

#### Overrides

`Error.constructor`

## Properties

### pageName

> `readonly` __pageName__: `string`

Defined in: src/managers/PageManager.ts:303
