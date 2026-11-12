[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Schema](../README.md) / Article

# Interface: Article

Defined in: src/types/Schema.ts:198

Article — ngdp pages.

Adds page-specific fields: body text for search, wiki-link mentions,
version, language, the mutable `editor` (last-saver) field, and the
`ngdp:` namespace fields for category and slug.

## Extends

- [`CreativeWorkBase`](CreativeWorkBase.md)

## Properties

### @id

> __@id__: `string`

Defined in: src/types/Schema.ts:131

Canonical dereferenceable URL (Decision 4).
Pages: `/view/<slug>`. Media: `/media/file/<id>`.
Changes when the page slug changes; not the same as `identifier`.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`@id`](CreativeWorkBase.md#id)

***

### @type

> __@type__: `"Article"`

Defined in: src/types/Schema.ts:199

The CreativeWork subtype — discriminator for the union.
Drives which type-specific extension fields apply.

#### Overrides

[`CreativeWorkBase`](CreativeWorkBase.md).[`@type`](CreativeWorkBase.md#type)

***

### articleBody?

> `optional` __articleBody?__: `string`

Defined in: src/types/Schema.ts:205

Markdown body — feeds the search index.

***

### author?

> `optional` __author?__: `string` \| [`Person`](Person.md)

Defined in: src/types/Schema.ts:169

Immutable original creator (Decision 10 — see docs/GLOSSARY.md).
String OR Person object. For pages: sourced from page-index
`creator` / frontmatter `page-creator`. For media: EXIF Artist /
IPTC By-line. Distinct from `editor` (Article extension, mutable).

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`author`](CreativeWorkBase.md#author)

***

### contentUrl?

> `optional` __contentUrl?__: `string`

Defined in: src/types/Schema.ts:178

Binary content URL — distinct from the landing `url`. Media only.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`contentUrl`](CreativeWorkBase.md#contenturl)

***

### dateCreated?

> `optional` __dateCreated?__: `string`

Defined in: src/types/Schema.ts:154

ISO 8601 timestamp — when the original was authored or captured.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`dateCreated`](CreativeWorkBase.md#datecreated)

***

### dateModified?

> `optional` __dateModified?__: `string`

Defined in: src/types/Schema.ts:161

ISO 8601 timestamp — last edit / file mtime.
Per Decision 13: always the latest revision's timestamp on versioned
pages, even when viewing an older revision.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`dateModified`](CreativeWorkBase.md#datemodified)

***

### description?

> `optional` __description?__: `string`

Defined in: src/types/Schema.ts:151

Caption / abstract / image alt-text.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`description`](CreativeWorkBase.md#description)

***

### editor?

> `optional` __editor?__: `string` \| [`Person`](Person.md)

Defined in: src/types/Schema.ts:222

Mutable last-saver (Decision 10 — see docs/GLOSSARY.md).
Sourced from frontmatter `lastModifiedBy`. Updated on every save.
Distinct from `author` (immutable, in base). Paired with
`dateModified` (latest-revision timestamp + user).

***

### encodingFormat?

> `optional` __encodingFormat?__: `string`

Defined in: src/types/Schema.ts:184

MIME type.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`encodingFormat`](CreativeWorkBase.md#encodingformat)

***

### identifier

> __identifier__: `string`

Defined in: src/types/Schema.ts:202

identifier is required on Article (the frontmatter `uuid`).

#### Overrides

[`CreativeWorkBase`](CreativeWorkBase.md).[`identifier`](CreativeWorkBase.md#identifier)

***

### inLanguage?

> `optional` __inLanguage?__: `string`

Defined in: src/types/Schema.ts:214

BCP-47 language tag from frontmatter or system default.

***

### keywords?

> `optional` __keywords?__: `string`[]

Defined in: src/types/Schema.ts:172

Tags / keywords — merged user-keywords + system-keywords for pages.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`keywords`](CreativeWorkBase.md#keywords)

***

### mentions?

> `optional` __mentions?__: [`Mention`](Mention.md)[]

Defined in: src/types/Schema.ts:208

Wiki-link extraction — `[Page Name]` references.

***

### name

> __name__: `string`

Defined in: src/types/Schema.ts:148

Display title — required.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`name`](CreativeWorkBase.md#name)

***

### ngdp:category?

> `optional` __ngdp:category?__: `string`

Defined in: src/types/Schema.ts:228

ngdp page category. JSON-LD render policy: __map__ to schema.org
`about` / `genre` (Decision 5).

***

### ngdp:slug?

> `optional` __ngdp:slug?__: `string`

Defined in: src/types/Schema.ts:235

Frontmatter `slug`. JSON-LD render policy: __omit__ (redundant with
`@id`). Decision B (2026-05-20): kept on Article only, not promoted
to base — only pages author slugs today.

***

### thumbnailUrl?

> `optional` __thumbnailUrl?__: `string`

Defined in: src/types/Schema.ts:181

Thumbnail URL when the type has a visual representation.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`thumbnailUrl`](CreativeWorkBase.md#thumbnailurl)

***

### url

> __url__: `string`

Defined in: src/types/Schema.ts:175

Canonical landing URL within ngdpbase — required.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`url`](CreativeWorkBase.md#url)

***

### version?

> `optional` __version?__: `string`

Defined in: src/types/Schema.ts:211

Page version string from the page provider.
