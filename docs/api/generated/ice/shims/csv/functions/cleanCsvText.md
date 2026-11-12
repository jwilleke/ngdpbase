[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [ice/shims/csv](../README.md) / cleanCsvText

# Function: cleanCsvText()

> __cleanCsvText__(`text`, `delimiter?`): `object`

Defined in: src/ice/shims/csv.ts:135

Clean CSV text before it is kept as a file (#2149): HTML is taken out of
every cell, and a cell a spreadsheet would run as a formula gets a leading
`'`, so it shows as text (the usual CSV-injection defence). Only the cells
that change are rewritten, quoted; every other byte is kept as it was.
Returns how many cells of each kind were cleaned.

## Parameters

### text

`string`

### delimiter?

`string` = `','`

## Returns

`object`

### formulas

> __formulas__: `number`

### html

> __html__: `number`

### text

> __text__: `string`
