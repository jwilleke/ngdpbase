[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / converters/ncm/links

# converters/ncm/links

NCM link normalization (#728 spec §2.4, Phase 2 Slice 2)

The upstream converters (`HtmlConverter` via turndown, `JSPWikiConverter`)
emit CommonMark `[text](url)` for external links. NCM does __not__ use
CommonMark link syntax — it uses the `LinkParserHandler` JSPWiki forms:

- external (absolute http/https) → `[text|url|target="_blank"]`
  (the renderer adds `rel="noopener noreferrer"`)
- internal / relative          → `[text|target]`
- other schemes (mailto:, ftp:) → left as-is (conservative; not NCM-ified)

Idempotent by construction: it only matches CommonMark `](…)` which it
eliminates, so a second pass is a no-op. Images (`![alt](src)`) are left
untouched — image→attachment is the §2.2 rule (#728 S4), not a link concern.

## Functions

- [normalizeLinks](functions/normalizeLinks.md)
