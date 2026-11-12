[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [converters/ncm/tables](../README.md) / upconvertPipeTables

# Function: upconvertPipeTables()

> __upconvertPipeTables__(`body`, `classes?`): `object`

Defined in: src/converters/ncm/tables.ts:79

Up-convert every GFM pipe table in a Markdown body to the JSPWiki styled form.

## Parameters

### body

`string`

Markdown body (no frontmatter)

### classes?

`string`[] = `DEFAULT_TABLE_CLASSES`

Style classes to wrap each table in (default [DEFAULT\_TABLE\_CLASSES](../variables/DEFAULT_TABLE_CLASSES.md)).
               Pass `[]` to convert the table syntax without any style wrapper.

## Returns

`object`

The rewritten body and the count of tables converted.

### body

> __body__: `string`

### converted

> __converted__: `number`
