[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / converters/ncm/placeholder

# converters/ncm/placeholder

NCM dropped-content placeholder (#728 spec §3.3, Phase 2 Slice 1)

When the normalizer drops content (stripped HTML, rejected image, …) it
leaves a deterministic, NCM-valid blockquote so a reader later sees *that*
and *why* something was removed — never a silent gap. This is the durable
signal where there is no preview (bulk import, #685, MCP).

HARD RULE (idempotence, ties to spec §3.1): the normalizer must recognise
its own placeholder and pass it through byte-identical on re-run, so
convert-existing-page / #685 re-runs never re-wrap or duplicate it.

Single-line blockquote on purpose (not an HTML comment — that would be
stripped and invisible; not a plugin — that would add a render path).

## Functions

- [formatDroppedPlaceholder](functions/formatDroppedPlaceholder.md)
- [isDroppedPlaceholderLine](functions/isDroppedPlaceholderLine.md)
