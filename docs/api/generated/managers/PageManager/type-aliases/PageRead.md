[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / PageRead

# Type Alias: PageRead\<T\>

> __PageRead__\<`T`\> = \{ `metadata`: [`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md); `name`: `string`; `ok`: `true`; `value`: `T`; \} \| \{ `ok`: `false`; `refusal`: [`PageReadRefusal`](PageReadRefusal.md); \}

Defined in: src/managers/PageManager.ts:263

The answer of a deciding page read (#1622): the value, with the name and
metadata the `page-read` decision was made on, or why there is none.

## Type Parameters

### T

`T`
