[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / ImportUploadRefused

# Class: ImportUploadRefused

Defined in: src/managers/ImportManager.ts:312

An import refused at upload, before anything was queued (#2034): keeping
the original of `file` in the receiver's encrypted store was refused or
failed. `message` is written for the user who uploaded.

## Extends

- `Error`

## Constructors

### Constructor

> __new ImportUploadRefused__(`file`, `reason`): `ImportUploadRefused`

Defined in: src/managers/ImportManager.ts:313

#### Parameters

##### file

`string`

##### reason

`string`

#### Returns

`ImportUploadRefused`

#### Overrides

`Error.constructor`

## Properties

### file

> `readonly` __file__: `string`

Defined in: src/managers/ImportManager.ts:313

***

### reason

> `readonly` __reason__: `string`

Defined in: src/managers/ImportManager.ts:313
