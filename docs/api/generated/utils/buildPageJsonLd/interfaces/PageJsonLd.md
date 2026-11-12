[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildPageJsonLd](../README.md) / PageJsonLd

# Interface: PageJsonLd

Defined in: src/utils/buildPageJsonLd.ts:48

Output shape — a subset of schema.org `Article` (no `articleBody` etc.).

## Properties

### @context

> __@context__: `"https://schema.org"`

Defined in: src/utils/buildPageJsonLd.ts:49

***

### @id

> __@id__: `string`

Defined in: src/utils/buildPageJsonLd.ts:62

***

### @type

> __@type__: `"Article"` \| `"CreativeWork"` \| `"BlogPosting"` \| `"TechArticle"` \| `"NewsArticle"` \| `"ScholarlyArticle"` \| `"MedicalScholarlyArticle"` \| `"Report"` \| `"SatiricalArticle"` \| `"APIReference"` \| `"SocialMediaPosting"` \| `"DiscussionForumPosting"` \| `"AdvertiserContentArticle"`

Defined in: src/utils/buildPageJsonLd.ts:58

JSON-LD render @type. Default `'Article'` (matches the internal `Article`
record); operator-configurable Article subtypes via the
`ngdpbase.schema-types` config block (per #791). Includes the shipped-
subtype set; operators may configure non-Article schema.org types per
deployment but consumers should defensively treat `@type` as `string`
when handling operator-overridden values.

***

### articleSection?

> `optional` __articleSection?__: `string`

Defined in: src/utils/buildPageJsonLd.ts:71

***

### author?

> `optional` __author?__: `JsonLdPerson`

Defined in: src/utils/buildPageJsonLd.ts:69

***

### dateCreated?

> `optional` __dateCreated?__: `string`

Defined in: src/utils/buildPageJsonLd.ts:67

***

### dateModified?

> `optional` __dateModified?__: `string`

Defined in: src/utils/buildPageJsonLd.ts:68

***

### description?

> `optional` __description?__: `string`

Defined in: src/utils/buildPageJsonLd.ts:66

***

### editor?

> `optional` __editor?__: `JsonLdPerson`

Defined in: src/utils/buildPageJsonLd.ts:70

***

### identifier?

> `optional` __identifier?__: `string`

Defined in: src/utils/buildPageJsonLd.ts:63

***

### inLanguage?

> `optional` __inLanguage?__: `string`

Defined in: src/utils/buildPageJsonLd.ts:73

***

### keywords?

> `optional` __keywords?__: `string`[]

Defined in: src/utils/buildPageJsonLd.ts:72

***

### name

> __name__: `string`

Defined in: src/utils/buildPageJsonLd.ts:65

***

### url

> __url__: `string`

Defined in: src/utils/buildPageJsonLd.ts:64
