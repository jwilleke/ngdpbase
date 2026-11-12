[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / resolveCurrentKeyword

# Function: resolveCurrentKeyword()

> __resolveCurrentKeyword__\<`T`\>(`value`, `pageName`, `slugify`, `lookup`): `Promise`\<\{ `keyword`: `string`; `results`: `T`[]; \}\>

Defined in: src/utils/pluginFormatters.ts:218

Resolve a keyword parameter that may be the special token `current`
(case-insensitive) to the page's own keyword.

EXIF/media and page keywords follow no single name-vs-slug convention across
a library — some content is tagged with the page NAME (`Dining`, `Travel`),
some with the SLUG (`2026-trip-west`). `current` therefore adapts: it tries
both the page name and its slug and keeps whichever yields more results
(tie / both-empty → name form). This gives page-scoped plugins one
self-scoping syntax that works regardless of how content was tagged:
  [{MediaPlugin keyword='current'}]   [{Search user-keywords='current'}]

Non-`current` values are looked up as-is (single lookup).

## Type Parameters

### T

`T`

## Parameters

### value

`string`

Raw keyword param — `current` (any case) triggers resolution.

### pageName

`string`

Current page name (from plugin context).

### slugify

(`name`) => `string`

Name→slug; pass `ValidationManager.generateSlug` for the
                canonical algorithm, or a simple slugifier as fallback.

### lookup

(`keyword`) => `Promise`\<`T`[]\>

Fetch results for a keyword (e.g. `listByKeyword`, or an
                `advancedSearch`-by-keyword closure).

## Returns

`Promise`\<\{ `keyword`: `string`; `results`: `T`[]; \}\>

The chosen keyword string and its results (results reusable by the
         caller so `current` costs at most two lookups, not three).
