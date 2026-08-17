[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/dom/DOMParser](../README.md) / ParseError

# Class: ParseError

Defined in: [src/parsers/dom/DOMParser.ts:474](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L474)

Custom error class for parse errors

## Extends

- `Error`

## Constructors

### Constructor

> __new ParseError__(`type`, `position`, `line`, `column`, `message`, `cause?`): `ParseError`

Defined in: [src/parsers/dom/DOMParser.ts:496](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L496)

Creates a parse error with position information

#### Parameters

##### type

`string`

Error type

##### position

`number`

Character position

##### line

`number`

Line number

##### column

`number`

Column number

##### message

`string`

Error message

##### cause?

`Error`

Underlying error

#### Returns

`ParseError`

#### Overrides

`Error.constructor`

## Properties

### cause?

> `optional` __cause__: `Error`

Defined in: [src/parsers/dom/DOMParser.ts:484](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L484)

Underlying error

#### Overrides

`Error.cause`

***

### column

> __column__: `number`

Defined in: [src/parsers/dom/DOMParser.ts:482](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L482)

Column number

***

### line

> __line__: `number`

Defined in: [src/parsers/dom/DOMParser.ts:480](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L480)

Line number

***

### position

> __position__: `number`

Defined in: [src/parsers/dom/DOMParser.ts:478](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L478)

Character position

***

### type

> __type__: `string`

Defined in: [src/parsers/dom/DOMParser.ts:476](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L476)

Error type
