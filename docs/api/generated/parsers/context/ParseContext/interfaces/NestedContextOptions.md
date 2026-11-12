[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/context/ParseContext](../README.md) / NestedContextOptions

# Interface: NestedContextOptions

Defined in: src/parsers/context/ParseContext.ts:97

Nested context structure (from WikiContext.toParseOptions())

## Properties

### engine?

> `optional` __engine?__: [`WikiEngine`](WikiEngine.md)

Defined in: src/parsers/context/ParseContext.ts:99

***

### pageContext

> __pageContext__: [`PageContext`](PageContext.md)

Defined in: src/parsers/context/ParseContext.ts:98

***

### wikiContext?

> `optional` __wikiContext?__: [`WikiContextLike`](WikiContextLike.md)

Defined in: src/parsers/context/ParseContext.ts:106

# 629: optional reference to the parent WikiContext. When provided,
ParseContext getters delegate user/page-data lookups to it instead of
the constructor-time snapshot in `pageContext`. Lets the WikiContext
stay the single source of truth across the parse run.
