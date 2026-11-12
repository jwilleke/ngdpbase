[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/frontmatterFieldRewrite](../README.md) / rewriteFrontmatterFields

# Function: rewriteFrontmatterFields()

> __rewriteFrontmatterFields__(`input`, `changes`, `entries?`): `string` \| `null`

Defined in: src/utils/frontmatterFieldRewrite.ts:57

## Parameters

### input

`string`

The page file as stored: `---`, YAML, `---`, body (a UTF-8 byte-order mark is kept)

### changes

`Record`\<`string`, \{ `from`: `string`; `to`: `string`; \}\>

field → `{ from, to }`: the text the field holds now and what it becomes

### entries?

`ReadonlyMap`\<`string`, `string`\> = `...`

`audience` entry → what it becomes

## Returns

`string` \| `null`

The file with only those lines changed, or null when any change cannot be made that way
