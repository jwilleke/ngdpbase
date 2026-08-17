[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/handlers/HandlerRegistry](../README.md) / HandlerRegistrationError

# Class: HandlerRegistrationError

Defined in: [src/parsers/handlers/HandlerRegistry.ts:673](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L673)

Custom error class for handler registration errors

## Extends

- `Error`

## Constructors

### Constructor

> __new HandlerRegistrationError__(`message`, `code`, `context`): `HandlerRegistrationError`

Defined in: [src/parsers/handlers/HandlerRegistry.ts:677](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L677)

#### Parameters

##### message

`string`

##### code

`string`

##### context

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`HandlerRegistrationError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` __code__: `string`

Defined in: [src/parsers/handlers/HandlerRegistry.ts:674](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L674)

***

### context

> `readonly` __context__: `Record`\<`string`, `unknown`\>

Defined in: [src/parsers/handlers/HandlerRegistry.ts:675](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L675)
