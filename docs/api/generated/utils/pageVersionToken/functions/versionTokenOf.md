[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageVersionToken](../README.md) / versionTokenOf

# Function: versionTokenOf()

> __versionTokenOf__(`metadata`): `string` \| `null`

Defined in: src/utils/pageVersionToken.ts:46

The comparison token for a page's current state, or null when the page has
none — a page never saved through the normal path, or one whose frontmatter
predates `lastModified`.

Null means "cannot be compared", and callers must treat that as *allow*. A
missing token is not evidence of a conflict, and refusing saves on pages the
check cannot reason about would break editing for the oldest content in the
wiki.

## Parameters

### metadata

[`VersionedMetadataLike`](../interfaces/VersionedMetadataLike.md) \| `null` \| `undefined`

## Returns

`string` \| `null`
