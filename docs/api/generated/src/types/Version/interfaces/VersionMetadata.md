[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Version](../README.md) / VersionMetadata

# Interface: VersionMetadata

Defined in: [src/types/Version.ts:16](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L16)

Version metadata

Metadata for a single page version. Stored in manifest.json as the single
source of truth for all version information.

## Properties

### author

> __author__: `string`

Defined in: [src/types/Version.ts:21](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L21)

Author user ID or 'system'

***

### baseVersion?

> `optional` __baseVersion__: `number`

Defined in: [src/types/Version.ts:45](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L45)

If delta, the base version number

***

### changeType

> __changeType__: `"create"` \| `"update"` \| `"minor"` \| `"major"`

Defined in: [src/types/Version.ts:27](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L27)

Change type

***

### compressed

> __compressed__: `boolean`

Defined in: [src/types/Version.ts:39](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L39)

Whether content is compressed (.gz)

***

### compressionRatio?

> `optional` __compressionRatio__: `number`

Defined in: [src/types/Version.ts:48](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L48)

Compression ratio (0-100) if compressed

***

### contentHash

> __contentHash__: `string`

Defined in: [src/types/Version.ts:33](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L33)

SHA-256 hash of content for integrity verification

***

### contentSize

> __contentSize__: `number`

Defined in: [src/types/Version.ts:36](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L36)

Content size in bytes

***

### isDelta

> __isDelta__: `boolean`

Defined in: [src/types/Version.ts:42](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L42)

Whether stored as diff (true) or full content (false)

***

### message?

> `optional` __message__: `string`

Defined in: [src/types/Version.ts:30](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L30)

Change description/commit message

***

### timestamp

> __timestamp__: `string`

Defined in: [src/types/Version.ts:24](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L24)

Timestamp (ISO 8601 format)

***

### version

> __version__: `number`

Defined in: [src/types/Version.ts:18](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L18)

Version number (1-based)
