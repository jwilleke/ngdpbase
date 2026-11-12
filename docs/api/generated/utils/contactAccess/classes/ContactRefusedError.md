[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/contactAccess](../README.md) / ContactRefusedError

# Class: ContactRefusedError

Defined in: src/utils/contactAccess.ts:42

A contacts door said no. `permission` is what was refused; `decision` is the PDP's answer.

## Extends

- `Error`

## Constructors

### Constructor

> __new ContactRefusedError__(`permission`, `decision`): `ContactRefusedError`

Defined in: src/utils/contactAccess.ts:43

#### Parameters

##### permission

`string`

##### decision

[`Decision`](../../../types/Policy/interfaces/Decision.md)

#### Returns

`ContactRefusedError`

#### Overrides

`Error.constructor`

## Properties

### decision

> `readonly` __decision__: [`Decision`](../../../types/Policy/interfaces/Decision.md)

Defined in: src/utils/contactAccess.ts:43

***

### permission

> `readonly` __permission__: `string`

Defined in: src/utils/contactAccess.ts:43
