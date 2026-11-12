[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Version](../README.md) / VersionHistoryEntry

# Interface: VersionHistoryEntry

Defined in: src/types/Version.ts:137

Version history entry

Simplified version info for history listings.

## Properties

### author

> __author__: `string`

Defined in: src/types/Version.ts:142

Author user ID or 'system'

***

### changeType

> __changeType__: `"major"` \| `"minor"` \| `"update"` \| `"create"`

Defined in: src/types/Version.ts:148

Change type

***

### compressed

> __compressed__: `boolean`

Defined in: src/types/Version.ts:157

Whether compressed

***

### contentSize

> __contentSize__: `number`

Defined in: src/types/Version.ts:154

Content size in bytes

***

### message?

> `optional` __message?__: `string`

Defined in: src/types/Version.ts:151

Change description

***

### timestamp

> __timestamp__: `string`

Defined in: src/types/Version.ts:145

Timestamp (ISO 8601 format)

***

### version

> __version__: `number`

Defined in: src/types/Version.ts:139

Version number
