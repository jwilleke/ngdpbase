[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ReviewManager](../README.md) / ReviewHandlerFailedError

# Class: ReviewHandlerFailedError

Defined in: src/managers/ReviewManager.ts:90

The handler did not carry out an approved request; it stays open with `reason`.

## Extends

- `Error`

## Constructors

### Constructor

> __new ReviewHandlerFailedError__(`request`, `reason`): `ReviewHandlerFailedError`

Defined in: src/managers/ReviewManager.ts:92

#### Parameters

##### request

[`ReviewRequest`](../../../types/Review/interfaces/ReviewRequest.md)

##### reason

`string`

#### Returns

`ReviewHandlerFailedError`

#### Overrides

`Error.constructor`

## Properties

### name

> `readonly` __name__: `"ReviewHandlerFailedError"` = `'ReviewHandlerFailedError'`

Defined in: src/managers/ReviewManager.ts:91

#### Overrides

`Error.name`

***

### reason

> `readonly` __reason__: `string`

Defined in: src/managers/ReviewManager.ts:92

***

### request

> `readonly` __request__: [`ReviewRequest`](../../../types/Review/interfaces/ReviewRequest.md)

Defined in: src/managers/ReviewManager.ts:92
