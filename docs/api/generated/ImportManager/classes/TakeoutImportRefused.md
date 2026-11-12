[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / TakeoutImportRefused

# Class: TakeoutImportRefused

Defined in: src/managers/ImportManager.ts:291

Why a takeout import was refused before anything was written (#1472).
A refusal is never a partial import.

## Extends

- `Error`

## Constructors

### Constructor

> __new TakeoutImportRefused__(`reason`, `message`): `TakeoutImportRefused`

Defined in: src/managers/ImportManager.ts:292

#### Parameters

##### reason

`"unreadable"` \| `"not-owner"` \| `"no-such-store"` \| `"locked"`

##### message

`string`

#### Returns

`TakeoutImportRefused`

#### Overrides

`Error.constructor`

## Properties

### reason

> `readonly` __reason__: `"unreadable"` \| `"not-owner"` \| `"no-such-store"` \| `"locked"`

Defined in: src/managers/ImportManager.ts:293
