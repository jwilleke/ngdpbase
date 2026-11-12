[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageNotes](../README.md) / PageNotesTurnedOffError

# Class: PageNotesTurnedOffError

Defined in: src/utils/pageNotes.ts:176

A footnote or comment write refused because that kind is turned off for the page (#1951). Routes answer it with 403.

## Extends

- `Error`

## Constructors

### Constructor

> __new PageNotesTurnedOffError__(`kind`): `PageNotesTurnedOffError`

Defined in: src/utils/pageNotes.ts:178

#### Parameters

##### kind

[`PageNotesKind`](../type-aliases/PageNotesKind.md)

#### Returns

`PageNotesTurnedOffError`

#### Overrides

`Error.constructor`

## Properties

### kind

> `readonly` __kind__: [`PageNotesKind`](../type-aliases/PageNotesKind.md)

Defined in: src/utils/pageNotes.ts:177
