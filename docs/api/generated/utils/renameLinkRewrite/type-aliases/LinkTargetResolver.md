[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/renameLinkRewrite](../README.md) / LinkTargetResolver

# Type Alias: LinkTargetResolver

> __LinkTargetResolver__ = (`base`, `targetIsDisplayText`) => `string` \| `null`

Defined in: src/utils/renameLinkRewrite.ts:122

What a caller decides about one link target it was shown.

## Parameters

### base

`string`

The target as written, without any `#fragment`.

### targetIsDisplayText

`boolean`

True for `[Title]`, where the target IS the
  text the reader sees, and false for the piped forms, where it is not.
  The rewriting rule differs by form — see the module comment.

## Returns

`string` \| `null`

The target to write instead, or `null` to leave the link alone.
  The fragment is re-attached by the caller; a resolver never sees one.
