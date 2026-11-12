[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/vet](../README.md) / IceVetRefused

# Class: IceVetRefused

Defined in: src/ice/vet.ts:19

A file whose format's shim failed while cleaning it: it is not kept, since it could not be checked.

## Extends

- `Error`

## Constructors

### Constructor

> __new IceVetRefused__(`file`, `reason`): `IceVetRefused`

Defined in: src/ice/vet.ts:20

#### Parameters

##### file

`string`

##### reason

`string`

#### Returns

`IceVetRefused`

#### Overrides

`Error.constructor`

## Properties

### file

> `readonly` __file__: `string`

Defined in: src/ice/vet.ts:20

***

### reason

> `readonly` __reason__: `string`

Defined in: src/ice/vet.ts:20
