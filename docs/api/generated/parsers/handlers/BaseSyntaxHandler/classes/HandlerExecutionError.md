[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/handlers/BaseSyntaxHandler](../README.md) / HandlerExecutionError

# Class: HandlerExecutionError

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:736

Custom error class for handler execution errors

## Extends

- `Error`

## Constructors

### Constructor

> __new HandlerExecutionError__(`message`, `handlerId`, `context`): `HandlerExecutionError`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:740

#### Parameters

##### message

`string`

##### handlerId

`string`

##### context

[`ErrorContext`](../interfaces/ErrorContext.md)

#### Returns

`HandlerExecutionError`

#### Overrides

`Error.constructor`

## Properties

### context

> `readonly` __context__: [`ErrorContext`](../interfaces/ErrorContext.md)

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:738

***

### handlerId

> `readonly` __handlerId__: `string`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:737
