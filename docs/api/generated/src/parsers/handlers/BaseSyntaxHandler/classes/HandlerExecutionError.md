[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/handlers/BaseSyntaxHandler](../README.md) / HandlerExecutionError

# Class: HandlerExecutionError

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:738](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L738)

Custom error class for handler execution errors

## Extends

- `Error`

## Constructors

### Constructor

> __new HandlerExecutionError__(`message`, `handlerId`, `context`): `HandlerExecutionError`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:742](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L742)

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

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:740](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L740)

***

### handlerId

> `readonly` __handlerId__: `string`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:739](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L739)
