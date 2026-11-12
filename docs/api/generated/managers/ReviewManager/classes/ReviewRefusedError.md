[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ReviewManager](../README.md) / ReviewRefusedError

# Class: ReviewRefusedError

Defined in: src/managers/ReviewManager.ts:67

The door said no: the caller may not decide (or see) this request. `decision` is the PDP's answer.

## Extends

- `Error`

## Constructors

### Constructor

> __new ReviewRefusedError__(`permission`, `decision`): `ReviewRefusedError`

Defined in: src/managers/ReviewManager.ts:69

#### Parameters

##### permission

`string`

##### decision

[`Decision`](../../../types/Policy/interfaces/Decision.md)

#### Returns

`ReviewRefusedError`

#### Overrides

`Error.constructor`

## Properties

### decision

> `readonly` __decision__: [`Decision`](../../../types/Policy/interfaces/Decision.md)

Defined in: src/managers/ReviewManager.ts:69

***

### name

> `readonly` __name__: `"ReviewRefusedError"` = `'ReviewRefusedError'`

Defined in: src/managers/ReviewManager.ts:68

#### Overrides

`Error.name`

***

### permission

> `readonly` __permission__: `string`

Defined in: src/managers/ReviewManager.ts:69
