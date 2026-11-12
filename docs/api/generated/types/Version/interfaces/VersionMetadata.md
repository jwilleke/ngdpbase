[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Version](../README.md) / VersionMetadata

# Interface: VersionMetadata

Defined in: src/types/Version.ts:16

Version metadata

Metadata for a single page version. Stored in manifest.json as the single
source of truth for all version information.

## Properties

### author

> __author__: `string`

Defined in: src/types/Version.ts:21

Author user ID or 'system'

***

### baseVersion?

> `optional` __baseVersion?__: `number`

Defined in: src/types/Version.ts:45

If delta, the base version number

***

### changeType

> __changeType__: `"major"` \| `"minor"` \| `"update"` \| `"create"`

Defined in: src/types/Version.ts:27

Change type

***

### compressed

> __compressed__: `boolean`

Defined in: src/types/Version.ts:39

Whether content is compressed (.gz)

***

### compressionRatio?

> `optional` __compressionRatio?__: `number`

Defined in: src/types/Version.ts:48

Compression ratio (0-100) if compressed

***

### contentHash

> __contentHash__: `string`

Defined in: src/types/Version.ts:33

SHA-256 hash of content for integrity verification

***

### contentSize

> __contentSize__: `number`

Defined in: src/types/Version.ts:36

Content size in bytes

***

### isDelta

> __isDelta__: `boolean`

Defined in: src/types/Version.ts:42

Whether stored as diff (true) or full content (false)

***

### message?

> `optional` __message?__: `string`

Defined in: src/types/Version.ts:30

Change description/commit message

***

### timestamp

> __timestamp__: `string`

Defined in: src/types/Version.ts:24

Timestamp (ISO 8601 format)

***

### version

> __version__: `number`

Defined in: src/types/Version.ts:18

Version number (1-based)
