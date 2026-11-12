[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Asset](../README.md) / AssetRecord

# Interface: AssetRecord

Defined in: src/types/Asset.ts:184

Unified asset record returned by all AssetProviders.

Field names follow schema.org CreativeWork / MediaObject where a direct
equivalent exists. Non-schema fields (providerId, filename, dimensions,
isPrivate, metadata, insertSnippet) are kept under their natural names.

Schema.org equivalents used:
  name            ← schema.org/name          (human-readable title)
  description     ← schema.org/description
  keywords        ← schema.org/keywords
  encodingFormat  ← schema.org/encodingFormat (MIME type)
  contentSize     ← schema.org/contentSize    (bytes)
  url             ← schema.org/url
  thumbnailUrl    ← schema.org/thumbnailUrl
  dateCreated     ← schema.org/dateCreated
  author          ← schema.org/author
  dateModified    ← schema.org/dateModified
  mentions        ← schema.org/mentions       (pages that reference this asset)

Covers all DAM core attribute categories:
  Identification  — id, providerId, filename, name
  Descriptive     — description, keywords
  Technical       — encodingFormat, contentSize, dimensions, url, thumbnailUrl
  Administrative  — dateCreated, author, dateModified
  Rights & Usage  — usageRights, usageStats
  Linkage         — mentions, isPrivate
  Open metadata   — metadata (EXIF, IPTC, custom fields)
  Editor helper   — insertSnippet

## Properties

### author?

> `optional` __author?__: `string`

Defined in: src/types/Asset.ts:233

Username of the uploader or content creator / owner — schema.org/author

***

### bitrate?

> `optional` __bitrate?__: `number`

Defined in: src/types/Asset.ts:227

Average bitrate in bits/second for video/audio — schema.org/bitrate.

***

### contentSize?

> `optional` __contentSize?__: `number`

Defined in: src/types/Asset.ts:213

File size in bytes — schema.org/contentSize

***

### dateCreated?

> `optional` __dateCreated?__: `string`

Defined in: src/types/Asset.ts:231

ISO 8601 timestamp when the asset was first ingested / uploaded — schema.org/dateCreated

***

### dateModified?

> `optional` __dateModified?__: `string`

Defined in: src/types/Asset.ts:235

ISO 8601 timestamp of the last metadata or file modification — schema.org/dateModified

***

### description?

> `optional` __description?__: `string`

Defined in: src/types/Asset.ts:197

Detailed description or caption; used for searchability — schema.org/description

***

### dimensions?

> `optional` __dimensions?__: [`AssetDimensions`](AssetDimensions.md)

Defined in: src/types/Asset.ts:215

Image or video dimensions

***

### duration?

> `optional` __duration?__: `string`

Defined in: src/types/Asset.ts:225

Playback duration for video/audio as ISO 8601 duration string,
e.g. "PT1M30S" for 1 minute 30 seconds — schema.org/duration.
Populated from ExifTool MediaDuration / Duration tags.

***

### editor?

> `optional` __editor?__: `string`

Defined in: src/types/Asset.ts:237

Username of whoever last changed it, when the provider records one — schema.org/editor

***

### encodingFormat

> __encodingFormat__: `string`

Defined in: src/types/Asset.ts:211

MIME type (e.g. "image/jpeg") — schema.org/encodingFormat

***

### filename

> __filename__: `string`

Defined in: src/types/Asset.ts:191

Original filename (basename)

***

### id

> __id__: `string`

Defined in: src/types/Asset.ts:187

Store-internal unique identifier

***

### insertSnippet

> __insertSnippet__: `string`

Defined in: src/types/Asset.ts:257

Wiki markup snippet ready to paste into the editor

***

### isPrivate?

> `optional` __isPrivate?__: `boolean`

Defined in: src/types/Asset.ts:249

Whether the asset is gated by a private wiki page

***

### keywordPaths?

> `optional` __keywordPaths?__: `string`[]

Defined in: src/types/Asset.ts:207

Hierarchical tag paths (#917) read from XMP-lr:HierarchicalSubject and
XMP-digiKam:TagsList, each a `/`-joined path of canonical keyword values
(e.g. `places/usa/colorado/denver`; leaf = last segment). Present only when
the file carries hierarchical tags; the flat `keywords` remain the primary
surface. Used to preserve/repair digiKam tag trees on write-back (#918).

***

### keywords

> __keywords__: `string`[]

Defined in: src/types/Asset.ts:199

Controlled-vocabulary keywords / tags for categorisation — schema.org/keywords

***

### mentions

> __mentions__: `string`[]

Defined in: src/types/Asset.ts:247

Wiki pages this asset appears on — schema.org/mentions

***

### metadata

> __metadata__: [`AssetMetadata`](AssetMetadata.md)

Defined in: src/types/Asset.ts:253

Structured metadata bag (EXIF, IPTC, XMP, custom fields) — see AssetMetadata

***

### name?

> `optional` __name?__: `string`

Defined in: src/types/Asset.ts:193

Human-readable title; distinct from filename (e.g. from EXIF Title or user input) — schema.org/name

***

### providerId

> __providerId__: `string`

Defined in: src/types/Asset.ts:189

Which provider owns this record (e.g. 'local', 'media-library')

***

### thumbnailUrl?

> `optional` __thumbnailUrl?__: `string`

Defined in: src/types/Asset.ts:219

Thumbnail URL — schema.org/thumbnailUrl

***

### url

> __url__: `string`

Defined in: src/types/Asset.ts:217

Browsable / embeddable URL — schema.org/url

***

### usageRights?

> `optional` __usageRights?__: [`AssetUsageRights`](AssetUsageRights.md)

Defined in: src/types/Asset.ts:241

Licensing and rights information

***

### usageStats?

> `optional` __usageStats?__: [`AssetUsageStats`](AssetUsageStats.md)

Defined in: src/types/Asset.ts:243

Download counts and access statistics
