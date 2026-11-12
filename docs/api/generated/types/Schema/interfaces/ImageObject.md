[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Schema](../README.md) / ImageObject

# Interface: ImageObject

Defined in: src/types/Schema.ts:244

ImageObject — still images.

Adds dimensions, GPS location, structured EXIF, and the orientation
render hint. Pages do not get any of these.

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

> __@type__: `"ImageObject"`

Defined in: src/types/Schema.ts:245

The CreativeWork subtype — discriminator for the union.
Drives which type-specific extension fields apply.

#### Overrides

[`CreativeWorkBase`](CreativeWorkBase.md).[`@type`](CreativeWorkBase.md#type)

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

### contentLocation?

> `optional` __contentLocation?__: [`Place`](Place.md)

Defined in: src/types/Schema.ts:258

GPS location wrapped as schema.org Place + GeoCoordinates.
Surfaced when the source carries GPS tags (Decision 12 — no
platform-layer opt-out).

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

### encodingFormat?

> `optional` __encodingFormat?__: `string`

Defined in: src/types/Schema.ts:184

MIME type.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`encodingFormat`](CreativeWorkBase.md#encodingformat)

***

### exifData?

> `optional` __exifData?__: [`ExifCameraData`](ExifCameraData.md)

Defined in: src/types/Schema.ts:265

EXIF camera/lens data — internal structured shape (Decision schema
mismatch ⚠️). The JSON-LD render mapper converts this to a
`Property` array at render time.

***

### height?

> `optional` __height?__: `number`

Defined in: src/types/Schema.ts:251

Pixel height — from EXIF ImageHeight.

***

### identifier?

> `optional` __identifier?__: `string`

Defined in: src/types/Schema.ts:145

Opaque rename-stable internal ID (Decision 4).
For pages: frontmatter `uuid`. For media: sha256-derived item id.
Optional at the base because some types (legacy attachments) may not
have one; required on Article (narrowed below).

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`identifier`](CreativeWorkBase.md#identifier)

***

### keywords?

> `optional` __keywords?__: `string`[]

Defined in: src/types/Schema.ts:172

Tags / keywords — merged user-keywords + system-keywords for pages.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`keywords`](CreativeWorkBase.md#keywords)

***

### name

> __name__: `string`

Defined in: src/types/Schema.ts:148

Display title — required.

#### Inherited from

[`CreativeWorkBase`](CreativeWorkBase.md).[`name`](CreativeWorkBase.md#name)

***

### ngdp:orientation?

> `optional` __ngdp:orientation?__: `number`

Defined in: src/types/Schema.ts:271

EXIF Orientation (1–8). JSON-LD render policy: __omit__ (internal
render hint; the thumbnail renderer rotates based on this).

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

### width?

> `optional` __width?__: `number`

Defined in: src/types/Schema.ts:248

Pixel width — from EXIF ImageWidth.
