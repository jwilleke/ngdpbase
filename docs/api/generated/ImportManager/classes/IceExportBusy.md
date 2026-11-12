[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / IceExportBusy

# Class: IceExportBusy

Defined in: src/managers/ImportManager.ts:336

An export not started because too much is already being made (#2120): the
user's own queued exports are at `max-queued-per-user`, or every held run is
still being made. A route answers it as 429; nothing was read or queued.

## Extends

- `Error`

## Constructors

### Constructor

> __new IceExportBusy__(`message`): `IceExportBusy`

Defined in: src/managers/ImportManager.ts:337

#### Parameters

##### message

`string`

#### Returns

`IceExportBusy`

#### Overrides

`Error.constructor`
