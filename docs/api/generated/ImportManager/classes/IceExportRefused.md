[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / IceExportRefused

# Class: IceExportRefused

Defined in: src/managers/ImportManager.ts:324

An export that is not started (#2120): the thing is not there, the user may
not export it, or the format is not one offered for it. A route answers it
as "not found", so it never tells the user which.

## Extends

- `Error`

## Constructors

### Constructor

> __new IceExportRefused__(`message?`): `IceExportRefused`

Defined in: src/managers/ImportManager.ts:325

#### Parameters

##### message?

`string` = `'Nothing to export here.'`

#### Returns

`IceExportRefused`

#### Overrides

`Error.constructor`
