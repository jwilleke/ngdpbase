[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Asset](../README.md) / UNKNOWN\_UPLOADER

# Variable: UNKNOWN\_UPLOADER

> `const` __UNKNOWN\_UPLOADER__: `"Unknown"` = `'Unknown'`

Defined in: src/types/Asset.ts:18

What an attachment record says when it was stored with no uploader, in the
pool's `author.name`, and what `uploadedBy` shows for a record with none.
Only records written before #1926 carry it: a new upload names its
uploader's username or is refused. Not a user; the files layer reads it as
"no owner" (#1852).
