[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildSocialMeta](../README.md) / SocialMetaInput

# Interface: SocialMetaInput

Defined in: src/utils/buildSocialMeta.ts:32

## Properties

### applicationName

> __applicationName__: `string`

Defined in: src/utils/buildSocialMeta.ts:48

Site name for `og:site_name`.

***

### baseUrl

> __baseUrl__: `string`

Defined in: src/utils/buildSocialMeta.ts:46

Canonical site base URL, e.g. `https://example.com`.

***

### contentHtml?

> `optional` __contentHtml?__: `string`

Defined in: src/utils/buildSocialMeta.ts:44

Rendered page HTML, used to derive a description and find an image.

***

### metadata?

> `optional` __metadata?__: \{ `author?`: `string`; `description?`: `string`; `lastModified?`: `string`; `slug?`: `string`; `title?`: `string`; \} \| `null`

Defined in: src/utils/buildSocialMeta.ts:36

Frontmatter, when available.

***

### pageName

> __pageName__: `string`

Defined in: src/utils/buildSocialMeta.ts:34

Page name — the fallback title and part of the canonical URL.
