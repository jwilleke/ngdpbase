[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [ice/shims/takeout](../README.md) / TakeoutPageData

# Interface: TakeoutPageData

Defined in: src/ice/shims/takeout.ts:56

A page of a takeout: the `data` of its item; the body is the item's `text`.

## Properties

### entry

> __entry__: `"page"`

Defined in: src/ice/shims/takeout.ts:57

***

### files

> __files__: [`TakeoutLinkedFile`](TakeoutLinkedFile.md)[]

Defined in: src/ice/shims/takeout.ts:65

The takeout's files its body links to.

***

### metadata

> __metadata__: `Record`\<`string`, `unknown`\>

Defined in: src/ice/shims/takeout.ts:63

The frontmatter, as written.

***

### title

> __title__: `string`

Defined in: src/ice/shims/takeout.ts:59

From the frontmatter, else the file's name.

***

### uuid?

> `optional` __uuid?__: `string`

Defined in: src/ice/shims/takeout.ts:61

From the frontmatter. Absent for a page written by hand.
