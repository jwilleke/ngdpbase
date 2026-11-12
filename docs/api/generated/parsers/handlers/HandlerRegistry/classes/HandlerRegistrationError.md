[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/handlers/HandlerRegistry](../README.md) / HandlerRegistrationError

# Class: HandlerRegistrationError

Defined in: src/parsers/handlers/HandlerRegistry.ts:673

Custom error class for handler registration errors

## Extends

- `Error`

## Constructors

### Constructor

> __new HandlerRegistrationError__(`message`, `code`, `context?`): `HandlerRegistrationError`

Defined in: src/parsers/handlers/HandlerRegistry.ts:677

#### Parameters

##### message

`string`

##### code

`string`

##### context?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`HandlerRegistrationError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` __code__: `string`

Defined in: src/parsers/handlers/HandlerRegistry.ts:674

***

### context

> `readonly` __context__: `Record`\<`string`, `unknown`\>

Defined in: src/parsers/handlers/HandlerRegistry.ts:675
