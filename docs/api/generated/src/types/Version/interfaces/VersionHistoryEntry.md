[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Version](../README.md) / VersionHistoryEntry

# Interface: VersionHistoryEntry

Defined in: [src/types/Version.ts:137](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L137)

Version history entry

Simplified version info for history listings.

## Properties

### author

> __author__: `string`

Defined in: [src/types/Version.ts:142](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L142)

Author user ID or 'system'

***

### changeType

> __changeType__: `"create"` \| `"update"` \| `"minor"` \| `"major"`

Defined in: [src/types/Version.ts:148](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L148)

Change type

***

### compressed

> __compressed__: `boolean`

Defined in: [src/types/Version.ts:157](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L157)

Whether compressed

***

### contentSize

> __contentSize__: `number`

Defined in: [src/types/Version.ts:154](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L154)

Content size in bytes

***

### message?

> `optional` __message__: `string`

Defined in: [src/types/Version.ts:151](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L151)

Change description

***

### timestamp

> __timestamp__: `string`

Defined in: [src/types/Version.ts:145](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L145)

Timestamp (ISO 8601 format)

***

### version

> __version__: `number`

Defined in: [src/types/Version.ts:139](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L139)

Version number
