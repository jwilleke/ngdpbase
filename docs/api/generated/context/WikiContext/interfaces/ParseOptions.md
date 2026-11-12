[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/WikiContext](../README.md) / ParseOptions

# Interface: ParseOptions

Defined in: src/context/WikiContext.ts:126

Options for MarkupParser.parse()

## Properties

### engine

> __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/context/WikiContext.ts:130

Wiki engine instance

***

### pageContext

> __pageContext__: [`PageContext`](PageContext.md)

Defined in: src/context/WikiContext.ts:128

Page-specific context

***

### wikiContext?

> `optional` __wikiContext?__: `unknown`

Defined in: src/context/WikiContext.ts:137

Optional reference to the parent WikiContext (#629). When present,
ParseContext getters delegate user/page-data lookups to it instead of
reading the constructor-time `pageContext` snapshot, keeping the
WikiContext as the single source of truth across the parse run.
