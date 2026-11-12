[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/filters/BaseFilter](../README.md) / FilterPhase

# Type Alias: FilterPhase

> __FilterPhase__ = `"markup"` \| `"html"`

Defined in: src/parsers/filters/BaseFilter.ts:32

Pipeline phase a filter operates in (#614).

- `'markup'` (default) — runs on raw markdown/JSPWiki content before
  markdown rendering. ValidationFilter, SpamFilter operate here.
- `'html'` — runs on rendered HTML after markdown-it. SecurityFilter
  (XSS prevention, dangerous-tag stripping, attribute allow-listing)
  operates here, since its rules target HTML constructs that don't
  exist in raw markdown.
