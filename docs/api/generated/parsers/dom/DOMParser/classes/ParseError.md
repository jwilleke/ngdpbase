[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/dom/DOMParser](../README.md) / ParseError

# Class: ParseError

Defined in: src/parsers/dom/DOMParser.ts:474

Custom error class for parse errors

## Extends

- `Error`

## Constructors

### Constructor

> __new ParseError__(`type`, `position`, `line`, `column`, `message`, `cause?`): `ParseError`

Defined in: src/parsers/dom/DOMParser.ts:496

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

> `optional` __cause?__: `Error`

Defined in: src/parsers/dom/DOMParser.ts:484

Underlying error

#### Overrides

`Error.cause`

***

### column

> __column__: `number`

Defined in: src/parsers/dom/DOMParser.ts:482

Column number

***

### line

> __line__: `number`

Defined in: src/parsers/dom/DOMParser.ts:480

Line number

***

### position

> __position__: `number`

Defined in: src/parsers/dom/DOMParser.ts:478

Character position

***

### type

> __type__: `string`

Defined in: src/parsers/dom/DOMParser.ts:476

Error type
