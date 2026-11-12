[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Consent](../README.md) / ConsentRequiredError

# Class: ConsentRequiredError

Defined in: src/types/Consent.ts:162

Thrown when a per-person add-on is turned on before its documents are
accepted (#1603). `documents` names what is still to accept.

## Extends

- `Error`

## Constructors

### Constructor

> __new ConsentRequiredError__(`scope`, `documents`): `ConsentRequiredError`

Defined in: src/types/Consent.ts:164

#### Parameters

##### scope

`string`

##### documents

`string`[]

#### Returns

`ConsentRequiredError`

#### Overrides

`Error.constructor`

## Properties

### documents

> `readonly` __documents__: `string`[]

Defined in: src/types/Consent.ts:164

***

### name

> `readonly` __name__: `"ConsentRequiredError"` = `'ConsentRequiredError'`

Defined in: src/types/Consent.ts:163

#### Overrides

`Error.name`

***

### scope

> `readonly` __scope__: `string`

Defined in: src/types/Consent.ts:164
