[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [ice/shims/csv](../README.md) / parseCsv

# Function: parseCsv()

> __parseCsv__(`text`, `delimiter?`, `skipLines?`): `Record`\<`string`, `string`\>[]

Defined in: src/ice/shims/csv.ts:46

Parse CSV text into header-keyed row objects. RFC 4180 subset: quoted fields,
escaped quotes (`""`), embedded commas/newlines inside quotes, CRLF/CR/LF line
endings, and a leading UTF-8 BOM. Values are returned verbatim (strings);
header cells are trimmed. Fully-empty lines are skipped.

`skipLines` drops that many leading lines before the header is taken, for
feeds with a caption preamble (#1102). Default 0 — byte-identical to the
previous behaviour.

## Parameters

### text

`string`

### delimiter?

`string` = `','`

### skipLines?

`number` = `0`

## Returns

`Record`\<`string`, `string`\>[]
