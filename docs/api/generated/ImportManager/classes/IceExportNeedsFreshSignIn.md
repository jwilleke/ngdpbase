[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / IceExportNeedsFreshSignIn

# Class: IceExportNeedsFreshSignIn

Defined in: src/managers/ImportManager.ts:348

An export refused only because the user's sign-in is not fresh enough
(#2120): they hold `permission` on the thing, and step-up asks for it. A
route answers it with the step-up prompt, not "not found".

## Extends

- `Error`

## Constructors

### Constructor

> __new IceExportNeedsFreshSignIn__(`permission`): `IceExportNeedsFreshSignIn`

Defined in: src/managers/ImportManager.ts:349

#### Parameters

##### permission

`string`

#### Returns

`IceExportNeedsFreshSignIn`

#### Overrides

`Error.constructor`

## Properties

### permission

> `readonly` __permission__: `string`

Defined in: src/managers/ImportManager.ts:349
