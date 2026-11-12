[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Schema](../README.md) / CreativeWorkBase

# Interface: CreativeWorkBase

Defined in: src/types/Schema.ts:125

Common base for every CreativeWork subtype.

Per docs/schemas.md "common base" table. Every consumer surface
(search index, picker tiles, picker filters, page header, JSON-LD)
reads these.

## Extended by

- [`Article`](Article.md)
- [`ImageObject`](ImageObject.md)
- [`VideoObject`](VideoObject.md)
- [`AudioObject`](AudioObject.md)
- [`DigitalDocument`](DigitalDocument.md)

## Properties

### @id

> __@id__: `string`

Defined in: src/types/Schema.ts:131

Canonical dereferenceable URL (Decision 4).
Pages: `/view/<slug>`. Media: `/media/file/<id>`.
Changes when the page slug changes; not the same as `identifier`.

***

### @type

> __@type__: [`SchemaType`](../type-aliases/SchemaType.md)

Defined in: src/types/Schema.ts:137

The CreativeWork subtype — discriminator for the union.
Drives which type-specific extension fields apply.

***

### author?

> `optional` __author?__: `string` \| [`Person`](Person.md)

Defined in: src/types/Schema.ts:169

Immutable original creator (Decision 10 — see docs/GLOSSARY.md).
String OR Person object. For pages: sourced from page-index
`creator` / frontmatter `page-creator`. For media: EXIF Artist /
IPTC By-line. Distinct from `editor` (Article extension, mutable).

***

### contentUrl?

> `optional` __contentUrl?__: `string`

Defined in: src/types/Schema.ts:178

Binary content URL — distinct from the landing `url`. Media only.

***

### dateCreated?

> `optional` __dateCreated?__: `string`

Defined in: src/types/Schema.ts:154

ISO 8601 timestamp — when the original was authored or captured.

***

### dateModified?

> `optional` __dateModified?__: `string`

Defined in: src/types/Schema.ts:161

ISO 8601 timestamp — last edit / file mtime.
Per Decision 13: always the latest revision's timestamp on versioned
pages, even when viewing an older revision.

***

### description?

> `optional` __description?__: `string`

Defined in: src/types/Schema.ts:151

Caption / abstract / image alt-text.

***

### encodingFormat?

> `optional` __encodingFormat?__: `string`

Defined in: src/types/Schema.ts:184

MIME type.

***

### identifier?

> `optional` __identifier?__: `string`

Defined in: src/types/Schema.ts:145

Opaque rename-stable internal ID (Decision 4).
For pages: frontmatter `uuid`. For media: sha256-derived item id.
Optional at the base because some types (legacy attachments) may not
have one; required on Article (narrowed below).

***

### keywords?

> `optional` __keywords?__: `string`[]

Defined in: src/types/Schema.ts:172

Tags / keywords — merged user-keywords + system-keywords for pages.

***

### name

> __name__: `string`

Defined in: src/types/Schema.ts:148

Display title — required.

***

### thumbnailUrl?

> `optional` __thumbnailUrl?__: `string`

Defined in: src/types/Schema.ts:181

Thumbnail URL when the type has a visual representation.

***

### url

> __url__: `string`

Defined in: src/types/Schema.ts:175

Canonical landing URL within ngdpbase — required.
