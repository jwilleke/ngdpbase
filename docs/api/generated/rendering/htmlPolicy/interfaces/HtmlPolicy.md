[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [rendering/htmlPolicy](../README.md) / HtmlPolicy

# Interface: HtmlPolicy

Defined in: src/rendering/htmlPolicy.ts:53

The policy, read from configuration. There each list is a set kept as a map
of `name: true` (#1612), so a layer adds or removes one entry without
restating the rest; here it is the enabled names.

## Properties

### attributes

> __attributes__: `Record`\<`string`, `string`[]\>

Defined in: src/rendering/htmlPolicy.ts:57

Attributes allowed per tag; `*` applies to every allowed tag.

***

### schemes

> __schemes__: `string`[]

Defined in: src/rendering/htmlPolicy.ts:59

URL schemes allowed in URL attributes (`href`, `src`, …). Relative URLs are always allowed.

***

### schemesByTag

> __schemesByTag__: `Record`\<`string`, `string`[]\>

Defined in: src/rendering/htmlPolicy.ts:61

A tag's own scheme set, used instead of `schemes` for that tag (`schemes-by-tag`).

***

### tags

> __tags__: `string`[]

Defined in: src/rendering/htmlPolicy.ts:55

Tags an author may write.
